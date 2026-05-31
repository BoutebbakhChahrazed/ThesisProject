"""
POST /api/segment/flight/{flight_id}

For each image linked to a flight:
  1. Download from Supabase storage
  2. Tile into 512×512 patches (with overlap to avoid seam artefacts)
  3. Run segformer_b0_v5_1.pt on every patch
  4. Stitch soft-logit tiles back into a full-res mask
  5. Colourise the mask and upload to "<bucket>-masks" bucket
  6. Insert / upsert a row into `image_segmentations` table

Returns JSON: { results: [{ image_id, mask_url, label_counts }] }

Add to your FastAPI app:
    from segment_flight import router as segment_router
    app.include_router(segment_router)

Dependencies (add to requirements.txt if not present):
    torch torchvision transformers Pillow numpy supabase
"""

from __future__ import annotations

import io
import json
import math
import os
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn.functional as F
from fastapi import APIRouter, Depends, HTTPException
from PIL import Image
from transformers import SegformerForSemanticSegmentation

# ── Local imports – adjust to your project layout ──────────────────────────
from dependencies import get_current_user          # your auth dep
from integrations.supabase_client import supabase  # your supabase client

router = APIRouter()

# ── Model config ─────────────────────────────────────────────────────────────

MODEL_PATH   = Path(__file__).parent / "models" / "segformer_b0_v5_1.pt"
PATCH_SIZE   = 512
OVERLAP      = 64          # overlap between tiles to soften seam artefacts
DEVICE       = "cuda" if torch.cuda.is_available() else "cpu"

# SegFormer-B0 label palette (extend / replace with your own class colours)
# Index → (R, G, B)
PALETTE: dict[int, tuple[int, int, int]] = {
    0: (0,   128,   0),   # vegetation  – green
    1: (194, 178, 128),   # soil/bare   – sand
    2: (0,   0,   255),   # water       – blue
    3: (255, 255,   0),   # crop        – yellow
    4: (128,   0, 128),   # weed        – purple
    5: (255, 165,   0),   # stress      – orange
    # add more as needed …
}
NUM_LABELS = max(PALETTE.keys()) + 1

# ── Model loader (singleton) ──────────────────────────────────────────────────

_model: SegformerForSemanticSegmentation | None = None

def get_model() -> SegformerForSemanticSegmentation:
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model not found at {MODEL_PATH}")
        # The checkpoint was saved with torch.save(model.state_dict(), …)
        # If you saved the whole model use torch.load directly.
        model = SegformerForSemanticSegmentation.from_pretrained(
            "nvidia/mit-b0",
            num_labels=NUM_LABELS,
            ignore_mismatched_sizes=True,
        )
        state = torch.load(MODEL_PATH, map_location=DEVICE)
        # Support both raw state-dict and {"model_state_dict": …} checkpoints
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        model.load_state_dict(state, strict=False)
        model.to(DEVICE).eval()
        _model = model
    return _model


# ── Core tiling / inference helpers ──────────────────────────────────────────

def _normalise(patch_np: np.ndarray) -> torch.Tensor:
    """HWC uint8 → 1CHW float32 tensor, ImageNet-normalised."""
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    x = patch_np.astype(np.float32) / 255.0
    x = (x - mean) / std                         # HWC
    x = torch.from_numpy(x).permute(2, 0, 1)     # CHW
    return x.unsqueeze(0).to(DEVICE)             # 1CHW


@torch.no_grad()
def segment_image(pil_img: Image.Image) -> np.ndarray:
    """
    Tile a full-resolution PIL image, run SegFormer on each tile,
    stitch soft logits back, return an (H, W) uint8 class-index array.
    """
    model  = get_model()
    W, H   = pil_img.size
    img_np = np.array(pil_img.convert("RGB"))

    step   = PATCH_SIZE - OVERLAP
    # Accumulate logit sums and counts for soft-max stitching
    logit_acc = np.zeros((NUM_LABELS, H, W), dtype=np.float32)
    count_acc = np.zeros((H, W),             dtype=np.float32)

    rows = list(range(0, H, step))
    cols = list(range(0, W, step))

    for r in rows:
        for c in cols:
            r1, r2 = r, min(r + PATCH_SIZE, H)
            c1, c2 = c, min(c + PATCH_SIZE, W)
            ph, pw  = r2 - r1, c2 - c1

            patch = img_np[r1:r2, c1:c2]           # actual (possibly partial) tile

            # Pad to 512×512 if tile is smaller (edge tiles)
            if ph < PATCH_SIZE or pw < PATCH_SIZE:
                pad = np.zeros((PATCH_SIZE, PATCH_SIZE, 3), dtype=np.uint8)
                pad[:ph, :pw] = patch
                patch = pad

            tensor = _normalise(patch)              # 1×3×512×512
            out    = model(pixel_values=tensor)     # SegformerModelOutput
            logits = out.logits                     # 1×C×H'×W'  (H'=H/4)

            # Upsample logits to 512×512
            logits = F.interpolate(
                logits, size=(PATCH_SIZE, PATCH_SIZE),
                mode="bilinear", align_corners=False
            )                                       # 1×C×512×512
            logits_np = logits.squeeze(0).cpu().numpy()  # C×512×512

            # Accumulate into the full canvas
            logit_acc[:, r1:r2, c1:c2] += logits_np[:, :ph, :pw]
            count_acc[r1:r2, c1:c2]    += 1.0

    # Avoid divide-by-zero
    count_acc = np.where(count_acc == 0, 1, count_acc)
    logit_acc /= count_acc[np.newaxis]              # average logits

    class_map = logit_acc.argmax(axis=0).astype(np.uint8)  # H×W
    return class_map


