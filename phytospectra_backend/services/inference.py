import torch
import torchvision.transforms as T
from PIL import Image
import numpy as np
import logging
import os

logger = logging.getLogger(__name__)


class StressClassifier:
    def __init__(self, model_path: str):
        self.device = torch.device(
            'cuda' if torch.cuda.is_available() else 'cpu'
        )
        self.classes = [
            'healthy',
            'drought',
            'disease',
            'nutrient_deficiency'
        ]
        self.model = None
        self.transform = T.Compose([
            T.Resize((224, 224)),
            T.ToTensor(),
            T.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])

        if os.path.exists(model_path):
            try:
                self.model = torch.load(
                    model_path,
                    map_location=self.device
                )
                self.model.eval()
                logger.info(f"Model loaded from {model_path} on {self.device}")
            except Exception as e:
                logger.warning(f"Could not load model: {e}. Using mock predictions.")
        else:
            logger.warning(f"Model weights not found at {model_path}. Using mock predictions.")

    def predict(self, image_array: np.ndarray) -> dict:
        """
        Takes a (H, W, 3) numpy array with stacked [R, G, NIR] bands.
        Returns: { stress_class: str, confidence: float }
        """
        # If no model loaded, return mock result for development
        if self.model is None:
            return self._mock_predict(image_array)

        try:
            # Convert to uint8 PIL Image
            img_uint8 = (image_array * 255).clip(0, 255).astype(np.uint8)
            img = Image.fromarray(img_uint8)
            tensor = self.transform(img).unsqueeze(0).to(self.device)

            with torch.no_grad():
                outputs = self.model(tensor)
                probs = torch.softmax(outputs, dim=1)
                confidence, pred = torch.max(probs, 1)

            return {
                'stress_class': self.classes[pred.item()],
                'confidence': round(confidence.item(), 3)
            }
        except Exception as e:
            logger.error(f"Inference error: {e}")
            return self._mock_predict(image_array)

    def _mock_predict(self, image_array: np.ndarray) -> dict:
        """
        Mock prediction based on mean NIR channel value.
        Used when model weights are not available.
        """
        import random
        mean_nir = float(np.mean(image_array[:, :, 2]))

        if mean_nir > 0.6:
            cls, conf = 'healthy', random.uniform(0.82, 0.97)
        elif mean_nir > 0.4:
            cls, conf = 'mild_stress', random.uniform(0.75, 0.89)
        elif mean_nir > 0.2:
            cls, conf = random.choice(['drought', 'disease']), random.uniform(0.78, 0.92)
        else:
            cls, conf = 'nutrient_deficiency', random.uniform(0.80, 0.95)

        return {
            'stress_class': cls,
            'confidence': round(conf, 3)
        }


# Singleton instance
_classifier = None

def get_classifier(model_path: str) -> StressClassifier:
    global _classifier
    if _classifier is None:
        _classifier = StressClassifier(model_path)
    return _classifier