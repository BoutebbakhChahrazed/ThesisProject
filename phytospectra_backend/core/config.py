# core/config.py - Inference-only configuration

from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # Supabase Configuration
    SUPABASE_URL: str = "https://vzmtbpdnnbrmhshhtaru.supabase.co"
    SUPABASE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""
    
    # Storage Buckets
    SUPABASE_BUCKET_RAW: str = "multispectral"
    SUPABASE_BUCKET_HEATMAPS: str = "heatmap-images"
    
    # Model Configuration
    MODEL_WEIGHTS_PATH: str = "./models/segformer_b0_v5_1.pt"
    MODEL_NAME: str = "nvidia/mit-b0"
    
    # Paths for testing
    WATCHED_FOLDER: str = "./test_images"
    OUTPUT_FOLDER: str = "./test_results"
    
    # ESP32 device auth
    ESP32_DEVICE_KEY: str = "esp32-dev-key"

    # Server Configuration
    CORS_ORIGINS: str = "http://0.0.0.0:8080,http://0.0.0.0:5173,http://0.0.0.0:3000"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Inference settings
    DEVICE: str = "cuda"
    IMG_SIZE: int = 512

    # Groq AI — set in .env file, never hardcode here
    GROQ_API_KEY: str = ""

    # Gmail — set in .env file, never hardcode here
    GMAIL_SENDER: str = ""
    GMAIL_APP_PASSWORD: str = ""

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]
    
    class Config:
        env_file = ".env"

settings = Settings()