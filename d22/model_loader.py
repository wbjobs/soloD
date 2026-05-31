import torch
from transformers import pipeline
from PIL import Image
import io
from typing import Dict, Any
import numpy as np

class ModelLoader:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.emotion_classifier = None
        self.face_expression_classifier = None
        
    def load_models(self):
        self.emotion_classifier = pipeline(
            "text-classification",
            model="distilbert-base-uncased-finetuned-sst-2-english",
            device=self.device
        )
        
        self.face_expression_classifier = pipeline(
            "image-classification",
            model="microsoft/resnet-50",
            device=self.device
        )
        
    def predict_text_emotion(self, text: str) -> Dict[str, Any]:
        result = self.emotion_classifier(text)[0]
        label = result["label"]
        score = result["score"]
        
        if label == "POSITIVE":
            return {"emotion": "positive", "score": score}
        elif label == "NEGATIVE":
            return {"emotion": "negative", "score": score}
        else:
            return {"emotion": "neutral", "score": score}
            
    def predict_face_expression(self, image_data: bytes) -> Dict[str, Any]:
        image = Image.open(io.BytesIO(image_data))
        if image.mode != "RGB":
            image = image.convert("RGB")
            
        results = self.face_expression_classifier(image)
        top_result = results[0]
        
        expression = top_result["label"]
        score = top_result["score"]
        
        positive_expressions = ["happy", "joy", "smile"]
        negative_expressions = ["sad", "angry", "fear", "disgust"]
        
        expression_lower = expression.lower()
        
        if any(pos in expression_lower for pos in positive_expressions):
            return {"emotion": "positive", "score": score}
        elif any(neg in expression_lower for neg in negative_expressions):
            return {"emotion": "negative", "score": score}
        else:
            return {"emotion": "neutral", "score": score}
            
    def fuse_emotions(self, text_result: Dict[str, Any], face_result: Dict[str, Any]) -> Dict[str, Any]:
        text_emotion = text_result["emotion"]
        text_score = text_result["score"]
        face_emotion = face_result["emotion"]
        face_score = face_result["score"]
        
        emotion_scores = {
            "positive": 0.0,
            "negative": 0.0,
            "neutral": 0.0
        }
        
        text_weight = 0.5
        face_weight = 0.5
        
        high_confidence_threshold = 0.8
        low_confidence_threshold = 0.4
        
        if text_emotion != face_emotion:
            text_high_conf = text_score >= high_confidence_threshold
            face_high_conf = face_score >= high_confidence_threshold
            
            if text_high_conf and not face_high_conf:
                text_weight = 0.7
                face_weight = 0.3
            elif face_high_conf and not text_high_conf:
                text_weight = 0.3
                face_weight = 0.7
            elif text_high_conf and face_high_conf:
                return {
                    "final_emotion": "neutral",
                    "final_score": 0.5,
                    "text_analysis": text_result,
                    "face_analysis": face_result,
                    "conflict": True
                }
        
        emotion_scores[text_emotion] += text_score * text_weight
        emotion_scores[face_emotion] += face_score * face_weight
        
        for emotion in emotion_scores:
            if emotion != text_emotion and emotion != face_emotion:
                emotion_scores[emotion] = (
                    text_score * text_weight * 0.1 + 
                    face_score * face_weight * 0.1
                )
        
        final_emotion = max(emotion_scores, key=emotion_scores.get)
        final_score = emotion_scores[final_emotion]
        
        return {
            "final_emotion": final_emotion,
            "final_score": float(final_score),
            "text_analysis": text_result,
            "face_analysis": face_result,
            "weights": {"text": text_weight, "face": face_weight}
        }
        
    def predict(self, text: str, image_data: bytes) -> Dict[str, Any]:
        text_result = self.predict_text_emotion(text)
        face_result = self.predict_face_expression(image_data)
        return self.fuse_emotions(text_result, face_result)
