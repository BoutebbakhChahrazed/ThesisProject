"""
ESP32 device API — mission sync and image DB registration.

The farmer creates a flight in the app; the ESP32 polls GET /api/esp32/mission
using its device_id (drones.esp32_device_id), uploads to Supabase storage,
then POSTs /api/esp32/image-record so rows land in the images table.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from core.config import settings
from services.supabase_service import get_supabase, save_image

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ESP32"])


def _verify_esp32_key(x_esp32_key: Optional[str]) -> None:
    expected = getattr(settings, "ESP32_DEVICE_KEY", None) or ""
    if not expected or x_esp32_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-ESP32-Key")


def _get_client():
    client = get_supabase()
    if not client:
        raise HTTPException(status_code=500, detail="Supabase not available")
    return client


def _resolve_mission(device_id: str) -> dict:
    """Drone by esp32_device_id → latest flight for that drone."""
    client = _get_client()

    drone_res = (
        client.table("drones")
        .select("id, user_id, field_id, esp32_device_id, drone_name")
        .eq("esp32_device_id", device_id)
        .limit(1)
        .execute()
    )
    if not drone_res.data:
        raise HTTPException(
            status_code=404,
            detail=f"No drone registered for device_id '{device_id}'. Set esp32_device_id in the Drones page.",
        )

    drone = drone_res.data[0]
    user_id = drone["user_id"]
    drone_id = drone["id"]

    flight_res = (
        client.table("flights")
        .select("id, user_id, field_id, drone_id, flight_date")
        .eq("drone_id", drone_id)
        .eq("user_id", user_id)
        .order("flight_date", desc=True)
        .limit(1)
        .execute()
    )
    if not flight_res.data:
        raise HTTPException(
            status_code=404,
            detail="No active flight — create a flight in the app first",
        )

    flight = flight_res.data[0]
    field_id = flight.get("field_id") or drone.get("field_id")
    if not field_id:
        raise HTTPException(
            status_code=404,
            detail="Flight has no field_id and drone is not assigned to a field",
        )

    return {
        "user_id": user_id,
        "field_id": field_id,
        "flight_id": flight["id"],
        "drone_id": drone_id,
        "bucket": settings.SUPABASE_BUCKET_RAW,
    }


@router.get("/esp32/mission")
async def get_active_mission(
    device_id: str = Query(..., description="Must match drones.esp32_device_id"),
    x_esp32_key: Optional[str] = Header(None, alias="X-ESP32-Key"),
):
    """
    Return the active mission context for this ESP32.
    Active = most recent flight for the drone linked to device_id.
    """
    _verify_esp32_key(x_esp32_key)
    mission = _resolve_mission(device_id)
    logger.info(
        "ESP32 mission device=%s flight=%s field=%s",
        device_id,
        mission["flight_id"],
        mission["field_id"],
    )
    return mission


class ImageRecordBody(BaseModel):
    device_id: str
    storage_path: str
    original_filename: Optional[str] = None


@router.post("/esp32/image-record")
async def register_esp32_image(
    body: ImageRecordBody,
    x_esp32_key: Optional[str] = Header(None, alias="X-ESP32-Key"),
):
    """
    Register an image already uploaded to Supabase storage by the ESP32.
    storage_path must follow: {user_id}/{field_id}/{flight_id}/{filename}
    """
    _verify_esp32_key(x_esp32_key)
    mission = _resolve_mission(body.device_id)

    prefix = f"{mission['user_id']}/{mission['field_id']}/{mission['flight_id']}/"
    if not body.storage_path.startswith(prefix):
        raise HTTPException(
            status_code=400,
            detail=f"storage_path must start with {prefix}",
        )

    existing = _get_client().table("images").select("id").eq(
        "storage_path", body.storage_path
    ).eq("user_id", mission["user_id"]).limit(1).execute()

    if existing.data:
        return {
            "status": "already_registered",
            "image_id": existing.data[0]["id"],
            "storage_path": body.storage_path,
        }

    image_row = await save_image({
        "user_id": mission["user_id"],
        "field_id": mission["field_id"],
        "flight_id": mission["flight_id"],
        "drone_id": mission["drone_id"],
        "storage_path": body.storage_path,
        "bucket_name": mission["bucket"],
        "gps": None,
        "gps_source": "MAPIR Survey3W EXIF",
        "upload_source": "esp32",
    })

    image_id = image_row.get("id")
    if not image_id:
        raise HTTPException(status_code=500, detail="Image record saved but no id returned")

    logger.info(
        "ESP32 image registered device=%s path=%s id=%s",
        body.device_id,
        body.storage_path,
        image_id,
    )
    return {
        "status": "registered",
        "image_id": image_id,
        "storage_path": body.storage_path,
        "flight_id": mission["flight_id"],
    }
