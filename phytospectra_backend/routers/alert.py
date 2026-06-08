from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.connection_manager import manager
from services.supabase_service import get_supabase
import logging, json

router = APIRouter()
logger = logging.getLogger(__name__)


class StressAlertPayload(BaseModel):
    farmer_id: str
    field_id: str
    flight_id: Optional[str] = None
    lat: float
    lng: float
    health_score: float
    severity: str = "medium"
    message: Optional[str] = None


@router.post("/alerts/stress")
async def send_stress_alert(payload: StressAlertPayload):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase client not available")

    # ── 1. Find nearest agronomist ──────────────────────────────────────────
    agronomist_id = None
    agro_name     = None
    agro_dist_km  = None

    try:
        agro_res = supabase.rpc(
            "find_nearest_agronomist",
            {"farm_lat": payload.lat, "farm_lng": payload.lng}
        ).execute()

        if agro_res.data:
            agronomist_id = agro_res.data[0]["agronomist_id"]
            agro_name     = agro_res.data[0]["display_name"]
            agro_dist_km  = agro_res.data[0]["distance_km"]
            logger.info("Nearest agronomist: %s (%.1f km)", agro_name, agro_dist_km)
        else:
            logger.warning("No agronomist found near (%.4f, %.4f)", payload.lat, payload.lng)

    except Exception as e:
        logger.error("find_nearest_agronomist RPC failed: %s", e)
        # Non-fatal — we still send the alert to the farmer

    # ── 2. Build message ────────────────────────────────────────────────────
    if payload.message:
        auto_message = payload.message
    elif agronomist_id:
        auto_message = (
            f"⚠️ Potato stress detected — health score {payload.health_score:.0f}%. "
            f"Nearest agronomist ({agro_name}, {agro_dist_km:.1f} km) has been notified."
        )
    else:
        auto_message = (
            f"⚠️ Potato stress detected — health score {payload.health_score:.0f}%. "
            "No agronomist currently online nearby."
        )

    # ── 3. Insert alert row ─────────────────────────────────────────────────
    try:
        insert_res = supabase.table("alerts").insert({
            "farmer_id":     payload.farmer_id,
            "agronomist_id": agronomist_id,
            "field_id":      payload.field_id,
            "flight_id":     payload.flight_id,
            "alert_type":    "stress",
            "severity":      payload.severity,
            "message":       auto_message,
            "health_score":  payload.health_score,
            "lat":           payload.lat,
            "lng":           payload.lng,
        }).execute()

        if not insert_res.data:
            raise HTTPException(status_code=500, detail="Alert insert returned no data")

        alert_id = insert_res.data[0]["id"]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to insert alert: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to insert alert: {e}")

    # ── 4. WebSocket broadcast ──────────────────────────────────────────────
    ws_payload = {
        "type":          "stress_alert",
        "alert_id":      alert_id,
        "farmer_id":     payload.farmer_id,
        "agronomist_id": agronomist_id,
        "field_id":      payload.field_id,
        "severity":      payload.severity,
        "health_score":  payload.health_score,
        "message":       auto_message,
        "lat":           payload.lat,
        "lng":           payload.lng,
    }

    farmer_reached = await manager.send_to_user(payload.farmer_id, ws_payload)
    agro_reached   = False
    if agronomist_id:
        agro_reached = await manager.send_to_user(agronomist_id, ws_payload)

    logger.info(
        "Alert %s | farmer_ws=%s | agro_ws=%s",
        alert_id, farmer_reached, agro_reached
    )

    return {
        "alert_id":       alert_id,
        "agronomist_id":  agronomist_id,
        "message":        auto_message,
        "farmer_reached": farmer_reached,
        "agro_reached":   agro_reached,
    }