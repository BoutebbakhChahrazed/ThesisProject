"""
services/segformer_inference.py

SegFormer-B0 inference for flight-level segmentation.
Preprocessing matches segformer_v5_1 training script exactly:
  - RGN input: build_rgn_input() → [R, G, NDVI_uint8] stacked as RGB
  - NDVI: (NIR - Red) / (NIR + Red + 1e-6), NIR = channel index 2 (blue slot)
  - SegformerImageProcessor with do_resize=False, do_rescale=True, do_normalize=True
  - Patch size 512, overlap 64, soft-logit stitching

V5.1 PATCH — Global NDVI background removal:
  - Pixels with NDVI < NDVI_VEGETATION_THR are treated as background (soil/shadow/sky)
  - Background pixels are set to IGNORE_LABEL in the final class map
  - Applied after tiling inference, using the original raw float array
"""

from __future__ import annotations

import io
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from transformers import (
    SegformerForSemanticSegmentation,
    SegformerImageProcessor,
)

logger = logging.getLogger(__name__)

# ── Config — must match training script ──────────────────────────────────────
_MODEL_PATH  = Path("models/segformer_b0_v5_1.pt")
_PATCH_SIZE  = 512
_OVERLAP     = 64
_DEVICE      = "cuda" if torch.cuda.is_available() else "cpu"
_NUM_LABELS  = 2

_SEG_CLASSES = {0: "healthy", 1: "stressed"}

# Palette matches training script PALETTE exactly
_PALETTE: dict[int, tuple[int, int, int]] = {
    0: (46,  204, 113),   # healthy  — green
    1: (231,  76,  60),   # stressed — red
}

# Background / ignored pixels rendered as white in the colour mask
_BACKGROUND_COLOUR = (255, 255, 255)

# RGN channel indices (training script constants)
_RGN_RED_IDX = 0
_RGN_NIR_IDX = 2   # blue slot holds NIR in RGN imagery

# ── V5.1 PATCH — Global NDVI background threshold ────────────────────────────
# Pixels whose NDVI falls below this value are classified as background
# and excluded from the output (set to IGNORE_LABEL = 255).
# Tune for your dataset: 0.10 suits dense canopy; raise to 0.15–0.20
# if bare soil bleeds into vegetation predictions.
NDVI_VEGETATION_THR = 0.10
IGNORE_LABEL        = 255   # matches training IGNORE_INDEX


# ── Preprocessing helpers (exact copy from training script) ──────────────────

def _compute_ndvi_rgn(arr: np.ndarray) -> np.ndarray:
    """arr: HxWxC float32.  NIR is in the blue slot (index 2)."""
    red = arr[:, :, _RGN_RED_IDX].astype(np.float32)
    nir = arr[:, :, _RGN_NIR_IDX].astype(np.float32)
    return ((nir - red) / (nir + red + 1e-6)).clip(-1.0, 1.0)


def _ndvi_to_uint8(ndvi: np.ndarray) -> np.ndarray:
    return ((ndvi + 1.0) * 127.5).clip(0, 255).astype(np.uint8)


def _build_rgn_input(arr: np.ndarray) -> np.ndarray:
    """
    Convert raw image array → 3-channel uint8 [R, G, NDVI_uint8].
    Matches training script build_rgn_input() exactly.
    """
    ndvi_u8 = _ndvi_to_uint8(_compute_ndvi_rgn(arr))
    return np.stack([
        arr[:, :, _RGN_RED_IDX].clip(0, 255).astype(np.uint8),
        arr[:, :, 1].clip(0, 255).astype(np.uint8),
        ndvi_u8,
    ], axis=-1)


def _open_as_rgn_pil(image_path: str) -> tuple[Image.Image, np.ndarray, np.ndarray]:
    """
    Open an image (TIFF or RGB), apply RGN preprocessing.

    Returns:
        pil_img  : PIL RGB image with [R, G, NDVI_uint8] channels
        arr      : raw float32 array (H×W×3)
        ndvi     : float32 NDVI map (H×W), range [-1, 1]
    """
    path = Path(image_path)
    arr: np.ndarray

    # Try tifffile first (handles multi-band TIFFs)
    try:
        import tifffile
        arr = tifffile.imread(str(path)).astype(np.float32)
        if arr.ndim == 2:
            arr = np.stack([arr, arr, arr], axis=-1)
        if arr.ndim == 3 and arr.shape[0] in (1, 3):
            arr = np.transpose(arr, (1, 2, 0))
        arr = arr[:, :, :3]
    except Exception:
        arr = np.array(Image.open(path).convert("RGB")).astype(np.float32)

    ndvi      = _compute_ndvi_rgn(arr)          # H×W float32, kept for background mask
    rgn_uint8 = _build_rgn_input(arr)
    return Image.fromarray(rgn_uint8, mode="RGB"), arr, ndvi


