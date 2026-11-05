from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import xgboost as xgb
import numpy as np

app = FastAPI(title="CareFlowAI AI Triage Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load XGBoost model from JSON (safer than pickle, no arbitrary code execution)
model = xgb.XGBClassifier()
model.load_model("ai_triage_xgboost.json")

# Feature name mapping: clean API names → model's internal feature names
FEATURE_MAP = {
    "age": "age",
    "gender": "gender",
    "spo2": "O2Saturation",
    "resp_rate": "RespiratoryRate",
    "heart_rate": "PulseRate",
    "systolic_bp": "BlooddpressurSystol",
    "diastolic_bp": "BlooddpressurDiastol",
    "pain_score": "PainGrade",
    "temperature": "Temperature",
}

# Feature order as expected by the model
MODEL_FEATURE_ORDER = list(model.get_booster().feature_names)


class PredictRequest(BaseModel):
    age: int = Field(..., ge=0, le=150)
    gender: int = Field(..., ge=0, le=1)
    systolic_bp: float = Field(..., ge=0, le=300)
    diastolic_bp: float = Field(..., ge=0, le=200)
    heart_rate: float = Field(..., ge=0, le=300)
    resp_rate: float = Field(..., ge=0, le=100)
    spo2: float = Field(..., ge=0, le=100)
    pain_score: float = Field(..., ge=0, le=10)
    temperature: float = Field(..., ge=25, le=45)


class PredictResponse(BaseModel):
    category: int
    red_risk: float
    yellow_risk: float
    green_risk: float


@app.get("/health")
def health():
    return {"status": "ok", "model_features": MODEL_FEATURE_ORDER}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    try:
        # Map API field names to model feature names
        req_dict = req.model_dump()
        reverse_map = {v: k for k, v in FEATURE_MAP.items()}

        feature_values = []
        for model_feat in MODEL_FEATURE_ORDER:
            api_name = reverse_map[model_feat]
            feature_values.append(req_dict[api_name])

        features = np.array([feature_values])

        # Model classes are [0, 1, 2] → map to categories [1, 2, 3]
        raw_category = int(model.predict(features)[0])
        category = raw_category + 1  # 0→1, 1→2, 2→3

        probabilities = model.predict_proba(features)[0]
        classes = list(model.classes_)

        red_risk = float(probabilities[classes.index(0)]) * 100 if 0 in classes else 0.0
        yellow_risk = float(probabilities[classes.index(1)]) * 100 if 1 in classes else 0.0
        green_risk = float(probabilities[classes.index(2)]) * 100 if 2 in classes else 0.0

        return PredictResponse(
            category=category,
            red_risk=round(red_risk, 1),
            yellow_risk=round(yellow_risk, 1),
            green_risk=round(green_risk, 1),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
