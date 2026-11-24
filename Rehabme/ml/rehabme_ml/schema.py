"""Data contract for the recovery-prediction dataset.

One row = one inpatient/outpatient rehabilitation episode. A patient may have several episodes
(e.g. recurrent stroke), so every split is done at patient level.

No clinical dataset is present in this repository. A dataset meeting this contract must be supplied
by a data partner under a data-sharing agreement and ethics approval (see DATASET_DOCUMENTATION.md).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Column:
    name: str
    kind: str  # id | date | int | float | binary | category
    required: bool = True
    min: float | None = None
    max: float | None = None
    categories: tuple[str, ...] | None = None
    timing: str = "baseline"  # baseline | outcome | admin  (outcome columns must never be features)
    description: str = ""


CONTRACT: tuple[Column, ...] = (
    Column("patient_id", "id", timing="admin", description="Pseudonymous patient identifier"),
    Column("site_id", "category", required=False, timing="admin", description="Contributing rehabilitation centre"),
    Column("admission_date", "date", timing="admin", description="Start of rehabilitation episode"),
    Column("age", "int", min=18, max=105),
    Column("sex", "category", categories=("F", "M")),
    Column("stroke_type", "category", categories=("ischemic", "hemorrhagic")),
    Column("nihss_baseline", "float", required=False, min=0, max=42, description="NIH Stroke Scale at admission"),
    Column("barthel_baseline", "float", min=0, max=100, description="Barthel Index at rehabilitation start"),
    Column("fma_ue_baseline", "float", required=False, min=0, max=66, description="Fugl-Meyer upper extremity"),
    Column("moca_baseline", "float", required=False, min=0, max=30, description="Montreal Cognitive Assessment"),
    Column("days_onset_to_baseline", "int", min=0, max=3650),
    Column("hypertension", "binary", required=False),
    Column("diabetes", "binary", required=False),
    Column("atrial_fibrillation", "binary", required=False),
    Column("prior_stroke", "binary", required=False),
    # ---- outcomes (targets) ----
    Column("bi95_event", "binary", required=False, timing="outcome", description="1 if Barthel >= 95 reached during follow-up"),
    Column("time_to_bi95_days", "float", required=False, min=0, max=3650, timing="outcome", description="Days from baseline to BI>=95, or to censoring"),
    Column("fma_ue_90d", "float", required=False, min=0, max=66, timing="outcome", description="Fugl-Meyer UE at 90 days"),
)
BY_NAME = {c.name: c for c in CONTRACT}
OUTCOME_COLUMNS = {c.name for c in CONTRACT if c.timing == "outcome"}


@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stats: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict:
        return {"ok": self.ok, "errors": self.errors, "warnings": self.warnings, "stats": self.stats}


def validate(df: pd.DataFrame) -> ValidationReport:
    """Check structure, types, ranges, categories, duplicates and outcome consistency."""
    rep = ValidationReport()
    rep.stats["rows"] = int(len(df))
    missing_required = [c.name for c in CONTRACT if c.required and c.name not in df.columns]
    if missing_required:
        rep.errors.append(f"missing required columns: {missing_required}")
        return rep
    unknown = sorted(set(df.columns) - set(BY_NAME))
    if unknown:
        rep.warnings.append(f"unknown columns ignored: {unknown}")

    for c in CONTRACT:
        if c.name not in df.columns:
            continue
        s = df[c.name]
        n_missing = int(s.isna().sum())
        if c.required and n_missing:
            rep.errors.append(f"{c.name}: {n_missing} missing values in a required column")
        if c.kind in ("int", "float", "binary"):
            num = pd.to_numeric(s, errors="coerce")
            bad = int((num.isna() & s.notna()).sum())
            if bad:
                rep.errors.append(f"{c.name}: {bad} non-numeric values")
            if c.min is not None and (num < c.min).any():
                rep.errors.append(f"{c.name}: {int((num < c.min).sum())} values below {c.min}")
            if c.max is not None and (num > c.max).any():
                rep.errors.append(f"{c.name}: {int((num > c.max).sum())} values above {c.max}")
            if c.kind == "binary" and not num.dropna().isin([0, 1]).all():
                rep.errors.append(f"{c.name}: binary column contains values other than 0/1")
        if c.kind == "category" and c.categories:
            vals = s.dropna()
            bad = vals[~vals.isin(c.categories)]
            if len(bad):
                rep.errors.append(f"{c.name}: unexpected categories {sorted(bad.unique().tolist())[:5]}")
        if c.kind == "date":
            d = pd.to_datetime(s, errors="coerce")
            if d.isna().sum() > n_missing:
                rep.errors.append(f"{c.name}: unparseable dates")

    dup_rows = int(df.duplicated().sum())
    rep.stats["exact_duplicate_rows"] = dup_rows
    if dup_rows:
        rep.warnings.append(f"{dup_rows} exact duplicate rows (will be dropped)")
    key_dups = int(df.duplicated(subset=["patient_id", "admission_date"]).sum())
    if key_dups:
        rep.warnings.append(f"{key_dups} rows share (patient_id, admission_date) — possible double entry")

    if {"bi95_event", "time_to_bi95_days"} <= set(df.columns):
        if (df["bi95_event"].notna() & df["time_to_bi95_days"].isna()).any():
            rep.errors.append("bi95_event present but time_to_bi95_days missing")
        already = df[pd.to_numeric(df["barthel_baseline"], errors="coerce") >= 95]
        if len(already):
            rep.warnings.append(f"{len(already)} episodes start at Barthel >= 95 (milestone already met) — excluded from survival task")
    return rep


def coerce(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for c in CONTRACT:
        if c.name not in out.columns:
            if not c.required:
                out[c.name] = np.nan
            continue
        if c.kind in ("int", "float", "binary"):
            out[c.name] = pd.to_numeric(out[c.name], errors="coerce").astype(float)
        elif c.kind == "date":
            out[c.name] = pd.to_datetime(out[c.name], errors="coerce")
        else:
            out[c.name] = out[c.name].astype("string")
    return out
