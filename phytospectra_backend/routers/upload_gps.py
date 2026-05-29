# backend/routes/upload_gps.py

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from typing import Optional
import uuid
import os
import logging
from datetime import datetime
from PIL import Image
import json

from core.auth import get_current_user
from core.config import settings
from services import supabase_service
from services.calibration import extract_gps_from_exif
from services.pipeline import process_image

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Uploads"])


@router.post("/upload-with-gps")
async def upload_image_with_gps(
    file: UploadFile = File(...),
    field_id: Optional[str] = Form(None),
    flight_id: Optional[str] = Form(None),
    drone_id: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    altitude: Optional[float] = Form(None),
    auto_analyze: bool = Form(True),
    user=Depends(get_current_user),
):
    """
    Upload image with GPS metadata (simulates ESP32 behavior)
    """
    user_id = user["sub"]
    
    # Validate file
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.jpg', '.jpeg', '.png', '.tif', '.tiff']:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    
    # Generate storage path
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    storage_path = f"{user_id}/{flight_id or 'noflight'}/{timestamp}_{unique_id}{ext}"
    
    # Read file content
    contents = await file.read()
    
    # Save temp file to extract GPS if not provided
    gps_data = None
    tmp_path = None
    
    if latitude and longitude:
        gps_data = {"latitude": latitude, "longitude": longitude, "altitude": altitude}
    else:
        # Try to extract from EXIF
        import tempfile
        tmp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}{ext}")
        with open(tmp_path, "wb") as f:
            f.write(contents)
        
        gps_data = extract_gps_from_exif(tmp_path)
    
    # Upload to storage
    try:
        client = supabase_service.get_supabase()
        client.storage.from_(settings.SUPABASE_BUCKET_RAW).upload(
            storage_path, contents,
            file_options={"content-type": f"image/{ext[1:]}"}
        )
    except Exception as e:
        logger.error(f"Storage upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    # Save image record
    image_record = {
        "user_id": user_id,
        "field_id": field_id,
        "flight_id": flight_id,
        "drone_id": drone_id,
        "storage_path": storage_path,
        "bucket_name": settings.SUPABASE_BUCKET_RAW,
        "gps": gps_data,
        "gps_source": "manual" if latitude else "exif",
        "upload_source": "esp32_simulator",
        "captured_at": datetime.utcnow().isoformat()
    }
    
    saved_image = await supabase_service.save_image(image_record)
    image_id = saved_image.get("id")
    
    result = {
        "success": True,
        "storage_path": storage_path,
        "gps": gps_data,
        "image_id": image_id
    }
    
    # Auto-analyze if requested
    if auto_analyze and image_id and tmp_path:
        try:
            # Run segmentation pipeline
            analysis_result = await process_image(
                image_path=tmp_path,
                user_id=user_id,
                image_id=image_id,
                field_id=field_id,
                flight_id=flight_id,
                drone_id=drone_id
            )
            result["analysis"] = analysis_result
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            result["analysis_error"] = str(e)
        finally:
            # Cleanup temp file
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
    
    return result