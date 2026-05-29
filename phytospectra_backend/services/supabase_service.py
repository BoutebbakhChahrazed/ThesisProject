from supabase import create_client, Client
from core.config import settings
import logging
import os

logger = logging.getLogger(__name__)
_client: Client = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            logger.warning("Supabase credentials not set.")
            return None
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _client


# ─────────────────────────────────────────────
# STORAGE
# ─────────────────────────────────────────────

async def upload_image(file_path: str, bucket: str, storage_path: str) -> str:
    """Upload file to Supabase Storage. Returns public URL."""
    client = get_supabase()
    if not client:
        return f"local://{file_path}"
    try:
        ext = os.path.splitext(file_path)[1].lower()
        content_type = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".tif": "image/tiff",
            ".tiff": "image/tiff",
        }.get(ext, "application/octet-stream")

        with open(file_path, "rb") as f:
            data = f.read()

        client.storage.from_(bucket).upload(
            storage_path, data,
            file_options={"content-type": content_type}
        )
        url = client.storage.from_(bucket).get_public_url(storage_path)
        logger.info(f"Uploaded {storage_path} → {bucket}")
        return url
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        return f"local://{file_path}"


async def download_image(object_path: str, bucket: str, dest_path: str) -> str:
    client = get_supabase()
    if not client:
        raise RuntimeError("Supabase not available")
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    data = client.storage.from_(bucket).download(object_path)
    if not data:
        raise RuntimeError("Download returned empty data")
    with open(dest_path, "wb") as f:
        f.write(data)
    logger.info(f"Downloaded {object_path} → {dest_path} ({len(data)} bytes)")
    return dest_path


# ─────────────────────────────────────────────
# IMAGES TABLE  (raw uploads)
# ─────────────────────────────────────────────

async def save_image(record: dict) -> dict:
    client = get_supabase()
    if not client:
        logger.warning("Supabase not available. Image record not saved.")
        return {}
    try:
        result = client.table("images").insert({
            "user_id":       record["user_id"],
            "field_id":      record.get("field_id"),
            "flight_id":     record.get("flight_id"),
            "drone_id":      record.get("drone_id"),
            "storage_path":  record["storage_path"],
            "bucket_name":   record.get("bucket_name", "multispectral"),
            "gps":           record.get("gps"),
            "gps_source":    record.get("gps_source", "MAPIR Survey3W EXIF"),
            "upload_source": record.get("upload_source", "manual"),
        }).execute()

        logger.info(f"Image saved: {record['storage_path']}")
        return result.data[0] if result.data else {}

    except Exception as e:
        # Now logs the REAL Supabase error
        logger.error(f"Failed to save image record: {e}", exc_info=True)
        raise  # ← re-raise so analyze endpoint shows real error


async def get_images(user_id: str, field_id: str = None, flight_id: str = None, limit: int = 50):
    client = get_supabase()
    if not client:
        return []
    query = client.table("images").select("*").eq("user_id", user_id).limit(limit)
    if field_id:
        query = query.eq("field_id", field_id)
    if flight_id:
        query = query.eq("flight_id", flight_id)
    return query.order("uploaded_at", desc=True).execute().data


# ─────────────────────────────────────────────
# SEGMENTATIONS TABLE  (model results)
# ─────────────────────────────────────────────

async def save_segmentation(record: dict) -> dict:
    """Insert model inference result into segmentations table."""
    client = get_supabase()
    if not client:
        logger.warning("Supabase not available. Segmentation not saved.")
        return {}
    try:
        result = client.table("segmentations").insert({
            "user_id":               record["user_id"],
            "image_id":              record["image_id"],
            "field_id":              record.get("field_id"),
            "flight_id":             record.get("flight_id"),
            "drone_id":              record.get("drone_id"),
            "heatmap_url":           record.get("heatmap_url"),
            "ndvi_mean":             record.get("ndvi_mean"),
            "gndvi_mean":            record.get("gndvi_mean"),
            "health_score":          record.get("health_score"),
            "stress_class":          record.get("stress_class"),
            "confidence":            record.get("confidence"),
            "healthy_pixel_count":   record.get("healthy_pixel_count"),
            "stressed_pixel_count":  record.get("stressed_pixel_count"),
            "health_percentage":     record.get("health_percentage"),
            "gps":                   record.get("gps"),
        }).execute()
        logger.info(f"Segmentation saved for image {record['image_id']}")
        return result.data[0] if result.data else {}
    except Exception as e:
        logger.error(f"Failed to save segmentation: {e}")
        return {}


async def get_segmentations(user_id: str, field_id: str = None, flight_id: str = None, limit: int = 50):
    client = get_supabase()
    if not client:
        return []
    query = (client.table("segmentations")
             .select("*, images(storage_path, gps, captured_at)")
             .eq("user_id", user_id)
             .limit(limit))
    if field_id:
        query = query.eq("field_id", field_id)
    if flight_id:
        query = query.eq("flight_id", flight_id)
    return query.order("processed_at", desc=True).execute().data

# ─────────────────────────────────────────────
# FLIGHTS TABLE
# ─────────────────────────────────────────────

async def create_flight(user_id: str, field_id: str, drone_id: str = None,
                        altitude: float = None, weather: str = None) -> dict:
    client = get_supabase()
    if not client:
        return {}
    result = client.table("flights").insert({
        "user_id":  user_id,
        "field_id": field_id,
        "drone_id": drone_id,
        "altitude": altitude,
        "weather":  weather,
    }).execute()
    return result.data[0] if result.data else {}


async def get_flights(user_id: str, field_id: str = None):
    client = get_supabase()
    if not client:
        return []
    query = (client.table("flights")
             .select("*, fields(field_name), drones(drone_name)")
             .eq("user_id", user_id))
    if field_id:
        query = query.eq("field_id", field_id)
    return query.order("flight_date", desc=True).execute().data


# ─────────────────────────────────────────────
# FIELDS TABLE
# ─────────────────────────────────────────────

async def get_fields(user_id: str):
    client = get_supabase()
    if not client:
        return []
    return (client.table("fields")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute().data)