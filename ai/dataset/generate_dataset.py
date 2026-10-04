"""
Synthetic Incident Dataset Generator
Module 9 - AI Trust & Reliability Engine

NOTE:
This dataset is SYNTHETIC DEVELOPMENT TRAINING DATA for ML model training,
validation, and testing. It does NOT contain real user records or production incidents.
"""

import sys
import uuid
import numpy as np
import pandas as pd
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))
from config.config import (
    CATEGORIES,
    SEVERITIES,
    DATASET_CSV_PATH,
    RANDOM_SEED,
)

NUM_RECORDS = 5000


def generate_synthetic_dataset(num_records: int = NUM_RECORDS, seed: int = RANDOM_SEED) -> pd.DataFrame:
    np.random.seed(seed)
    print(f"[Dataset Generator] Generating {num_records} synthetic incident training records (Seed: {seed})...")

    records = []

    # Category weights (common incidents like Road Hazard and Accidents slightly more frequent)
    cat_weights = [0.18, 0.08, 0.16, 0.22, 0.12, 0.10, 0.08, 0.06]
    categories = np.random.choice(CATEGORIES, size=num_records, p=cat_weights)

    # Severity distribution (Medium and Low most common, Critical rarest)
    sev_weights = [0.35, 0.40, 0.18, 0.07]
    severities = np.random.choice(SEVERITIES, size=num_records, p=sev_weights)

    # Incident age in hours (most incidents reported recently: lognormal distribution)
    incident_ages = np.clip(np.random.exponential(scale=12.0, size=num_records), 0.1, 72.0)

    for i in range(num_records):
        incident_id = f"syn-inc-{i + 1:04d}"
        cat = categories[i]
        sev = severities[i]
        age_hours = round(float(incident_ages[i]), 2)

        # 1. Reporter Profile Simulation
        # ~25% of reports are from brand new users (cold-start)
        is_new_reporter = np.random.rand() < 0.25
        if is_new_reporter:
            prev_reports = 0
            prev_confirmed = 0
            prev_disputed = 0
            # Neutral default for new users (does NOT unfairly penalize them)
            reporter_reliability = 0.50
            moderation_history = 0.0  # neutral
        else:
            # Established reporter
            prev_reports = int(np.random.randint(1, 25))
            # Reliability distribution: most people are honest (~70% high reliability, ~30% questionable)
            reporter_type = np.random.choice(["reliable", "mixed", "unreliable"], p=[0.70, 0.20, 0.10])
            if reporter_type == "reliable":
                prev_confirmed = int(np.random.binomial(prev_reports, p=0.85))
                prev_disputed = int(np.random.binomial(prev_reports - prev_confirmed, p=0.15))
                moderation_history = float(np.clip(np.random.normal(0.6, 0.2), -1.0, 1.0))
            elif reporter_type == "mixed":
                prev_confirmed = int(np.random.binomial(prev_reports, p=0.50))
                prev_disputed = int(np.random.binomial(prev_reports - prev_confirmed, p=0.50))
                moderation_history = float(np.clip(np.random.normal(0.0, 0.3), -1.0, 1.0))
            else:
                prev_confirmed = int(np.random.binomial(prev_reports, p=0.15))
                prev_disputed = int(np.random.binomial(prev_reports - prev_confirmed, p=0.75))
                moderation_history = float(np.clip(np.random.normal(-0.6, 0.2), -1.0, 1.0))

            reporter_reliability = round((prev_confirmed + 1) / (prev_reports + 2), 3)

        # 2. Underlying Ground Truth Probability (unobserved latent legitimacy)
        # Driven by reporter history and incident nature
        base_latent_prob = 0.55 + 0.30 * (reporter_reliability - 0.5) + 0.15 * moderation_history
        # Add slight variation per incident
        latent_prob = float(np.clip(base_latent_prob + np.random.normal(0, 0.1), 0.05, 0.95))

        # 3. Community Verification Votes Simulation (Correlated with latent legitimacy)
        # Older incidents have had more time to receive votes
        engagement_factor = min(1.0, age_hours / 6.0)

        if latent_prob > 0.60:
            # Genuine incident: more confirmations, few disputes
            lambda_conf = 1.0 + 8.0 * engagement_factor * latent_prob
            lambda_disp = 0.2 + 1.2 * engagement_factor * (1.0 - latent_prob)
            conf_count = int(np.random.poisson(lam=max(0.1, lambda_conf)))
            disp_count = int(np.random.poisson(lam=max(0.1, lambda_disp)))
            similar_count = int(np.random.choice([0, 1, 2, 3, 4], p=[0.30, 0.35, 0.20, 0.10, 0.05]))
            nearby_consistency = float(np.clip(np.random.normal(0.75, 0.15), 0.0, 1.0))
        else:
            # Questionable / false alarm incident: more disputes or low confirmations
            lambda_conf = 0.3 + 2.0 * engagement_factor * latent_prob
            lambda_disp = 1.0 + 6.0 * engagement_factor * (1.0 - latent_prob)
            conf_count = int(np.random.poisson(lam=max(0.1, lambda_conf)))
            disp_count = int(np.random.poisson(lam=max(0.1, lambda_disp)))
            similar_count = int(np.random.choice([0, 1, 2], p=[0.75, 0.20, 0.05]))
            nearby_consistency = float(np.clip(np.random.normal(0.35, 0.20), 0.0, 1.0))

        # Confirmation ratio handling division by zero safely
        total_votes = conf_count + disp_count
        if total_votes > 0:
            conf_ratio = round(conf_count / total_votes, 3)
        else:
            # Cold-start neutral default for incidents with zero votes
            conf_ratio = 0.50

        # 4. Final Outcome Label Generation
        # Logical combination of evidence + controlled noise
        # Log-odds calculation:
        evidence_score = (
            2.8 * (conf_ratio - 0.5)
            + 1.5 * np.log1p(conf_count)
            - 2.2 * np.log1p(disp_count)
            + 1.6 * (reporter_reliability - 0.5)
            + 1.0 * moderation_history
            + 0.8 * (nearby_consistency - 0.5)
            + 0.5 * np.log1p(similar_count)
            + np.random.normal(0, 0.5)  # Controlled realistic noise
        )

        prob_reliable = 1.0 / (1.0 + np.exp(-evidence_score))
        final_outcome = 1 if prob_reliable >= 0.50 else 0

        records.append({
            "incident_id": incident_id,
            "category": cat,
            "severity": sev,
            "confirmation_count": conf_count,
            "dispute_count": disp_count,
            "confirmation_ratio": conf_ratio,
            "incident_age_hours": age_hours,
            "similar_incident_count": similar_count,
            "reporter_previous_reports": prev_reports,
            "reporter_previous_confirmed_reports": prev_confirmed,
            "reporter_previous_disputed_reports": prev_disputed,
            "reporter_reliability": reporter_reliability,
            "nearby_incident_consistency": round(nearby_consistency, 3),
            "moderation_history": round(moderation_history, 3),
            "final_outcome": final_outcome,
        })

    df = pd.DataFrame(records)
    return df


