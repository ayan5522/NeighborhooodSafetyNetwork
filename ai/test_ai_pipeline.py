"""
Unit and Integration Tests for Module 9 Python AI Component
"""

import sys
import json
import subprocess
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent))
from services.predict import predict_trust_score, validate_features


def test_high_trust_incident():
    features = {
        "category": "ACCIDENT",
        "severity": "HIGH",
        "confirmation_count": 6,
        "dispute_count": 0,
        "confirmation_ratio": 1.0,
        "incident_age_hours": 3.5,
        "similar_incident_count": 2,
        "reporter_previous_reports": 8,
        "reporter_previous_confirmed_reports": 7,
        "reporter_previous_disputed_reports": 0,
        "reporter_reliability": 0.875,
        "nearby_incident_consistency": 0.85,
        "moderation_history": 0.5,
    }
    result = predict_trust_score(features)
    assert result["trust_score"] >= 80, f"Expected high trust score >= 80, got {result['trust_score']}"
    assert result["confidence_level"] == "HIGH", f"Expected HIGH confidence, got {result['confidence_level']}"
    assert result["trust_category"] == "VERY_HIGH" or result["trust_category"] == "HIGH"
    assert len(result["explanation"]) > 0
    print(f"[PASS] test_high_trust_incident: Score={result['trust_score']}, Conf={result['confidence_level']}")


def test_cold_start_incident():
    features = {
        "category": "SUSPICIOUS_ACTIVITY",
        "severity": "LOW",
        "confirmation_count": 0,
        "dispute_count": 0,
        "confirmation_ratio": 0.5,
        "incident_age_hours": 0.5,
        "similar_incident_count": 0,
        "reporter_previous_reports": 0,
        "reporter_previous_confirmed_reports": 0,
        "reporter_previous_disputed_reports": 0,
        "reporter_reliability": 0.5,
        "nearby_incident_consistency": 0.5,
        "moderation_history": 0.0,
    }
    result = predict_trust_score(features)
    # Cold start must have LOW confidence
    assert result["confidence_level"] == "LOW", f"Expected LOW confidence for cold start, got {result['confidence_level']}"
    assert "Preliminary estimate" in result["explanation"][0]
    print(f"[PASS] test_cold_start_incident: Score={result['trust_score']}, Conf={result['confidence_level']}")


def test_high_dispute_incident():
    features = {
        "category": "FIRE",
        "severity": "CRITICAL",
        "confirmation_count": 0,
        "dispute_count": 7,
        "confirmation_ratio": 0.0,
        "incident_age_hours": 2.0,
        "similar_incident_count": 0,
        "reporter_previous_reports": 3,
        "reporter_previous_confirmed_reports": 0,
        "reporter_previous_disputed_reports": 2,
        "reporter_reliability": 0.15,
        "nearby_incident_consistency": 0.10,
        "moderation_history": -0.7,
    }
    result = predict_trust_score(features)
    assert result["trust_score"] <= 35, f"Expected low trust score <= 35, got {result['trust_score']}"
    assert result["confidence_level"] == "HIGH"  # 7 disputes gives high confidence in unreliability
    print(f"[PASS] test_high_dispute_incident: Score={result['trust_score']}, Conf={result['confidence_level']}")


def test_validation_errors():
    # 1. Negative count
    f1 = {
        "category": "ACCIDENT",
        "severity": "HIGH",
        "confirmation_count": -5,
        "dispute_count": 0,
        "confirmation_ratio": 0.5,
        "incident_age_hours": 1.0,
        "similar_incident_count": 0,
        "reporter_previous_reports": 0,
        "reporter_previous_confirmed_reports": 0,
        "reporter_previous_disputed_reports": 0,
        "reporter_reliability": 0.5,
        "nearby_incident_consistency": 0.5,
        "moderation_history": 0.0,
    }
    valid, msg = validate_features(f1)
    assert not valid and "cannot be negative" in msg

    # 2. NaN value
    f2 = dict(f1)
    f2["confirmation_count"] = 1
    f2["nearby_incident_consistency"] = float("nan")
    valid, msg = validate_features(f2)
    assert not valid and "cannot be NaN" in msg

    # 3. Invalid category
    f3 = dict(f1)
    f3["confirmation_count"] = 1
    f3["category"] = "ALIEN_INVASION"
    valid, msg = validate_features(f3)
    assert not valid and "Invalid category" in msg

    print("[PASS] test_validation_errors: All edge cases rejected as expected.")


def test_cli_execution():
    features = {
        "category": "ROAD_HAZARD",
        "severity": "MEDIUM",
        "confirmation_count": 3,
        "dispute_count": 1,
        "confirmation_ratio": 0.75,
        "incident_age_hours": 1.5,
        "similar_incident_count": 1,
        "reporter_previous_reports": 4,
        "reporter_previous_confirmed_reports": 3,
        "reporter_previous_disputed_reports": 0,
        "reporter_reliability": 0.8,
        "nearby_incident_consistency": 0.7,
        "moderation_history": 0.2,
    }
    script_path = Path(__file__).resolve().parent / "services" / "predict.py"
    proc = subprocess.run(
        [sys.executable, str(script_path), "--stdin"],
        input=json.dumps(features),
        text=True,
        capture_output=True,
    )
    assert proc.returncode == 0, f"CLI error: {proc.stderr}"
    res = json.loads(proc.stdout)
    assert res["success"] is True
    assert "trust_score" in res["data"]
    print(f"[PASS] test_cli_execution: CLI returned valid response: score={res['data']['trust_score']}")


if __name__ == "__main__":
    test_high_trust_incident()
    test_cold_start_incident()
    test_high_dispute_incident()
    test_validation_errors()
    test_cli_execution()
    print("\nALL PYTHON AI TESTS PASSED SUCCESSFULLY! (5/5)\n")
