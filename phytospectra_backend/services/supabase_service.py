from supabase import create_client, Client
from core.config import settings
import logging
import os

logger = logging.getLogger(__name__)
_client: Client = None

# Flights table uses created_at in Supabase; expose flight_date for the frontend.
FLIGHTS_ORDER_COLUMN = "created_at"


def normalize_flight_row(row: dict) -> dict:
    if row and not row.get("flight_date"):
        row["flight_date"] = row.get("created_at")
    return row


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
    """
    Upload a file to Supabase Storage and return its public URL.
    Raises RuntimeError on any failure — never returns a local:// fallback.
    """
    client = get_supabase()
    if not client:
        raise RuntimeError("Supabase client not available — check SUPABASE_URL and SUPABASE_KEY")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File to upload does not exist: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    content_type = {
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".tif":  "image/tiff",
        ".tiff": "image/tiff",
    }.get(ext, "application/octet-stream")

    with open(file_path, "rb") as f:
        data = f.read()

    if not data:
        raise RuntimeError(f"File is empty, aborting upload: {file_path}")

    try:
        client.storage.from_(bucket).upload(
            storage_path,
            data,
            file_options={
                "content-type": content_type,
                "upsert": "true",   # overwrite if file already exists
            },
        )
    except Exception as e:
        logger.error(
            f"Storage upload FAILED | bucket={bucket} | path={storage_path} | error={e}"
        )
        raise RuntimeError(f"Storage upload failed for bucket '{bucket}': {e}") from e

    url = client.storage.from_(bucket).get_public_url(storage_path)

    if not url or not url.startswith("https://"):
        raise RuntimeError(
            f"Upload succeeded but got invalid public URL: {url!r} "
            f"— check that bucket '{bucket}' is public in Supabase Storage settings"
        )

    logger.info(f"Uploaded | bucket={bucket} | path={storage_path} | url={url}")
    return url


async def download_image(object_path: str, bucket: str, dest_path: str) -> str:
    """Download a file from Supabase Storage to dest_path. Raises on failure."""
    client = get_supabase()
    if not client:
        raise RuntimeError("Supabase client not available")

    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    try:
        data = client.storage.from_(bucket).download(object_path)
    except Exception as e:
        logger.error(f"Storage download FAILED | bucket={bucket} | path={object_path} | error={e}")
        raise RuntimeError(f"Storage download failed: {e}") from e

    if not data:
        raise RuntimeError(
            f"Download returned empty data | bucket={bucket} | path={object_path}"
        )

    with open(dest_path, "wb") as f:
        f.write(data)

    logger.info(f"Downloaded | bucket={bucket} | path={object_path} | dest={dest_path} | {len(data)} bytes")
    return dest_path


# ─────────────────────────────────────────────
# IMAGES TABLE  (raw uploads)
# ─────────────────────────────────────────────

async def save_image(record: dict) -> dict:
    """Insert a raw image record. Raises on failure."""
    client = get_supabase()
    if not client:
        raise RuntimeError("Supabase client not available — image record not saved")

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
        logger.error(f"Failed to save image record: {e}", exc_info=True)
        raise


