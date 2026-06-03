import os
import uuid
import logging
import numpy as np
from datetime import datetime, timezone

from core.config import settings
from core.connection_manager import manager
from services.calibration import calibrate_image, extract_gps_from_exif
from services.indices import (
    compute_ndvi, compute_gndvi,
    compute_health_score, get_stress_label,
    generate_heatmap_png
)
from services.inference import predict_rgn  # ← replaces get_classifier
from services import supabase_service

logger = logging.getLogger(__name__)


def _load_image_as_bands(image_path: str) -> dict:
    ext = os.path.splitext(image_path)[1].lower()
    try:
        import rasterio
        with rasterio.open(image_path) as src:
            band_count = src.count
            logger.info(f"Rasterio: {image_path} | bands={band_count} | {src.width}x{src.height}")
            red   = src.read(1).astype("float32")
            green = src.read(2).astype("float32")
            nir   = src.read(3).astype("float32") if band_count >= 3 else red * 1.2
            max_val = 65535.0 if red.max() > 255 else 255.0
            return {
                "red":   np.clip(red   / max_val, 0, 1),
                "green": np.clip(green / max_val, 0, 1),
                "nir":   np.clip(nir   / max_val, 0, 1),
            }
    except Exception as e:
        logger.warning(f"Rasterio failed ({e}), falling back to PIL")
        from PIL import Image
        img = Image.open(image_path).convert("RGB")
        arr = np.array(img).astype("float32") / 255.0
        red, green, blue = arr[:,:,0], arr[:,:,1], arr[:,:,2]
        nir = np.clip(red * 1.3 + blue * 0.1, 0, 1)
        logger.warning("NIR is simulated from RGB — not real multispectral data")
        return {"red": red, "green": green, "nir": nir}


async def process_image(
    image_path: str,
    user_id: str,
    image_id: str,
    field_id: str = None,
    flight_id: str = None,
    drone_id: str = None,
) -> dict:
    logger.info(f"Processing: {image_path}")

    if not os.path.exists(image_path):
        raise ValueError(f"Image not found: {image_path}")
    if os.path.getsize(image_path) == 0:
        raise ValueError("Image file is empty")

    # Step 1 — Load bands
    bands = _load_image_as_bands(image_path)
    red, green, nir = bands["red"], bands["green"], bands["nir"]

    # Step 2 — Compute indices
    ndvi  = compute_ndvi(red, nir)
    gndvi = compute_gndvi(green, nir)
    ndvi  = np.clip(np.nan_to_num(ndvi, nan=0.0, posinf=0.85, neginf=-0.1), -1, 1)

    health_score = compute_health_score(ndvi)
    stress_label = get_stress_label(health_score)

    total_pixels     = ndvi.size
    healthy_pixels   = int(np.sum(ndvi > 0.3))
    stressed_pixels  = int(np.sum(ndvi <= 0.3))
    health_pct       = round(healthy_pixels / total_pixels * 100, 2)

    # Step 3 — Generate heatmap
    heatmap_id       = str(uuid.uuid4())[:8]
    heatmap_filename = f"heatmap_{heatmap_id}.png"
    heatmap_path     = os.path.join(settings.OUTPUT_FOLDER, heatmap_filename)
    os.makedirs(settings.OUTPUT_FOLDER, exist_ok=True)

    try:
        generate_heatmap_png(ndvi, heatmap_path)
    except Exception as e:
        logger.error(f"Heatmap failed: {e}")
        import cv2
        cv2.imwrite(heatmap_path, cv2.applyColorMap(
            ((ndvi + 1) / 2 * 255).astype("uint8"), cv2.COLORMAP_JET
        ))

    # Step 4 — Run ViT model (4-channel RGN + NDVI)
    # predict_rgn expects the raw image path and returns
    # {"stress_class": str, "confidence": float, "health_score": float}
    # Falls back to index-based result if the model is unavailable.
    try:
        prediction  = predict_rgn(image_path)
        final_class = prediction["stress_class"]
        confidence  = prediction["confidence"]
        # Optionally override index-based health_score with model's probability-derived one
        health_score = prediction.get("health_score", health_score)
    except Exception as e:
        logger.warning(f"ViT model failed ({e}), using index-based fallback")
        final_class = stress_label
        confidence  = round(health_score / 100, 2)

    # Step 5 — Extract GPS
    gps = extract_gps_from_exif(image_path)

    # Step 6 — Upload heatmap
    heatmap_storage = f"{user_id}/{flight_id or 'noflight'}/{heatmap_filename}"
    heatmap_url = await supabase_service.upload_image(
        heatmap_path,
        settings.SUPABASE_BUCKET_HEATMAPS,
        heatmap_storage
    )

    # Step 7 — Save segmentation result
    seg_record = {
        "user_id":              user_id,
        "image_id":             image_id,
        "field_id":             field_id,
        "flight_id":            flight_id,
        "drone_id":             drone_id,
        "heatmap_url":          heatmap_url,
        "ndvi_mean":            round(float(ndvi.mean()), 4),
        "gndvi_mean":           round(float(gndvi.mean()), 4),
        "health_score":         round(float(health_score), 4),
        "stress_class":         final_class,
        "confidence":           round(float(confidence), 4),
        "healthy_pixel_count":  healthy_pixels,
        "stressed_pixel_count": stressed_pixels,
        "health_percentage":    health_pct,
        "gps":                  gps,
    }

    saved_seg = await supabase_service.save_segmentation(seg_record)

    broadcast_payload = {
        **seg_record,
        "segmentation_id": saved_seg.get("id"),
        "timestamp":       datetime.now(timezone.utc).isoformat(),
    }
    await manager.broadcast(broadcast_payload)

    logger.info(f"Done | stress={final_class} | health={health_score:.1f}% | confidence={confidence:.2f}")

    try:
        os.remove(heatmap_path)
    except:
        pass

    return broadcast_payload