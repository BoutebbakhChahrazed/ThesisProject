"""
routers/segment_flight.py

POST /api/segment/flight/{flight_id}   — run SegFormer on every image in a flight
GET  /api/segment/flight/{flight_id}   — return cached results (no inference)
POST /api/segment/image/{image_id}     — run SegFormer on a single already-uploaded image

Model: segformer_b0_v5_1.pt
Preprocessing matches the v5.1 training script exactly (see services/segformer_inference.py).
"""

from __future__ import annotations

import io
import json
import logging
import os
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from core.auth import get_current_user
from core.config import settings
from core.connection_manager import manager
from services import supabase_service
from services.calibration import extract_gps_from_exif
from services.segformer_inference import run_segformer

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Segmentation"])


# ── Storage helpers ───────────────────────────────────────────────────────────

def _mask_bucket(source_bucket: str) -> str:
    return f"{source_bucket}-masks"


async def _upload_mask_image(mask_image, source_bucket: str, image_id: str, user_id: str, flight_id: str) -> str:
    """Save colourised mask PNG to Supabase, return public URL."""
    buf = io.BytesIO()
    mask_image.save(buf, format="PNG")
    buf.seek(0)

    mask_filename   = f"mask_{uuid.uuid4().hex[:8]}.png"
    mask_storage    = f"{user_id}/{flight_id or 'noflight'}/{mask_filename}"
    mask_local_path = os.path.join(settings.OUTPUT_FOLDER, mask_filename)
    os.makedirs(settings.OUTPUT_FOLDER, exist_ok=True)

    with open(mask_local_path, "wb") as f:
        f.write(buf.getvalue())

    try:
        mask_url = await supabase_service.upload_image(
            mask_local_path,
            _mask_bucket(source_bucket),
            mask_storage,
        )
    finally:
        try:
            os.remove(mask_local_path)
        except OSError:
            pass

    return mask_url


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _upsert_segmentation(
    image_id: str,
    flight_id: str | None,
    mask_url: str,
    label_counts: dict,
    stats: dict,
    user_id: str,
    field_id: str | None = None,
    drone_id: str | None = None,
    gps: dict | None = None,
) -> dict:
    record = {
        "user_id":               user_id,
        "image_id":              image_id,
        "field_id":              field_id,
        "flight_id":             flight_id,
        "drone_id":              drone_id,
        "heatmap_url":           mask_url,          # reuse heatmap_url column for mask
        "stress_class":          stats["stress_class"],
        "confidence":            stats["confidence"],
        "health_score":          stats["health_score"],
        "health_percentage":     stats["health_percentage"],
        "healthy_pixel_count":   stats["healthy_pixel_count"],
        "stressed_pixel_count":  stats["stressed_pixel_count"],
        "ndvi_mean":             None,               # not computed by SegFormer path
        "gndvi_mean":            None,
        "gps":                   gps,
        # store label_counts as a JSON string in a spare text column if available,
        # or just include it in the broadcast — adapt to your actual schema
    }
    return await supabase_service.save_segmentation(record)