# ── Model loader (singleton, thread-safe via lru_cache) ─────────────────────

@lru_cache(maxsize=1)
def _load_segformer() -> tuple[SegformerForSemanticSegmentation, SegformerImageProcessor]:
    if not _MODEL_PATH.exists():
        raise FileNotFoundError(
            f"SegFormer weights not found at {_MODEL_PATH.resolve()}. "
            "Place segformer_b0_v5_1.pt in the models/ folder."
        )
    logger.info(f"Loading SegFormer from {_MODEL_PATH} on {_DEVICE}")

    processor = SegformerImageProcessor.from_pretrained(
        "nvidia/mit-b0",
        do_resize=False,
        do_rescale=True,
        do_normalize=True,
    )

    model = SegformerForSemanticSegmentation.from_pretrained(
        "nvidia/mit-b0",
        num_labels=_NUM_LABELS,
        id2label=_SEG_CLASSES,
        label2id={v: k for k, v in _SEG_CLASSES.items()},
        ignore_mismatched_sizes=True,
    )
    state = torch.load(_MODEL_PATH, map_location=_DEVICE)
    if isinstance(state, dict) and "model_state_dict" in state:
        state = state["model_state_dict"]
    model.load_state_dict(state, strict=False)
    model.to(_DEVICE).eval()

    logger.info("SegFormer model ready")
    return model, processor


# ── Core tiling inference ─────────────────────────────────────────────────────

@torch.no_grad()
def _segment_pil(pil_img: Image.Image) -> np.ndarray:
    """
    Tile a full-resolution PIL image, run SegFormer on each tile,
    stitch soft logits back. Returns (H, W) uint8 class-index array.

    Matches segment_flight.py segment_image() logic exactly, but uses
    SegformerImageProcessor for normalisation (as in training).
    """
    model, processor = _load_segformer()
    W, H    = pil_img.size
    img_np  = np.array(pil_img.convert("RGB"))

    step      = _PATCH_SIZE - _OVERLAP
    logit_acc = np.zeros((_NUM_LABELS, H, W), dtype=np.float32)
    count_acc = np.zeros((H, W),               dtype=np.float32)

    rows = range(0, H, step)
    cols = range(0, W, step)

    for r in rows:
        for c in cols:
            r1, r2 = r, min(r + _PATCH_SIZE, H)
            c1, c2 = c, min(c + _PATCH_SIZE, W)
            ph, pw  = r2 - r1, c2 - c1

            patch = img_np[r1:r2, c1:c2]

            # Pad edge tiles to 512×512
            if ph < _PATCH_SIZE or pw < _PATCH_SIZE:
                pad = np.zeros((_PATCH_SIZE, _PATCH_SIZE, 3), dtype=np.uint8)
                pad[:ph, :pw] = patch
                patch = pad

            patch_pil = Image.fromarray(patch)

            # SegformerImageProcessor — matches training normalisation exactly
            encoding = processor(
                images=patch_pil,
                return_tensors="pt",
                do_resize=False,
            )
            pixel_values = encoding["pixel_values"].to(_DEVICE)   # 1×3×512×512

            out    = model(pixel_values=pixel_values)
            logits = out.logits                                     # 1×C×H'×W'

            logits = F.interpolate(
                logits, size=(_PATCH_SIZE, _PATCH_SIZE),
                mode="bilinear", align_corners=False,
            )                                                       # 1×C×512×512
            logits_np = logits.squeeze(0).cpu().numpy()             # C×512×512

            logit_acc[:, r1:r2, c1:c2] += logits_np[:, :ph, :pw]
            count_acc[r1:r2, c1:c2]    += 1.0

    count_acc = np.where(count_acc == 0, 1, count_acc)
    logit_acc /= count_acc[np.newaxis]

    return logit_acc.argmax(axis=0).astype(np.uint8)   # H×W


# ── V5.1 PATCH — Global NDVI background removal ───────────────────────────────