def colourise(class_map: np.ndarray) -> Image.Image:
    """Convert H×W class-index array → RGB PIL image using PALETTE."""
    H, W  = class_map.shape
    rgb   = np.zeros((H, W, 3), dtype=np.uint8)
    for cls_idx, colour in PALETTE.items():
        mask = class_map == cls_idx
        rgb[mask] = colour
    return Image.fromarray(rgb, "RGB")


def count_labels(class_map: np.ndarray) -> dict[str, int]:
    unique, counts = np.unique(class_map, return_counts=True)
    return {str(int(u)): int(c) for u, c in zip(unique, counts)}


# ── Storage helpers ───────────────────────────────────────────────────────────

def _mask_bucket(source_bucket: str) -> str:
    """Derive the mask bucket name from the source bucket."""
    return f"{source_bucket}-masks"


async def _ensure_bucket(bucket: str) -> None:
    """Create the masks bucket if it doesn't exist (public, 1-day expiry)."""
    existing = supabase.storage.list_buckets()
    names    = {b.name for b in existing}
    if bucket not in names:
        supabase.storage.create_bucket(bucket, options={"public": True})


async def upload_mask(
    mask_img: Image.Image,
    source_bucket: str,
    source_path: str,
    image_id: str,
) -> str:
    """Upload colourised mask PNG, return its public URL."""
    bucket = _mask_bucket(source_bucket)
    await _ensure_bucket(bucket)

    stem      = Path(source_path).stem
    mask_path = f"masks/{image_id}/{stem}_seg.png"

    buf = io.BytesIO()
    mask_img.save(buf, format="PNG")
    buf.seek(0)

    supabase.storage.from_(bucket).upload(
        path=mask_path,
        file=buf.read(),
        file_options={"content-type": "image/png", "upsert": "true"},
    )

    public_url = supabase.storage.from_(bucket).get_public_url(mask_path)
    return public_url


# ── DB helpers ────────────────────────────────────────────────────────────────

def upsert_segmentation(
    image_id: str,
    flight_id: str,
    mask_url: str,
    label_counts: dict[str, int],
    model_name: str = "segformer_b0_v5_1",
) -> None:
    supabase.table("image_segmentations").upsert(
        {
            "image_id":     image_id,
            "flight_id":    flight_id,
            "mask_url":     mask_url,
            "label_counts": json.dumps(label_counts),
            "model_name":   model_name,
        },
        on_conflict="image_id",
    ).execute()


def fetch_existing_segmentation(image_id: str) -> dict | None:
    res = (
        supabase.table("image_segmentations")
        .select("*")
        .eq("image_id", image_id)
        .maybe_single()
        .execute()
    )
    return res.data


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/api/segment/flight/{flight_id}")
async def segment_flight(
    flight_id: str,
    force: bool = False,          # ?force=true to re-run even if mask exists
    user: Any = Depends(get_current_user),
) -> dict:
    """
    Run SegFormer segmentation on all images attached to a flight.
    Returns a list of per-image results with mask_url and label_counts.
    """
    # 1. Fetch image rows for this flight
    img_res = (
        supabase.table("images")
        .select("id, storage_path, bucket_name, flight_id")
        .eq("flight_id", flight_id)
        .execute()
    )
    flight_images: list[dict] = img_res.data or []
    if not flight_images:
        raise HTTPException(404, "No images found for this flight")

    results = []

    for img_row in flight_images:
        image_id     = img_row["id"]
        storage_path = img_row["storage_path"]
        bucket       = img_row["bucket_name"]

        # Skip if already segmented (unless forced)
        if not force:
            existing = fetch_existing_segmentation(image_id)
            if existing:
                results.append({
                    "image_id":    image_id,
                    "mask_url":    existing["mask_url"],
                    "label_counts": json.loads(existing.get("label_counts") or "{}"),
                    "cached":      True,
                })
                continue

        # 2. Download original image from Supabase storage
        raw_bytes = supabase.storage.from_(bucket).download(storage_path)
        pil_img   = Image.open(io.BytesIO(raw_bytes)).convert("RGB")

        # 3. Tile → infer → stitch
        class_map = segment_image(pil_img)          # H×W uint8

        # 4. Colourise
        mask_img     = colourise(class_map)
        label_counts = count_labels(class_map)

        # 5. Upload mask
        mask_url = await upload_mask(mask_img, bucket, storage_path, image_id)

        # 6. Persist to DB
        upsert_segmentation(image_id, flight_id, mask_url, label_counts)

        results.append({
            "image_id":    image_id,
            "mask_url":    mask_url,
            "label_counts": label_counts,
            "cached":      False,
        })

    return {"flight_id": flight_id, "results": results}


# ── Optional: GET to check status without re-running ─────────────────────────

@router.get("/api/segment/flight/{flight_id}")
async def get_flight_segmentations(
    flight_id: str,
    user: Any = Depends(get_current_user),
) -> dict:
    """Return cached segmentation results for a flight (no inference)."""
    res = (
        supabase.table("image_segmentations")
        .select("image_id, mask_url, label_counts, model_name")
        .eq("flight_id", flight_id)
        .execute()
    )
    rows = res.data or []
    return {
        "flight_id": flight_id,
        "results": [
            {
                "image_id":    r["image_id"],
                "mask_url":    r["mask_url"],
                "label_counts": json.loads(r.get("label_counts") or "{}"),
            }
            for r in rows
        ],
    }