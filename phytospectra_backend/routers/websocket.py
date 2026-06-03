from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.connection_manager import manager
from core.auth import verify_websocket_token
from services import supabase_service
from core.config import settings
from services.pipeline import process_image
from services.calibration import extract_gps_from_exif
import os
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/dashboard")
async def dashboard_feed(websocket: WebSocket):
    await websocket.accept()                      # ← accept first
    user = await verify_websocket_token(websocket)
    if not user:
        return
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.websocket("/ws/ingest")
async def ingest_result(websocket: WebSocket):
    await websocket.accept()                      # ← accept first
    user = await verify_websocket_token(websocket)
    if not user:
        return
    try:
        async for data in websocket.iter_json():
            await manager.broadcast(data)
            await supabase_service.save_detection(data)
    except WebSocketDisconnect:
        logger.info("Ingest client disconnected.")


@router.websocket("/ws/analyze/from-storage")
async def ws_analyze_from_storage(websocket: WebSocket):
    await websocket.accept()                      # ← must be first

    # Auth after accept — reject by sending error + closing, not by refusing upgrade
    user = await verify_websocket_token(websocket)
    if not user:
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close(code=4401)
        return

    tmp_path = None
    try:
        data        = await websocket.receive_json()
        object_path = data.get("object_path")
        bucket      = data.get("bucket") or settings.SUPABASE_BUCKET_RAW
        field_id    = data.get("field_id")
        flight_id   = data.get("flight_id")
        drone_id    = data.get("drone_id")
        image_id    = data.get("image_id")
        user_id     = user["sub"]

        if not object_path:
            await websocket.send_json({"type": "error", "message": "object_path is required"})
            return

        # ── Download ──────────────────────────────────────────────────────
        await websocket.send_json({"type": "progress", "message": "Downloading image from storage…"})

        tmp_dir  = os.path.join(settings.OUTPUT_FOLDER, "tmp")
        os.makedirs(tmp_dir, exist_ok=True)
        ext      = os.path.splitext(object_path)[1].lower() or ".jpg"
        tmp_path = os.path.join(tmp_dir, f"input_{uuid.uuid4().hex}{ext}")

        await supabase_service.download_image(
            object_path=object_path,
            bucket=bucket,
            dest_path=tmp_path,
        )

        if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
            await websocket.send_json({"type": "error", "message": "Download failed or empty file"})
            return

        # ── Resolve image record ──────────────────────────────────────────
        if not image_id:
            existing = await supabase_service.get_image_by_storage_path(object_path, user_id)
            image_id = existing.get("id") if existing else None

        if not image_id:
            await websocket.send_json({"type": "progress", "message": "Saving image record…"})
            gps       = extract_gps_from_exif(tmp_path)
            image_row = await supabase_service.save_image({
                "user_id":       user_id,
                "field_id":      field_id,
                "flight_id":     flight_id,
                "drone_id":      drone_id,
                "storage_path":  object_path,
                "bucket_name":   bucket,
                "gps":           gps,
                "gps_source":    "MAPIR Survey3W EXIF",
                "upload_source": data.get("upload_source", "manual"),
            })
            image_id = image_row.get("id")

        if not image_id:
            await websocket.send_json({"type": "error", "message": "Could not resolve image record"})
            return

        # ── Run pipeline ──────────────────────────────────────────────────
        await websocket.send_json({"type": "progress", "message": "Preprocessing image (RGN → 4-channel + NDVI)…"})
        await websocket.send_json({"type": "progress", "message": "Running ViT classification…"})

        result = await process_image(
            image_path=tmp_path,
            user_id=user_id,
            image_id=image_id,
            field_id=field_id,
            flight_id=flight_id,
            drone_id=drone_id,
        )

        # ── Public URL for original image ─────────────────────────────────
        client          = supabase_service.get_supabase()
        drone_image_url = None
        if client:
            drone_image_url = client.storage.from_(bucket).get_public_url(object_path)

        await websocket.send_json({
            "type":            "result",
            "zone_id":         result.get("segmentation_id") or field_id or "unknown",
            "timestamp":       result.get("timestamp"),
            "gps":             result.get("gps"),
            "health_score":    result.get("health_score"),
            "stress_class":    result.get("stress_class"),
            "confidence":      result.get("confidence"),
            "heatmap_url":     result.get("heatmap_url"),
            "drone_image_url": drone_image_url,
            "storage_path":    object_path,
            "bucket":          bucket,
            "image_id":        image_id,
        })

    except WebSocketDisconnect:
        logger.info("Analyze client disconnected.")
    except Exception as e:
        logger.exception("ws_analyze_from_storage failed")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        try:
            await websocket.close()
        except Exception:
            pass