def validate_dataset(df: pd.DataFrame) -> None:
    """Run strict quality assertions on generated dataset."""
    print("[Dataset Validator] Checking dataset quality...")

    assert len(df) == NUM_RECORDS, f"Expected {NUM_RECORDS} rows, got {len(df)}"
    assert df["incident_id"].nunique() == NUM_RECORDS, "Duplicate incident IDs detected!"

    # Missing values
    missing = df.isnull().sum()
    assert missing.sum() == 0, f"Found missing values:\n{missing[missing > 0]}"

    # Numeric constraints
    assert (df["confirmation_count"] >= 0).all(), "Negative confirmation count found!"
    assert (df["dispute_count"] >= 0).all(), "Negative dispute count found!"
    assert (df["incident_age_hours"] > 0).all(), "Zero or negative age found!"
    assert (df["similar_incident_count"] >= 0).all(), "Negative similar incident count found!"
    assert (df["reporter_previous_reports"] >= 0).all(), "Negative previous reports found!"
    assert (df["reporter_reliability"] >= 0.0).all() and (df["reporter_reliability"] <= 1.0).all(), "Invalid reliability!"
    assert (df["confirmation_ratio"] >= 0.0).all() and (df["confirmation_ratio"] <= 1.0).all(), "Invalid ratio!"
    assert (df["nearby_incident_consistency"] >= 0.0).all() and (df["nearby_incident_consistency"] <= 1.0).all(), "Invalid consistency!"
    assert (df["moderation_history"] >= -1.0).all() and (df["moderation_history"] <= 1.0).all(), "Invalid moderation history!"

    # Category and severity checks
    for cat in df["category"].unique():
        assert cat in CATEGORIES, f"Unknown category: {cat}"
    for sev in df["severity"].unique():
        assert sev in SEVERITIES, f"Unknown severity: {sev}"

    # Target checks
    assert set(df["final_outcome"].unique()).issubset({0, 1}), "Invalid target values!"

    print("[Dataset Validator] All quality checks PASSED successfully.")


if __name__ == "__main__":
    df = generate_synthetic_dataset()
    validate_dataset(df)

    DATASET_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(DATASET_CSV_PATH, index=False)
    print(f"[Dataset Generator] Successfully saved synthetic dataset to: {DATASET_CSV_PATH}")

    # Dataset distribution statistics
    total = len(df)
    reliable = int((df["final_outcome"] == 1).sum())
    unreliable = int((df["final_outcome"] == 0).sum())
    rel_pct = round((reliable / total) * 100, 2)
    unrel_pct = round((unreliable / total) * 100, 2)

    print("\n" + "=" * 50)
    print("SYNTHETIC DATASET SUMMARY STATISTICS")
    print("=" * 50)
    print(f"Total Records:      {total}")
    print(f"Reliable (1):       {reliable} ({rel_pct}%)")
    print(f"Unreliable (0):     {unreliable} ({unrel_pct}%)")
    print(f"Categories:         {len(CATEGORIES)}")
    print(f"Severities:         {len(SEVERITIES)}")
    print("=" * 50 + "\n")
