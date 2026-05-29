from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import os, uuid, logging
from typing import Optional
from datetime import datetime, timezone

from core.auth import get_current_user
from services import supabase_service
from services.pipeline import process_image
from services.calibration import extract_gps_from_exif
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Analyze"])


class AnalyzeRequest(BaseModel):
    object_path: str
    bucket:      Optional[str] = None
    field_id:    Optional[str] = None
    flight_id:   Optional[str] = None
    drone_id:    Optional[str] = None


@router.post("/analyze/from-storage")
async def analyze_from_storage(
    body: AnalyzeRequest,
    user=Depends(get_current_user),
):
    user_id = user["sub"]
    bucket  = body.bucket or settings.SUPABASE_BUCKET_RAW

    tmp_dir = os.path.join(settings.OUTPUT_FOLDER, "tmp")
    os.makedirs(tmp_dir, exist_ok=True)
    ext      = os.path.splitext(body.object_path)[1].lower() or ".png"
    tmp_path = os.path.join(tmp_dir, f"input_{uuid.uuid4().hex}{ext}")

    try:
        # 1 — Download from storage
        await supabase_service.download_image(body.object_path, bucket, tmp_path)

        if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
            raise HTTPException(status_code=500, detail="Download failed or empty file")

        # 2 — Extract GPS from EXIF
        gps = extract_gps_from_exif(tmp_path)

        # 3 — Save image record to images table
        try:
            image_row = await supabase_service.save_image({
                "user_id":       user_id,
                "field_id":      body.field_id,
                "flight_id":     body.flight_id,
                "drone_id":      body.drone_id,
                "storage_path":  body.object_path,
                "bucket_name":   bucket,
                "gps":           gps,
                "gps_source":    "MAPIR Survey3W EXIF",
                "upload_source": "manual",
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Image record save failed: {str(e)}")

        image_id = image_row.get("id")
        if not image_id:
            raise HTTPException(status_code=500, detail="Image saved but no ID returned")
        # 4 — Run full inference pipeline
        result = await process_image(
            image_path=tmp_path,
            user_id=user_id,
            image_id=image_id,
            field_id=body.field_id,
            flight_id=body.flight_id,
            drone_id=body.drone_id,
        )

        return {"status": "success", **result}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("analyze_from_storage failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except:
                pass