async def get_image_by_storage_path(storage_path: str, user_id: str) -> dict:
    client = get_supabase()
    if not client:
        return {}
    try:
        result = (
            client.table("images")
            .select("*")
            .eq("storage_path", storage_path)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else {}
    except Exception as e:
        logger.error(f"Failed to lookup image by storage path: {e}")
        return {}


async def get_images(
    user_id: str,
    field_id: str = None,
    flight_id: str = None,
    limit: int = 50,
) -> list:
    client = get_supabase()
    if not client:
        return []
    try:
        query = (
            client.table("images")
            .select("*")
            .eq("user_id", user_id)
            .limit(limit)
        )
        if field_id:
            query = query.eq("field_id", field_id)
        if flight_id:
            query = query.eq("flight_id", flight_id)
        return query.order("uploaded_at", desc=True).execute().data or []
    except Exception as e:
        logger.error(f"Failed to fetch images: {e}")
        return []


# ─────────────────────────────────────────────
# SEGMENTATIONS TABLE  (model results)
# ─────────────────────────────────────────────

async def save_segmentation(record: dict) -> dict:
    """
    Insert a segmentation result.
    Raises on failure so the caller knows the record was NOT saved.
    """
    client = get_supabase()
    if not client:
        raise RuntimeError("Supabase client not available — segmentation not saved")

    # Validate the heatmap_url before saving so we never persist local:// paths
    heatmap_url = record.get("heatmap_url")
    if heatmap_url and not heatmap_url.startswith("https://"):
        raise ValueError(
            f"Refusing to save a non-HTTPS heatmap_url: {heatmap_url!r} — "
            "this usually means the mask upload failed. Fix the upload first."
        )

    try:
        result = client.table("segmentations").insert({
            "user_id":               record["user_id"],
            "image_id":              record["image_id"],
            "field_id":              record.get("field_id"),
            "flight_id":             record.get("flight_id"),
            "drone_id":              record.get("drone_id"),
            "heatmap_url":           heatmap_url,
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

        logger.info(f"Segmentation saved | image_id={record['image_id']} | url={heatmap_url}")
        return result.data[0] if result.data else {}

    except Exception as e:
        logger.error(f"Failed to save segmentation for image {record.get('image_id')}: {e}", exc_info=True)
        raise


async def get_segmentations(
    user_id: str,
    field_id: str = None,
    flight_id: str = None,
    limit: int = 50,
) -> list:
    client = get_supabase()
    if not client:
        return []
    # Try embedded images join; fall back if FK or column names differ in DB.
    select_variants = [
        "*, images(storage_path, gps, uploaded_at)",
        "*, images(storage_path, gps)",
        "*",
    ]
    for sel in select_variants:
        try:
            query = (
                client.table("segmentations")
                .select(sel)
                .eq("user_id", user_id)
                .limit(limit)
            )
            if field_id:
                query = query.eq("field_id", field_id)
            if flight_id:
                query = query.eq("flight_id", flight_id)
            data = query.order("processed_at", desc=True).execute().data or []
            return data
        except Exception as e:
            logger.warning(f"segmentations select={sel!r} failed: {e}")
            continue
    return []


# ─────────────────────────────────────────────
# FLIGHTS TABLE
# ─────────────────────────────────────────────

async def create_flight(
    user_id: str,
    field_id: str,
    drone_id: str = None,
    altitude: float = None,
    weather: str = None,
) -> dict:
    client = get_supabase()
    if not client:
        raise RuntimeError("Supabase client not available — flight not created")
    try:
        result = client.table("flights").insert({
            "user_id":  user_id,
            "field_id": field_id,
            "drone_id": drone_id,
            "altitude": altitude,
            "weather":  weather,
        }).execute()
        return result.data[0] if result.data else {}
    except Exception as e:
        logger.error(f"Failed to create flight: {e}", exc_info=True)
        raise


async def get_flights(user_id: str, field_id: str = None) -> list:
    client = get_supabase()
    if not client:
        return []
    select_variants = [
        "*, fields(field_name), drones(drone_name)",
        "*, fields(field_name)",
        "*",
    ]
    for sel in select_variants:
        try:
            query = (
                client.table("flights")
                .select(sel)
                .eq("user_id", user_id)
            )
            if field_id:
                query = query.eq("field_id", field_id)
            rows = query.order(FLIGHTS_ORDER_COLUMN, desc=True).execute().data or []
            return [normalize_flight_row(r) for r in rows]
        except Exception as e:
            logger.warning(f"get_flights select={sel!r} failed: {e}")
            continue
    return []


# ─────────────────────────────────────────────
# FIELDS TABLE
# ─────────────────────────────────────────────

async def get_fields(user_id: str) -> list:
    client = get_supabase()
    if not client:
        raise RuntimeError("Supabase client not configured (check SUPABASE_URL and SUPABASE_KEY in backend .env)")

    last_error: Exception | None = None
    attempts = [
        ("*", "created_at"),
        ("*", "id"),
        ("*", None),
        (
            "id, user_id, field_name, crop_type, latitude, longitude, area_hectares, boundary",
            None,
        ),
    ]
    for select_cols, order_col in attempts:
        try:
            query = client.table("fields").select(select_cols).eq("user_id", user_id)
            if order_col:
                query = query.order(order_col, desc=True)
            return query.execute().data or []
        except Exception as e:
            last_error = e
            logger.warning(f"get_fields failed select={select_cols!r} order={order_col!r}: {e}")

    raise RuntimeError(f"Could not load fields from Supabase: {last_error}")