# test_segformer_model.py - Test your trained model on images

import torch
import cv2
import numpy as np
from PIL import Image
from pathlib import Path
import matplotlib.pyplot as plt
from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

# Load your trained model
def load_model(model_path="models/segformer_b0_v5_1.pt"):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    
    # Load processor
    processor = SegformerImageProcessor.from_pretrained(
        "nvidia/mit-b0",
        do_resize=False,
        do_rescale=True,
        do_normalize=True
    )
    
    # Load model architecture
    model = SegformerForSemanticSegmentation.from_pretrained(
        "nvidia/mit-b0",
        num_labels=2,  # healthy, stressed
        ignore_mismatched_sizes=True,
    )
    
    # Load your trained weights
    state_dict = torch.load(model_path, map_location=device)
    model.load_state_dict(state_dict)
    model = model.to(device)
    model.eval()
    
    print(f"✓ Model loaded from {model_path}")
    return model, processor, device

def predict_image(model, processor, device, image_path, save_result=True):
    """Run inference on a single image"""
    
    # Load image
    image = Image.open(image_path).convert("RGB")
    original_size = image.size
    
    # Preprocess
    image_resized = image.resize((512, 512), Image.BILINEAR)
    inputs = processor(images=image_resized, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    
    # Inference
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
    
    # Upsample to original size
    import torch.nn.functional as F
    logits_up = F.interpolate(
        logits, 
        size=(original_size[1], original_size[0]),
        mode="bilinear", 
        align_corners=False
    )
    
    # Get predictions
    predictions = logits_up.argmax(dim=1).squeeze(0).cpu().numpy()
    
    # Calculate metrics
    total_pixels = predictions.size
    healthy_pixels = (predictions == 0).sum()  # 0 = healthy in your model
    stressed_pixels = (predictions == 1).sum()  # 1 = stressed
    
    healthy_pct = (healthy_pixels / total_pixels) * 100
    stressed_pct = (stressed_pixels / total_pixels) * 100
    
    # Health score (0-100)
    health_score = (healthy_pct * 1.0) + (stressed_pct * 0.2)
    
    if health_score >= 70:
        status = "✅ HEALTHY"
    elif health_score >= 40:
        status = "⚠️  STRESSED"
    else:
        status = "🔴 SEVERELY STRESSED"
    
    print(f"\n📊 Results for {Path(image_path).name}:")
    print(f"   Health Score: {health_score:.1f}%")
    print(f"   Status: {status}")
    print(f"   Healthy: {healthy_pct:.1f}% ({healthy_pixels:,} pixels)")
    print(f"   Stressed: {stressed_pct:.1f}% ({stressed_pixels:,} pixels)")
    
    # Create visualization
    if save_result:
        # Color map
        color_map = {
            0: (46, 204, 113),   # Healthy - green
            1: (231, 76, 60),    # Stressed - red
        }
        
        # Create colored mask
        colored_mask = np.zeros((*predictions.shape, 3), dtype=np.uint8)
        for class_id, color in color_map.items():
            colored_mask[predictions == class_id] = color
        
        # Overlay
        original_np = np.array(image)
        overlay = cv2.addWeighted(original_np, 0.55, colored_mask, 0.45, 0)
        
        # Save results
        result_path = Path("test_results") / f"{Path(image_path).stem}_result.jpg"
        result_path.parent.mkdir(exist_ok=True)
        cv2.imwrite(str(result_path), cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))
        print(f"   Result saved: {result_path}")
        
        # Display
        fig, axes = plt.subplots(1, 3, figsize=(15, 5))
        axes[0].imshow(original_np)
        axes[0].set_title("Original Image")
        axes[0].axis("off")
        
        axes[1].imshow(colored_mask)
        axes[1].set_title(f"Segmentation\nHealthy (green) | Stressed (red)")
        axes[1].axis("off")
        
        axes[2].imshow(overlay)
        axes[2].set_title(f"Overlay - Health: {health_score:.1f}%")
        axes[2].axis("off")
        
        plt.tight_layout()
        plt.savefig(f"test_results/{Path(image_path).stem}_display.png", dpi=150)
        plt.show()
    
    return {
        "health_score": health_score,
        "healthy_percentage": healthy_pct,
        "stressed_percentage": stressed_pct,
        "status": status,
        "predictions": predictions
    }

def batch_test(model, processor, device, test_folder="test_images"):
    """Test all images in a folder"""
    test_folder = Path(test_folder)
    if not test_folder.exists():
        print(f"❌ Test folder not found: {test_folder}")
        print(f"   Creating {test_folder}...")
        test_folder.mkdir(parents=True, exist_ok=True)
        print(f"   Please add test images to {test_folder}")
        return
    
    image_extensions = [".jpg", ".jpeg", ".png", ".tif", ".tiff"]
    images = [f for f in test_folder.iterdir() if f.suffix.lower() in image_extensions]
    
    if not images:
        print(f"❌ No images found in {test_folder}")
        return
    
    print(f"\n🔍 Testing {len(images)} images...")
    results = []
    
    for img_path in images:
        result = predict_image(model, processor, device, img_path, save_result=True)
        results.append({
            "image": img_path.name,
            **result
        })
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    for r in results:
        print(f"{r['image']:30} Health: {r['health_score']:5.1f}% | {r['status']}")
    
    return results

if __name__ == "__main__":
    # Setup directories
    Path("models").mkdir(exist_ok=True)
    Path("test_images").mkdir(exist_ok=True)
    Path("test_results").mkdir(exist_ok=True)
    
    print("="*60)
    print("SEGFORMER V5.1 MODEL TESTER")
    print("="*60)
    
    # Load model
    model, processor, device = load_model("models/segformer_b0_v5_1.pt")
    
    # Test single image or batch
    print("\nOptions:")
    print("1. Test single image")
    print("2. Test all images in test_images folder")
    
    choice = input("\nEnter choice (1 or 2): ").strip()
    
    if choice == "1":
        img_path = input("Enter image path: ").strip()
        if Path(img_path).exists():
            predict_image(model, processor, device, img_path)
        else:
            print(f"❌ Image not found: {img_path}")
    else:
        batch_test(model, processor, device, "test_images")