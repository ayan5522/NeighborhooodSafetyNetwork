"""
AI Trust & Reliability Engine Configuration
Module 9 - Neighborhood Safety & Alert Network
"""

import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "dataset"
MODELS_DIR = BASE_DIR / "models"

DATASET_CSV_PATH = DATASET_DIR / "synthetic_incidents.csv"
MODEL_PATH = MODELS_DIR / "trust_model.joblib"
METRICS_PATH = MODELS_DIR / "metrics.json"

# Versioning
MODEL_VERSION = "trust-model-v1"
FEATURE_VERSION = "v1"

# Random Seed for reproducibility
RANDOM_SEED = 42

# Incident Categories from Module 3
CATEGORIES = [
    "ACCIDENT",
    "FIRE",
    "SUSPICIOUS_ACTIVITY",
    "ROAD_HAZARD",
    "FLOOD_WATERLOGGING",
    "MEDICAL_EMERGENCY",
    "INFRASTRUCTURE_ISSUE",
    "OTHER",
]

# Severities from Module 3
SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

# Features
NUMERIC_FEATURES = [
    "confirmation_count",
    "dispute_count",
    "confirmation_ratio",
    "incident_age_hours",
    "similar_incident_count",
    "reporter_previous_reports",
    "reporter_previous_confirmed_reports",
    "reporter_previous_disputed_reports",
    "reporter_reliability",
    "nearby_incident_consistency",
    "moderation_history",
]

CATEGORICAL_FEATURES = [
    "category",
    "severity",
]

ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
TARGET_COLUMN = "final_outcome"

# Trust Score Categories (0 - 100)
TRUST_LEVEL_THRESHOLDS = {
    "LOW": (0, 30),
    "MODERATE": (31, 60),
    "HIGH": (61, 80),
    "VERY_HIGH": (81, 100),
}
