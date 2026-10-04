"""
Model Training & Selection Script
Module 9 - AI Trust & Reliability Engine

Trains:
1. Baseline Model: Logistic Regression
2. Candidate Model A: Random Forest Classifier
3. Candidate Model B: Gradient Boosting Classifier

Compares models on the 15% validation set, selects the best model,
and serializes the full pipeline (preprocessor + classifier) to disk.
"""

import sys
import json
from pathlib import Path

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from sklearn.pipeline import Pipeline

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))
from config.config import (
    DATASET_CSV_PATH,
    MODEL_PATH,
    MODELS_DIR,
    RANDOM_SEED,
    MODEL_VERSION,
    FEATURE_VERSION,
)
from preprocessing.preprocess import create_preprocessor, split_data


def evaluate_candidate(model_name: str, pipeline: Pipeline, X_val: pd.DataFrame, y_val: pd.Series) -> dict:
    """Compute standard classification metrics on validation set."""
    y_pred = pipeline.predict(X_val)
    y_proba = pipeline.predict_proba(X_val)[:, 1]

    metrics = {
        "model": model_name,
        "accuracy": round(float(accuracy_score(y_val, y_pred)), 4),
        "precision": round(float(precision_score(y_val, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_val, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_val, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_val, y_proba)), 4),
    }
    return metrics


def train_and_select_model():
    print("=" * 60)
    print("MODULE 9: AI TRUST ENGINE MODEL TRAINING & SELECTION")
    print("=" * 60)

    # 1. Load Dataset
    if not DATASET_CSV_PATH.exists():
        raise FileNotFoundError(f"Dataset not found at {DATASET_CSV_PATH}. Run generate_dataset.py first.")

    df = pd.read_csv(DATASET_CSV_PATH)
    print(f"Loaded dataset: {len(df)} records from {DATASET_CSV_PATH}")

    # 2. Stratified Data Split (70% Train, 15% Val, 15% Test)
    X_train, X_val, X_test, y_train, y_val, y_test = split_data(df)
    print(f"Data Split -> Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)}")

    # 3. Model Definitions
    candidates = {
        "Baseline_LogisticRegression": LogisticRegression(
            max_iter=1000,
            class_weight="balanced",
            random_state=RANDOM_SEED,
        ),
        "Candidate_RandomForest": RandomForestClassifier(
            n_estimators=100,
            max_depth=8,
            class_weight="balanced",
            random_state=RANDOM_SEED,
        ),
        "Candidate_GradientBoosting": GradientBoostingClassifier(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=4,
            random_state=RANDOM_SEED,
        ),
    }

    results = []
    trained_pipelines = {}

    print("\n--- Training Candidates on Training Set (70%) ---")
    for name, clf in candidates.items():
        print(f"Training {name}...")
        preprocessor = create_preprocessor()
        pipe = Pipeline(steps=[("preprocessor", preprocessor), ("classifier", clf)])
        pipe.fit(X_train, y_train)
        trained_pipelines[name] = pipe

        metrics = evaluate_candidate(name, pipe, X_val, y_val)
        results.append(metrics)
        print(
            f"  -> Val Accuracy: {metrics['accuracy']:.4f} | Precision: {metrics['precision']:.4f} "
            f"| Recall: {metrics['recall']:.4f} | F1: {metrics['f1']:.4f} | ROC-AUC: {metrics['roc_auc']:.4f}"
        )

    # 4. Model Selection based on Validation F1-score & ROC-AUC
    # Sort candidates by F1 score
    results_sorted = sorted(results, key=lambda x: (x["f1"], x["roc_auc"]), reverse=True)
    best_candidate = results_sorted[0]
    best_name = best_candidate["model"]

    print("\n" + "=" * 60)
    print("VALIDATION COMPARISON SUMMARY")
    print("=" * 60)
    for res in results:
        star = " * SELECTED" if res["model"] == best_name else ""
        print(f"{res['model']:<30} | F1: {res['f1']:.4f} | AUC: {res['roc_auc']:.4f} | Acc: {res['accuracy']:.4f}{star}")
    print("=" * 60)

    # 5. Fit selected model architecture on combined Train + Val for final robustness
    print(f"\nRefitting best model ({best_name}) on Train + Validation sets (85%)...")
    X_train_val = pd.concat([X_train, X_val], axis=0)
    y_train_val = pd.concat([y_train, y_val], axis=0)

    best_clf = candidates[best_name]
    final_pipeline = Pipeline(
        steps=[
            ("preprocessor", create_preprocessor()),
            ("classifier", best_clf),
        ]
    )
    final_pipeline.fit(X_train_val, y_train_val)

    # 6. Save Model & Pipeline to Disk
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_pipeline, MODEL_PATH)
    print(f"Saved complete ML pipeline to: {MODEL_PATH}")

    # Save training report metadata
    training_summary = {
        "model_version": MODEL_VERSION,
        "feature_version": FEATURE_VERSION,
        "selected_model": best_name,
        "validation_results": results,
        "train_size": len(X_train),
        "val_size": len(X_val),
        "test_size": len(X_test),
    }

    with open(MODELS_DIR / "training_summary.json", "w") as f:
        json.dump(training_summary, f, indent=2)

    print("Model training complete.")
    return final_pipeline, best_name


if __name__ == "__main__":
    train_and_select_model()