def _apply_ndvi_background_mask(
    class_map: np.ndarray,
    ndvi: np.ndarray,
    threshold: float = NDVI_VEGETATION_THR,
) -> np.ndarray:
    """
    Zero out predictions for non-vegetation pixels using a global NDVI threshold.

    Pixels with NDVI < threshold are considered background (soil / shadow / sky)
    and are set to IGNORE_LABEL (255) in the returned class map.

    Args:
        class_map : H×W uint8 array of predicted class indices
        ndvi      : H×W float32 NDVI map, range [-1, 1]
        threshold : NDVI cut-off below which pixels are treated as background

    Returns:
        masked class map (H×W uint8), background pixels = IGNORE_LABEL
    """
    masked = class_map.copy()
    background = ndvi < threshold        # True where pixel is NOT vegetation
    masked[background] = IGNORE_LABEL
    logger.debug(
        f"NDVI background mask: {background.sum():,} / {background.size:,} pixels "
        f"removed ({100 * background.mean():.1f}%)"
    )
    return masked


# ── Post-processing helpers ───────────────────────────────────────────────────

def _colourise(class_map: np.ndarray) -> Image.Image:
    """
    Colourise a class map.
    IGNORE_LABEL pixels → black (background).
    """
    H, W = class_map.shape
    rgb  = np.full((H, W, 3), 255, dtype=np.uint8)   # white by default = background
    for cls_idx, colour in _PALETTE.items():
        rgb[class_map == cls_idx] = colour
    return Image.fromarray(rgb, "RGB")


def _label_counts(class_map: np.ndarray) -> dict[str, int]:
    unique, counts = np.unique(class_map, return_counts=True)
    return {str(int(u)): int(c) for u, c in zip(unique, counts)}


def _compute_stats(class_map: np.ndarray) -> dict[str, Any]:
    """
    Return health metrics.
    Background pixels (IGNORE_LABEL) are excluded from the denominator so
    percentages reflect vegetation only — not the whole image footprint.
    """
    vegetation_mask = class_map != IGNORE_LABEL
    total_veg = int(vegetation_mask.sum())

    healthy  = int((class_map == 0).sum())
    stressed = int((class_map == 1).sum())

    # Percentages over vegetation pixels only (background excluded)
    health_pct   = round(healthy  / total_veg * 100, 2) if total_veg > 0 else 0.0
    stressed_pct = round(stressed / total_veg * 100, 2) if total_veg > 0 else 0.0
    health_score = health_pct   # 0–100 float, same convention as ViT pipeline

    return {
        "healthy_pixel_count":   healthy,
        "stressed_pixel_count":  stressed,
        "background_pixel_count": int((class_map == IGNORE_LABEL).sum()),
        "vegetation_pixel_count": total_veg,
        "health_percentage":     health_pct,
        "stressed_percentage":   stressed_pct,
        "health_score":          health_score,
        "stress_class":          "healthy" if healthy >= stressed else "stressed",
        "confidence":            round(max(healthy, stressed) / total_veg, 4) if total_veg > 0 else 0.0,
        "ndvi_threshold_used":   NDVI_VEGETATION_THR,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def run_segformer(
    image_path: str,
    ndvi_threshold: float = NDVI_VEGETATION_THR,
) -> dict[str, Any]:
    """
    Run full SegFormer segmentation on a single image file,
    with global NDVI-based background removal.

    Args:
        image_path     : path to the input image (TIFF or standard format)
        ndvi_threshold : NDVI cut-off for background removal (default 0.10).
                         Raise to 0.15–0.20 for images with heavy bare-soil.

    Returns:
        {
            "class_map":              np.ndarray (H×W uint8, 255=background),
            "mask_image":             PIL.Image  (RGB colourised, black=background),
            "label_counts":           {"0": int, "1": int, "255": int},
            "healthy_pixel_count":    int,
            "stressed_pixel_count":   int,
            "background_pixel_count": int,
            "vegetation_pixel_count": int,
            "health_percentage":      float,   # over vegetation only
            "stressed_percentage":    float,   # over vegetation only
            "health_score":           float,   # 0–100
            "stress_class":           str,
            "confidence":             float,
            "ndvi_threshold_used":    float,
        }
    """
    # 1. Load image → RGN PIL + raw array + NDVI map
    pil_img, _arr, ndvi = _open_as_rgn_pil(image_path)

    # 2. Tiling inference → raw class map
    class_map = _segment_pil(pil_img)

    # 3. ── V5.1 PATCH: mask out background pixels globally using NDVI ─────────
    class_map = _apply_ndvi_background_mask(class_map, ndvi, threshold=ndvi_threshold)

    # 4. Colourise + stats
    mask_image = _colourise(class_map)
    stats      = _compute_stats(class_map)

    return {
        "class_map":   class_map,
        "mask_image":  mask_image,
        "label_counts": _label_counts(class_map),
        **stats,
    }