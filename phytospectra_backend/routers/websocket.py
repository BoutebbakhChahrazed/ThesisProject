from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.connection_manager import manager
from core.auth import verify_websocket_token
from services import supabase_service
from core.config import settings
from services.pipeline import process_image
import os
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/dashboard")
async def dashboard_feed(websocket: WebSocket):
    await verify_websocket_token(websocket)
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.websocket("/ws/ingest")
async def ingest_result(websocket: WebSocket):
    await verify_websocket_token(websocket)
    await websocket.accept()
    try:
        async for data in websocket.iter_json():
            await manager.broadcast(data)
            await supabase_service.save_detection(data)
    except WebSocketDisconnect:
        logger.info("Ingest client disconnected.")


@router.websocket("/ws/analyze/from-storage")
async def ws_analyze_from_storage(websocket: WebSocket):
    # Auth first — before accept(), same pattern as your other routes
    await verify_websocket_token(websocket)
    await websocket.accept()

    try:
        data = await websocket.receive_json()
        object_path = data.get("object_path")
        bucket = data.get("bucket") or settings.SUPABASE_BUCKET_RAW
        flight_id = data.get("flight_id")

        if not object_path:
            await websocket.send_json({"type": "error", "message": "object_path is required"})
            return

        await websocket.send_json({"type": "progress", "message": "Downloading image from storage..."})

        tmp_dir = os.path.join(settings.OUTPUT_FOLDER, "tmp")
        os.makedirs(tmp_dir, exist_ok=True)
        ext = os.path.splitext(object_path)[1] or ".tif"
        tmp_path = os.path.join(tmp_dir, f"input_{uuid.uuid4().hex}{ext}")

        await supabase_service.download_image(
            object_path=object_path,
            bucket=bucket,
            dest_path=tmp_path,
        )

        await websocket.send_json({"type": "progress", "message": "Running classification pipeline..."})

        result = await process_image(tmp_path, flight_id=flight_id)

        await websocket.send_json(result)

    except WebSocketDisconnect:
        logger.info("Analyze client disconnected.")
    except Exception as e:
        logger.exception("ws_analyze_from_storage failed")
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        await websocket.close()