from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from typing import Optional
import uuid, os, logging, tempfile

from core.auth import get_current_user
from core.config import settings
from services.supabase_service import get_supabase, save_image
from services.calibration import extract_gps_from_exif

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Uploads"])

MIME_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tif": "image/tiff", ".tiff": "image/tiff",
}


@router.post("/upload")
async def upload_image(
    file:      UploadFile = File(...),
    field_id:  Optional[str] = Form(None),
    flight_id: Optional[str] = Form(None),
    drone_id:  Optional[str] = Form(None),
    user=Depends(get_current_user),
):
    user_id = user["sub"]
    ext = os.path.splitext(file.filename or "")[1].lower()

    if ext not in MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed")

    field_seg    = field_id  or "nofield"
    flight_seg   = flight_id or "noflight"
    storage_path = f"{user_id}/{field_seg}/{flight_seg}/{uuid.uuid4().hex}{ext}"

    contents = await file.read()
    client   = get_supabase()

    # ── Upload to Supabase Storage ────────────────────────────────────────
    try:
        client.storage.from_(settings.SUPABASE_BUCKET_RAW).upload(
            storage_path, contents,
            file_options={"content-type": MIME_TYPES[ext]}
        )
    except Exception as e:
        logger.error(f"Storage upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    # ── Extract GPS from EXIF ─────────────────────────────────────────────
    gps = None
    tmp = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}{ext}")
    try:
        with open(tmp, "wb") as f:
            f.write(contents)
        gps = extract_gps_from_exif(tmp)
    except Exception as e:
        logger.warning(f"GPS extraction failed (non-fatal): {e}")
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

    # ── Save record to DB ─────────────────────────────────────────────────
    try:
        image_row = await save_image({
            "user_id":       user_id,
            "field_id":      field_id,
            "flight_id":     flight_id,
            "drone_id":      drone_id,
            "storage_path":  storage_path,
            "bucket_name":   settings.SUPABASE_BUCKET_RAW,
            "gps":           gps,
            "upload_source": "manual",
        })
    except Exception as e:
        logger.error(f"DB save failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"DB record failed: {str(e)}")

    return {
        "storage_path": storage_path,
        "bucket":       settings.SUPABASE_BUCKET_RAW,
        "image_id":     image_row.get("id"),
        "gps":          gps,
        "message":      "Upload successful — image saved to storage for AI analysis",
    }