async def _fetch_cached(image_id: str) -> dict | None:
    client = supabase_service.get_supabase()
    if not client:
        return None
    try:
        res = (
            client.table("segmentations")
            .select("*")
            .eq("image_id", image_id)
            .order("processed_at", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        logger.warning(f"Cache lookup failed for image {image_id}: {e}")
        return None


# ── Core per-image processing ─────────────────────────────────────────────────

async def _process_one_image(
    *,
    image_row: dict,
    user_id: str,
    force: bool,
    tmp_dir: str,
) -> dict:
    """Download, segment, upload mask, persist, broadcast — for one image row."""

    image_id     = image_row["id"]
    storage_path = image_row["storage_path"]
    bucket       = image_row.get("bucket_name") or settings.SUPABASE_BUCKET_RAW
    flight_id    = image_row.get("flight_id")
    field_id     = image_row.get("field_id")
    drone_id     = image_row.get("drone_id")

    # Return cached result unless forced
    if not force:
        cached = await _fetch_cached(image_id)
        if cached:
            logger.info(f"Returning cached segmentation for image {image_id}")
            return {
                "image_id":    image_id,
                "mask_url":    cached.get("heatmap_url"),
                "stress_class": cached.get("stress_class"),
                "health_score": cached.get("health_score"),
                "health_percentage": cached.get("health_percentage"),
                "label_counts": {},
                "cached":      True,
            }

    # Download image to temp file
    ext      = os.path.splitext(storage_path)[1].lower() or ".png"
    tmp_path = os.path.join(tmp_dir, f"seg_{uuid.uuid4().hex}{ext}")

    try:
        await supabase_service.download_image(storage_path, bucket, tmp_path)

        if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
            raise RuntimeError(f"Downloaded file is empty: {storage_path}")

        # GPS
        gps = extract_gps_from_exif(tmp_path)

        # ── Run SegFormer ──────────────────────────────────────────────────
        result = run_segformer(tmp_path)   # preprocessing matches training exactly

        stats = {
            "stress_class":         result["stress_class"],
            "confidence":           result["confidence"],
            "health_score":         result["health_score"],
            "health_percentage":    result["health_percentage"],
            "healthy_pixel_count":  result["healthy_pixel_count"],
            "stressed_pixel_count": result["stressed_pixel_count"],
        }

        # Upload colourised mask
        mask_url = await _upload_mask_image(
            result["mask_image"], bucket, image_id, user_id, flight_id or "noflight"
        )

        # Persist segmentation record
        saved = await _upsert_segmentation(
            image_id=image_id,
            flight_id=flight_id,
            mask_url=mask_url,
            label_counts=result["label_counts"],
            stats=stats,
            user_id=user_id,
            field_id=field_id,
            drone_id=drone_id,
            gps=gps,
        )

        payload = {
            "image_id":         image_id,
            "segmentation_id":  saved.get("id"),
            "mask_url":         mask_url,
            "label_counts":     result["label_counts"],
            "gps":              gps,
            "cached":           False,
            **stats,
        }

        # Broadcast over WebSocket (same pattern as ViT pipeline)
        await manager.broadcast(payload)
        logger.info(
            f"Segmented image {image_id} | "
            f"stress={stats['stress_class']} | "
            f"health={stats['health_score']:.1f}%"
        )
        return payload

    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/segment/flight/{flight_id}")
async def segment_flight(
    flight_id: str,
    force: bool = False,
    user: Any = Depends(get_current_user),
) -> dict:
    """
    Run SegFormer segmentation on all images attached to a flight.
    Pass ?force=true to re-run even when a cached result exists.
    """
    user_id = user["sub"]
    logger.info(f"segment_flight called | flight_id={flight_id} | user_id={user_id}")
    client  = supabase_service.get_supabase()
    if not client:
        raise HTTPException(503, "Supabase unavailable")

    # ── Fetch images — user_id is the ownership check, skip flights table ───
    img_res = (
        client.table("images")
        .select("id, storage_path, bucket_name, flight_id, field_id, drone_id")
        .eq("flight_id", flight_id)
        .eq("user_id", user_id)
        .execute()
    )
    flight_images: list[dict] = img_res.data or []
    logger.info(f"Images query returned {len(flight_images)} rows for flight {flight_id}")

    if not flight_images:
        # Try without user_id filter to see if that's the mismatch
        all_res = (
            client.table("images")
            .select("id, flight_id, user_id, storage_path")
            .eq("flight_id", flight_id)
            .limit(5)
            .execute()
        )
        logger.warning(
            f"No images for flight_id={flight_id} with user_id={user_id}. "
            f"Images with this flight_id (any user): {all_res.data}"
        )
        raise HTTPException(
            404,
            f"No images found for flight {flight_id}."
        )

    tmp_dir = os.path.join(settings.OUTPUT_FOLDER, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)

    results = []
    errors  = []

    for img_row in flight_images:
        try:
            result = await _process_one_image(
                image_row=img_row,
                user_id=user_id,
                force=force,
                tmp_dir=tmp_dir,
            )
            results.append(result)
        except Exception as e:
            logger.exception(f"Failed to segment image {img_row.get('id')}: {e}")
            errors.append({"image_id": img_row.get("id"), "error": str(e)})

    return {
        "flight_id": flight_id,
        "processed": len(results),
        "failed":    len(errors),
        "results":   results,
        "errors":    errors,
    }


@router.get("/segment/flight/{flight_id}")
async def get_flight_segmentations(
    flight_id: str,
    user: Any = Depends(get_current_user),
) -> dict:
    """Return cached segmentation results for a flight. Returns empty list if none exist."""
    client = supabase_service.get_supabase()
    if not client:
        raise HTTPException(503, "Supabase unavailable")

    try:
        res = (
            client.table("segmentations")
            .select("image_id, heatmap_url, stress_class, health_score, health_percentage, "
                    "healthy_pixel_count, stressed_pixel_count, confidence, processed_at")
            .eq("flight_id", flight_id)
            .order("processed_at", desc=True)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        logger.warning(f"GET segment/flight/{flight_id}: query error {e}")
        rows = []

    logger.info(f"GET segment/flight/{flight_id}: {len(rows)} cached results")
    return {
        "flight_id": flight_id,
        "count":     len(rows),
        "results": [
            {
                "image_id":             r["image_id"],
                "mask_url":             r["heatmap_url"],
                "stress_class":         r.get("stress_class"),
                "health_score":         r.get("health_score"),
                "health_percentage":    r.get("health_percentage"),
                "healthy_pixel_count":  r.get("healthy_pixel_count"),
                "stressed_pixel_count": r.get("stressed_pixel_count"),
                "confidence":           r.get("confidence"),
                "processed_at":         r.get("processed_at"),
            }
            for r in rows
        ],
    }


@router.post("/segment/image/{image_id}")
async def segment_single_image(
    image_id: str,
    force: bool = False,
    user: Any = Depends(get_current_user),
) -> dict:
    """
    Run SegFormer on a single already-uploaded image (by image_id).
    Useful for re-segmenting individual frames without a full flight re-run.
    """
    user_id = user["sub"]
    client  = supabase_service.get_supabase()
    if not client:
        raise HTTPException(503, "Supabase unavailable")

    res = (
        client.table("images")
        .select("id, storage_path, bucket_name, flight_id, field_id, drone_id")
        .eq("id", image_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, f"Image {image_id} not found")

    tmp_dir = os.path.join(settings.OUTPUT_FOLDER, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)

    result = await _process_one_image(
        image_row=res.data[0],
        user_id=user_id,
        force=force,
        tmp_dir=tmp_dir,
    )
    return {"status": "success", **result}

async def auto_segment_flight(flight_id: str, user_id: str) -> None:
    """
    Called automatically after flight images are uploaded.
    Silently runs segmentation; errors are logged but never raised.
    """
    logger.info(f"auto_segment_flight: starting | flight_id={flight_id} user_id={user_id}")
    client = supabase_service.get_supabase()
    if not client:
        logger.warning("auto_segment_flight: Supabase unavailable, skipping")
        return

    try:
        img_res = (
            client.table("images")
            .select("id, storage_path, bucket_name, flight_id, field_id, drone_id")
            .eq("flight_id", flight_id)
            .eq("user_id", user_id)
            .execute()
        )
        flight_images: list[dict] = img_res.data or []

        if not flight_images:
            logger.warning(f"auto_segment_flight: no images found for flight {flight_id}")
            return

        tmp_dir = os.path.join(settings.OUTPUT_FOLDER, "tmp")
        os.makedirs(tmp_dir, exist_ok=True)

        ok = 0
        for img_row in flight_images:
            try:
                await _process_one_image(
                    image_row=img_row,
                    user_id=user_id,
                    force=False,      # skip images that are already cached
                    tmp_dir=tmp_dir,
                )
                ok += 1
            except Exception as e:
                logger.exception(
                    f"auto_segment_flight: failed on image {img_row.get('id')}: {e}"
                )

        logger.info(
            f"auto_segment_flight: done | flight_id={flight_id} "
            f"{ok}/{len(flight_images)} succeeded"
        )
    except Exception as e:
        logger.exception(
            f"auto_segment_flight: unexpected error for flight {flight_id}: {e}"
        )