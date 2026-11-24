"""ML inference service (FastAPI). Internal-only: bind to a private network; the Node API is the only client.

  uvicorn service:app --app-dir ml --host 127.0.0.1 --port 8001
"""
from __future__ import annotations

import logging
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from rehabme_ml import __version__
from rehabme_ml.pipeline import FEATURES
from rehabme_ml.predict import load_active, predict_one

log = logging.getLogger("rehabme-ml")
app = FastAPI(title="ReHabMe ML service", version=__version__, docs_url=None, redoc_url=None)
STATE = {"models": [], "loaded_at": None, "error": None}


def reload_models():
    try:
        STATE["models"] = load_active()
        STATE["error"] = None
    except Exception as e:  # integrity failure or corrupt artifact → serve nothing rather than something wrong
        STATE["models"], STATE["error"] = [], str(e)
        log.error("model load failed: %s", e)
    STATE["loaded_at"] = time.time()


reload_models()


class Features(BaseModel):
    age: float | None = Field(None, ge=18, le=105)
    sex_female: float | None = Field(None, ge=0, le=1)
    stroke_hemorrhagic: float | None = Field(None, ge=0, le=1)
    nihss_baseline: float | None = Field(None, ge=0, le=42)
    barthel_baseline: float | None = Field(None, ge=0, le=100)
    fma_ue_baseline: float | None = Field(None, ge=0, le=66)
    moca_baseline: float | None = Field(None, ge=0, le=30)
    days_onset_to_baseline: float | None = Field(None, ge=0, le=3650)
    hypertension: float | None = Field(None, ge=0, le=1)
    diabetes: float | None = Field(None, ge=0, le=1)
    atrial_fibrillation: float | None = Field(None, ge=0, le=1)
    prior_stroke: float | None = Field(None, ge=0, le=1)


class PredictRequest(BaseModel):
    features: Features


@app.get("/health")
def health():
    return {"status": "ok" if not STATE["error"] else "degraded", "models_loaded": len(STATE["models"]), "error": STATE["error"]}


@app.get("/model")
def model_info():
    return {"pipeline_version": __version__, "features": FEATURES, "models": [
        {k: m["entry"][k] for k in ("name", "version", "task", "status", "data_source", "target", "target_label", "algorithm", "trained_at")}
        | {"metrics": {"test": {k: v for k, v in m["entry"]["metrics"]["test"].items() if not isinstance(v, dict)}}}
        for m in STATE["models"]
    ]}


@app.post("/predict")
def predict(req: PredictRequest):
    if not STATE["models"]:
        raise HTTPException(503, "no model loaded")
    feats = req.features.model_dump()
    started = time.perf_counter()
    results = [predict_one(m, feats) for m in STATE["models"]]
    # Inputs are logged as summary statistics only (for drift monitoring), never with identifiers.
    log.info("predict latency_ms=%.1f statuses=%s", (time.perf_counter() - started) * 1000, [r["status"] for r in results])
    return {"results": results}


@app.post("/reload")
def reload():
    reload_models()
    return health()
