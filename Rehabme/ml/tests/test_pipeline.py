"""ML pipeline tests: data validation, leakage guards, patient-level splitting, interval coverage,
abstention, registry status rules and artifact integrity. Uses the synthetic fixture (software test only)."""
import json

import numpy as np
import pandas as pd
import pytest

from rehabme_ml import predict, registry, synthetic, train
from rehabme_ml.evaluation import conformal_quantile
from rehabme_ml.pipeline import FEATURES, OODDetector, assert_no_leakage, clean, split
from rehabme_ml.schema import validate


@pytest.fixture(scope="module")
def data():
    return synthetic.generate(n_patients=700, seed=3)


@pytest.fixture()
def tmp_registry(tmp_path, monkeypatch):
    monkeypatch.setattr(registry, "ROOT", tmp_path)
    monkeypatch.setattr(registry, "REGISTRY", tmp_path / "registry.json")
    monkeypatch.setattr(train, "ART", tmp_path)
    return tmp_path


def test_validation_flags_bad_data(data):
    assert validate(data).ok
    bad = data.copy()
    bad.loc[0, "age"] = 150
    bad.loc[1, "sex"] = "X"
    rep = validate(bad.drop(columns=["barthel_baseline"]))
    assert not rep.ok and any("missing required" in e for e in rep.errors)
    rep2 = validate(bad)
    assert any("age" in e for e in rep2.errors) and any("sex" in e for e in rep2.errors)


def test_outcomes_can_never_be_features():
    assert_no_leakage(FEATURES)
    with pytest.raises(ValueError):
        assert_no_leakage(FEATURES + ["fma_ue_90d"])


@pytest.mark.parametrize("strategy", ["temporal", "group"])
def test_patient_level_split_has_no_overlap(data, strategy):
    df, _ = clean(data)
    sp = split(df, strategy)
    assert not set(sp.train.patient_id) & set(sp.test.patient_id)
    assert len(sp.test) > 0 and len(sp.train) > len(sp.test)
    if strategy == "temporal":
        assert sp.test.groupby("patient_id").admission_date.min().min() > sp.train.groupby("patient_id").admission_date.min().max() - pd.Timedelta(days=1)


def test_conformal_quantile_gives_nominal_coverage():
    rng = np.random.default_rng(0)
    cal, new = np.abs(rng.normal(size=2000)), np.abs(rng.normal(size=20000))
    q = conformal_quantile(cal, alpha=0.2)
    assert 0.78 <= np.mean(new <= q) <= 0.83


def test_ood_detector_abstains_for_atypical_or_incomplete_input(data):
    df, _ = clean(data)
    ood = OODDetector(FEATURES, required=("barthel_baseline",)).fit(df)
    typical = df[FEATURES].median().to_dict()
    assert ood.check(typical)["in_distribution"]
    in_dist = np.mean([ood.check(df.iloc[i][FEATURES].to_dict())["in_distribution"] for i in range(len(df))])
    assert in_dist > 0.9  # abstention on training-like data stays rare
    extreme = {**typical, "age": 104, "nihss_baseline": 41, "barthel_baseline": 0, "moca_baseline": 0}
    assert not ood.check(extreme)["in_distribution"]
    assert not ood.check({**typical, "barthel_baseline": None})["in_distribution"]


def test_end_to_end_training_registry_and_prediction(tmp_registry, tmp_path, data):
    path = tmp_path / "fixture.csv"
    data.to_csv(path, index=False)
    (tmp_path / "fixture.csv.provenance.json").write_text(json.dumps(synthetic.PROVENANCE))

    # Refuse to relabel synthetic data as clinical
    with pytest.raises(SystemExit):
        train.main(["--data", str(path), "--data-source", "clinical", "--trials", "1", "--folds", "3"])

    train.main(["--data", str(path), "--data-source", "synthetic_test_fixture", "--trials", "2", "--folds", "3", "--version", "t1"])
    models = registry.active()
    assert {m["name"] for m in models} == {"bi95-survival", "fma-ue-90d"}
    assert all(m["status"] == "demo" for m in models)

    with pytest.raises(SystemExit):
        registry.set_status("bi95-survival", "t1", "validated", evidence=str(path), approved_by="x")

    loaded = predict.load_active()
    typical = {**{f: None for f in FEATURES}, "age": 66, "sex_female": 1, "stroke_hemorrhagic": 0, "nihss_baseline": 6, "barthel_baseline": 60,
               "fma_ue_baseline": 40, "moca_baseline": 24, "days_onset_to_baseline": 12, "hypertension": 1, "diabetes": 0, "atrial_fibrillation": 0, "prior_stroke": 0}
    out = {r["task"]: r for r in (predict.predict_one(m, typical) for m in loaded)}
    s = out["survival"]
    assert s["status"] == "ok"
    rng_ = s["prediction"]["range_days"]
    if rng_["from"] and rng_["to"]:
        assert rng_["from"] <= (s["prediction"]["median_days"] or rng_["to"]) <= rng_["to"]
    assert len(s["explanation"]["factors"]) == 5
    r = out["regression"]
    assert r["prediction"]["interval"]["low"] <= r["prediction"]["point"] <= r["prediction"]["interval"]["high"]

    already = predict.predict_one(next(m for m in loaded if m["entry"]["task"] == "survival"), {**typical, "barthel_baseline": 100})
    assert already["status"] == "abstained" and already["reason"]["code"] == "milestone_already_met"


def test_tampered_artifact_is_refused(tmp_registry, tmp_path, data):
    path = tmp_path / "fx.csv"
    data.to_csv(path, index=False)
    train.main(["--data", str(path), "--data-source", "synthetic_test_fixture", "--task", "regression", "--trials", "1", "--folds", "3", "--version", "t2"])
    entry = registry.active()[0]
    with open(tmp_registry / entry["path"], "ab") as f:
        f.write(b"tampered")
    with pytest.raises(RuntimeError, match="integrity"):
        predict.load_active()
