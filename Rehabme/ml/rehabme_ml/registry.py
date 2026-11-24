"""File-based model registry with enforced status rules.

status: demo       — trained on the synthetic test fixture; may only be shown with ML_ALLOW_DEMO_MODELS=true
        research   — trained on real clinical data, NOT clinically validated; hidden in production
        validated  — passed the clinical validation plan; requires a signed evidence document
        retired    — kept for audit/rollback, never served
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "artifacts"
REGISTRY = ROOT / "registry.json"


def load() -> dict:
    if REGISTRY.exists():
        return json.loads(REGISTRY.read_text(encoding="utf-8"))
    return {"models": []}


def save(reg: dict) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    REGISTRY.write_text(json.dumps(reg, indent=2, ensure_ascii=False), encoding="utf-8")


def register(entry: dict) -> dict:
    if entry["data_source"] == "synthetic_test_fixture":
        entry["status"] = "demo"  # cannot be overridden
    elif entry.get("status") not in ("research",):
        entry["status"] = "research"
    reg = load()
    for m in reg["models"]:
        if m["name"] == entry["name"]:
            m["active"] = False  # one active version per model name; old versions stay for rollback
    entry.update(active=True, registered_at=datetime.now(timezone.utc).isoformat())
    reg["models"] = [m for m in reg["models"] if not (m["name"] == entry["name"] and m["version"] == entry["version"])] + [entry]
    save(reg)
    return entry


def active() -> list[dict]:
    return [m for m in load()["models"] if m.get("active") and m["status"] != "retired"]


def set_status(name: str, version: str, status: str, evidence: str | None = None, approved_by: str | None = None) -> dict:
    reg = load()
    m = next((x for x in reg["models"] if x["name"] == name and x["version"] == version), None)
    if not m:
        raise SystemExit(f"model {name}@{version} not found")
    if status == "validated":
        if m["data_source"] == "synthetic_test_fixture":
            raise SystemExit("a model trained on synthetic data can never be marked validated")
        if not (evidence and Path(evidence).exists() and approved_by):
            raise SystemExit("validated status requires --evidence <signed validation report> and --approved-by")
        m["validation"] = {"evidence": evidence, "approved_by": approved_by, "at": datetime.now(timezone.utc).isoformat()}
    m["status"] = status
    save(reg)
    return m


def rollback(name: str, version: str) -> dict:
    """Activate a previous version (instant rollback; the service reloads on restart or /reload)."""
    reg = load()
    target = None
    for m in reg["models"]:
        if m["name"] == name:
            m["active"] = m["version"] == version
            target = m if m["active"] else target
    if not target:
        raise SystemExit(f"{name}@{version} not found")
    save(reg)
    return target


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Model registry operations")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    s = sub.add_parser("status"); s.add_argument("name"); s.add_argument("version"); s.add_argument("status", choices=["research", "validated", "retired"]); s.add_argument("--evidence"); s.add_argument("--approved-by")
    r = sub.add_parser("rollback"); r.add_argument("name"); r.add_argument("version")
    a = ap.parse_args()
    if a.cmd == "list":
        for m in load()["models"]:
            print(f"{m['name']}@{m['version']}  status={m['status']}  active={m['active']}  data={m['data_source']}")
    elif a.cmd == "status":
        print(set_status(a.name, a.version, a.status, a.evidence, a.approved_by))
    else:
        print(rollback(a.name, a.version))
