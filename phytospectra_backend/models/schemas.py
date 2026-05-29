from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class GPSCoords(BaseModel):
    lat: float
    lng: float

class DetectionResult(BaseModel):
    zone_id: str
    flight_id: Optional[str] = None
    timestamp: datetime
    gps: GPSCoords
    health_score: float
    stress_class: str
    confidence: float
    heatmap_url: str
    drone_image_url: str

class FlightCreate(BaseModel):
    drone_id: str
    field_name: str

class FlightResponse(BaseModel):
    id: str
    date: datetime
    drone_id: str
    field_name: str

class DetectionQuery(BaseModel):
    flight_id: Optional[str] = None
    limit: int = 50