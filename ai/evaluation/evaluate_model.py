"""
Model Evaluation Script
Module 9 - AI Trust & Reliability Engine

Evaluates the selected model ONLY on the unseen 15% Test set.
Generates:
- Accuracy, Precision, Recall, F1-Score, ROC-AUC
- Confusion Matrix (TN, FP, FN, TP)
- Feature Importance ranking
- Serializes complete evaluation metrics to ai/models/metrics.json
"""

import sys
import json
from datetime import datetime, timezone
from pathlib import Path

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))
from config.config import (
    DATASET_CSV_PATH,
    MODEL_PATH,
    METRICS_PATH,
    MODEL_VERSION,
    FEATURE_VERSION,
    NUMERIC_FEATURES,
    CATEGORICAL_FEATURES,
)
from preprocessing.preprocess import split_data


def evaluate_on_test_set():
    print("=" * 65)
    print("MODULE 9: AI TRUST ENGINE TEST SET EVALUATION")
    print("=" * 65)

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Trained model not found at {MODEL_PATH}. Run train_model.py first.")

    pipeline = joblib.load(MODEL_PATH)
    print(f"Loaded trained pipeline from: {MODEL_PATH}")

    df = pd.read_csv(DATASET_CSV_PATH)
    X_train, X_val, X_test, y_train, y_val, y_test = split_data(df)

    print(f"Evaluating strictly on held-out TEST set: {len(X_test)} records (Positive: {y_test.sum()})")

    # Predict on test set
    y_pred = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]

    # Metrics
    acc = float(accuracy_score(y_test, y_pred))
    prec = float(precision_score(y_test, y_pred, zero_division=0))
    rec = float(recall_score(y_test, y_pred, zero_division=0))
    f1 = float(f1_score(y_test, y_pred, zero_division=0))
    auc = float(roc_auc_score(y_test, y_proba))

    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()

    # Extract Feature Importances
    preprocessor = pipeline.named_steps["preprocessor"]
    classifier = pipeline.named_steps["classifier"]

    # Extract feature names from preprocessor
    num_feature_names = NUMERIC_FEATURES
    cat_feature_names = list(
        preprocessor.named_transformers_["cat"].named_steps["onehot"].get_feature_names_out(CATEGORICAL_FEATURES)
    )
    all_feature_names = num_feature_names + cat_feature_names

    feature_importances = []
    if hasattr(classifier, "feature_importances_"):
        importances = classifier.feature_importances_
        feature_ranking = sorted(
            zip(all_feature_names, importances),
            key=lambda x: x[1],
            reverse=True,
        )
        feature_importances = [
            {"feature": feat, "importance": round(float(imp), 4)}
            for feat, imp in feature_ranking
        ]

    # Metrics payload
    metrics_report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model_version": MODEL_VERSION,
        "feature_version": FEATURE_VERSION,
        "dataset": {
            "total_records": len(df),
            "train_size": len(X_train),
            "validation_size": len(X_val),
            "test_size": len(X_test),
            "test_class_distribution": {
                "reliable_positive": int(y_test.sum()),
                "unreliable_negative": int((y_test == 0).sum()),
            },
        },
        "test_metrics": {
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1_score": round(f1, 4),
            "roc_auc": round(auc, 4),
        },
        "confusion_matrix": {
            "true_negatives": int(tn),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "true_positives": int(tp),
        },
        "top_features": feature_importances[:8],
    }

    # Save metrics JSON
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics_report, f, indent=2)
    print(f"Saved evaluation report to: {METRICS_PATH}")

    # Display results
    print("\n" + "=" * 65)
    print("FINAL TEST SET PERFORMANCE METRICS")
    print("=" * 65)
    print(f"Accuracy:          {acc * 100:.2f}%")
    print(f"Precision:         {prec * 100:.2f}%  (When model flags reliable, it is correct)")
    print(f"Recall:            {rec * 100:.2f}%  (Captures percentage of truly reliable reports)")
    print(f"F1-Score:          {f1 * 100:.2f}%  (Harmonic mean of precision & recall)")
    print(f"ROC-AUC:           {auc:.4f}")
    print("\nConfusion Matrix:")
    print(f"  True Negatives (Correctly marked Unreliable):   {tn}")
    print(f"  False Positives (Unreliable marked as Reliable): {fp}")
    print(f"  False Negatives (Reliable marked as Unreliable): {fn}")
    print(f"  True Positives (Correctly marked Reliable):     {tp}")
    print("\nTop 5 Predictive Features:")
    for idx, item in enumerate(feature_importances[:5], 1):
        print(f"  {idx}. {item['feature']:<30} (importance: {item['importance']:.4f})")
    print("=" * 65 + "\n")

    return metrics_report


if __name__ == "__main__":
    evaluate_on_test_set()
