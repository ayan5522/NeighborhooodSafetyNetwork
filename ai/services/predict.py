"""
Prediction Service for AI Trust & Reliability Engine
Module 9 - Neighborhood Safety & Alert Network

Accepts structured incident features, validates inputs strictly,
evaluates trust score using the serialized pipeline, applies cold-start
confidence heuristics, and generates human-explainable factors.
"""

import sys
import json
import math
import argparse
from pathlib import Path
from typing import Dict, Any, List, Tuple

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import joblib
import numpy as np
import pandas as pd

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))
from config.config import (
    MODEL_PATH,
    MODEL_VERSION,
    FEATURE_VERSION,
    CATEGORIES,
    SEVERITIES,
    NUMERIC_FEATURES,
    CATEGORICAL_FEATURES,
)

# Global cached pipeline
_CACHED_PIPELINE = None


def get_pipeline():
    global _CACHED_PIPELINE
    if _CACHED_PIPELINE is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Model file not found at {MODEL_PATH}. Train the model first.")
        _CACHED_PIPELINE = joblib.load(MODEL_PATH)
    return _CACHED_PIPELINE


def validate_features(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Strict validation for inference inputs. Rejects NaN, negative counts, invalid categories."""
    if not isinstance(data, dict):
        return False, "Input data must be a JSON object"

    # Check required fields
    for field in NUMERIC_FEATURES + CATEGORICAL_FEATURES:
        if field not in data:
            return False, f"Missing required feature: '{field}'"

    # Validate category & severity
    cat = str(data.get("category", "")).strip().upper()
    if cat not in CATEGORIES:
        return False, f"Invalid category '{cat}'. Allowed: {', '.join(CATEGORIES)}"

    sev = str(data.get("severity", "")).strip().upper()
    if sev not in SEVERITIES:
        return False, f"Invalid severity '{sev}'. Allowed: {', '.join(SEVERITIES)}"

    # Validate numeric features
    for field in NUMERIC_FEATURES:
        val = data.get(field)
        if val is None or not isinstance(val, (int, float)):
            return False, f"Field '{field}' must be a valid number"
        if math.isnan(val) or math.isinf(val):
            return False, f"Field '{field}' cannot be NaN or Infinity"

    # Validate counts are non-negative
    count_fields = [
        "confirmation_count",
        "dispute_count",
        "similar_incident_count",
        "reporter_previous_reports",
        "reporter_previous_confirmed_reports",
        "reporter_previous_disputed_reports",
    ]
    for field in count_fields:
        if data[field] < 0:
            return False, f"Field '{field}' cannot be negative (got {data[field]})"

    # Validate ranges
    if not (0.0 <= data["confirmation_ratio"] <= 1.0):
        return False, f"confirmation_ratio must be between 0.0 and 1.0 (got {data['confirmation_ratio']})"
    if not (0.0 <= data["reporter_reliability"] <= 1.0):
        return False, f"reporter_reliability must be between 0.0 and 1.0 (got {data['reporter_reliability']})"
    if not (0.0 <= data["nearby_incident_consistency"] <= 1.0):
        return False, f"nearby_incident_consistency must be between 0.0 and 1.0 (got {data['nearby_incident_consistency']})"
    if not (-1.0 <= data["moderation_history"] <= 1.0):
        return False, f"moderation_history must be between -1.0 and 1.0 (got {data['moderation_history']})"
    if data["incident_age_hours"] < 0:
        return False, f"incident_age_hours cannot be negative (got {data['incident_age_hours']})"

    return True, ""


def determine_confidence(conf_count: int, disp_count: int, prev_reports: int) -> str:
    """
    Cold-start aware confidence scoring.
    - Zero votes -> LOW confidence (cold start)
    - 1 to 3 community votes -> MEDIUM confidence (emerging evidence)
    - 4+ votes -> HIGH confidence (established consensus)
    """
    total_votes = conf_count + disp_count
    if total_votes == 0:
        return "LOW"
    elif total_votes <= 3:
        return "MEDIUM"
    else:
        return "HIGH"


def generate_explanation(data: Dict[str, Any], trust_score: int, confidence: str) -> List[str]:
    """Generate human-readable, non-technical explanations for the estimated score."""
    explanations = []

    conf = data["confirmation_count"]
    disp = data["dispute_count"]
    total_votes = conf + disp

    # 1. Community Verification
    if total_votes == 0:
        explanations.append("Preliminary estimate: No community verifications recorded yet.")
    elif conf > disp and disp == 0:
        explanations.append(f"Strong community consensus ({conf} neighbor confirmation{'s' if conf > 1 else ''}, 0 disputes).")
    elif conf > disp:
        explanations.append(f"Majority community confirmation ({conf} confirms vs {disp} dispute{'s' if disp > 1 else ''}).")
    elif disp > conf:
        explanations.append(f"Multiple community disputes raised ({disp} dispute{'s' if disp > 1 else ''} vs {conf} confirm).")
    else:
        explanations.append(f"Even community split ({conf} confirms, {disp} disputes).")

    # 2. Nearby Consistency
    similar = data["similar_incident_count"]
    consistency = data["nearby_incident_consistency"]
    if similar >= 2 or consistency >= 0.70:
        explanations.append("Consistent with corroborating reports and activity in the immediate neighborhood.")
    elif consistency < 0.35 and total_votes == 0:
        explanations.append("Isolated event with limited surrounding activity.")

    # 3. Reporter History
    prev = data["reporter_previous_reports"]
    rel = data["reporter_reliability"]
    if prev == 0:
        explanations.append("Reported by a newer community member (neutral baseline applied).")
    elif rel >= 0.75:
        explanations.append(f"Reporter has an established history of verified reports ({int(rel * 100)}% reliability).")
    elif rel <= 0.30 and prev >= 3:
        explanations.append("Reporter has prior reports that were frequently disputed or unverified.")

    # 4. Moderation History
    mod = data["moderation_history"]
    if mod >= 0.5:
        explanations.append("Prior moderation records support account credibility.")
    elif mod <= -0.5:
        explanations.append("Prior moderation history contains flagged or dismissed reports.")

    return explanations


def predict_trust_score(features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main prediction entry point.
    Returns:
    {
      "trust_score": int (0 - 100),
      "confidence_level": "LOW" | "MEDIUM" | "HIGH",
      "trust_category": "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH",
      "model_version": str,
      "feature_version": str,
      "explanation": [str, ...],
      "raw_probability": float
    }
    """
    is_valid, err_msg = validate_features(features)
    if not is_valid:
        raise ValueError(f"Input validation error: {err_msg}")

    pipeline = get_pipeline()

    # Build 1-row DataFrame with exact columns expected by preprocessor
    df_input = pd.DataFrame([{
        "confirmation_count": float(features["confirmation_count"]),
        "dispute_count": float(features["dispute_count"]),
        "confirmation_ratio": float(features["confirmation_ratio"]),
        "incident_age_hours": float(features["incident_age_hours"]),
        "similar_incident_count": float(features["similar_incident_count"]),
        "reporter_previous_reports": float(features["reporter_previous_reports"]),
        "reporter_previous_confirmed_reports": float(features["reporter_previous_confirmed_reports"]),
        "reporter_previous_disputed_reports": float(features["reporter_previous_disputed_reports"]),
        "reporter_reliability": float(features["reporter_reliability"]),
        "nearby_incident_consistency": float(features["nearby_incident_consistency"]),
        "moderation_history": float(features["moderation_history"]),
        "category": str(features["category"]).strip().upper(),
        "severity": str(features["severity"]).strip().upper(),
    }])

    # Raw model probability of reliability [0.0, 1.0]
    prob_reliable = float(pipeline.predict_proba(df_input)[0, 1])

    # Convert probability to Trust Score 0 - 100
    trust_score = int(round(prob_reliable * 100))
    trust_score = max(0, min(100, trust_score))

    # Trust Category
    if trust_score <= 30:
        trust_cat = "LOW"
    elif trust_score <= 60:
        trust_cat = "MODERATE"
    elif trust_score <= 80:
        trust_cat = "HIGH"
    else:
        trust_cat = "VERY_HIGH"

    # Confidence calculation considering cold start
    confidence = determine_confidence(
        features["confirmation_count"],
        features["dispute_count"],
        features["reporter_previous_reports"],
    )

    # Explanation factors
    explanations = generate_explanation(features, trust_score, confidence)

    return {
        "trust_score": trust_score,
        "confidence_level": confidence,
        "trust_category": trust_cat,
        "model_version": MODEL_VERSION,
        "feature_version": FEATURE_VERSION,
        "explanation": explanations,
        "raw_probability": round(prob_reliable, 4),
    }


def main():
    parser = argparse.ArgumentParser(description="AI Trust & Reliability Prediction CLI")
    parser.add_argument("--json", type=str, help="JSON string representing incident features")
    parser.add_argument("--stdin", action="store_true", help="Read input JSON string from stdin")
    args = parser.parse_args()

    try:
        if args.stdin:
            input_text = sys.stdin.read()
        elif args.json:
            input_text = args.json
        else:
            print(json.dumps({"success": False, "error": "No input provided. Use --json or --stdin."}))
            sys.exit(1)

        data = json.loads(input_text)
        result = predict_trust_score(data)
        print(json.dumps({"success": True, "data": result}))
        sys.exit(0)

    except ValueError as ve:
        print(json.dumps({"success": False, "error": str(ve)}))
        sys.exit(2)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Internal prediction error: {str(e)}"}))
        sys.exit(3)


if __name__ == "__main__":
    main()
