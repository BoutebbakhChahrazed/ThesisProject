from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from services import supabase_service
from core.auth import get_current_user

router = APIRouter(tags=["Flights"])


class FlightCreate(BaseModel):
    field_id:  str
    drone_id:  Optional[str] = None
    altitude:  Optional[float] = None
    weather:   Optional[str] = None


@router.get("/flights")
async def list_flights(
    field_id: Optional[str] = Query(None),
    user=Depends(get_current_user)
):
    return await supabase_service.get_flights(user["sub"], field_id)


@router.post("/flights")
async def create_flight(data: FlightCreate, user=Depends(get_current_user)):
    result = await supabase_service.create_flight(
        user_id=user["sub"],
        field_id=data.field_id,
        drone_id=data.drone_id,
        altitude=data.altitude,
        weather=data.weather,
    )
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create flight")
    return result


@router.get("/flights/{flight_id}")
async def get_flight(flight_id: str, user=Depends(get_current_user)):
    client = supabase_service.get_supabase()
    result = client.table("flights").select("*, fields(field_name), drones(drone_name)") \
        .eq("id", flight_id) \
        .eq("user_id", user["sub"]) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Flight not found")
    return result.data[0]


@router.get("/flights/{flight_id}/segmentations")
async def get_flight_segmentations(flight_id: str, user=Depends(get_current_user)):
    return await supabase_service.get_segmentations(
        user_id=user["sub"],
        flight_id=flight_id
    )


@router.delete("/flights/{flight_id}")
async def delete_flight(flight_id: str, user=Depends(get_current_user)):
    client = supabase_service.get_supabase()
    client.table("flights").delete() \
        .eq("id", flight_id) \
        .eq("user_id", user["sub"]) \
        .execute()
    return {"status": "deleted", "flight_id": flight_id}