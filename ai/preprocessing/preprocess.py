"""
Preprocessing Pipeline for AI Trust & Reliability Engine
Module 9 - Neighborhood Safety & Alert Network
"""

import sys
from pathlib import Path
from typing import Tuple
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))
from config.config import (
    CATEGORIES,
    SEVERITIES,
    NUMERIC_FEATURES,
    CATEGORICAL_FEATURES,
    TARGET_COLUMN,
    RANDOM_SEED,
)


def create_preprocessor() -> ColumnTransformer:
    """Build a unified ColumnTransformer for numeric and categorical features."""
    numeric_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    categorical_transformer = Pipeline(
        steps=[
            (
                "onehot",
                OneHotEncoder(
                    categories=[CATEGORIES, SEVERITIES],
                    handle_unknown="ignore",
                    sparse_output=False,
                ),
            )
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, NUMERIC_FEATURES),
            ("cat", categorical_transformer, CATEGORICAL_FEATURES),
        ]
    )

    return preprocessor


def split_data(
    df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, pd.Series]:
    """
    Split dataset into 70% train, 15% validation, and 15% test using stratified sampling.
    Guarantees no data leakage between splits.
    """
    X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES].copy()
    y = df[TARGET_COLUMN].copy()

    # First split: 70% train, 30% temp (for val + test)
    X_train, X_temp, y_train, y_temp = train_test_split(
        X,
        y,
        test_size=0.30,
        random_state=RANDOM_SEED,
        stratify=y,
    )

    # Second split: split 30% temp into 50/50 -> 15% validation, 15% test
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp,
        y_temp,
        test_size=0.50,
        random_state=RANDOM_SEED,
        stratify=y_temp,
    )

    return X_train, X_val, X_test, y_train, y_val, y_test


if __name__ == "__main__":
    from config.config import DATASET_CSV_PATH

    print("[Preprocessor] Testing data splitting and transformation...")
    df = pd.read_csv(DATASET_CSV_PATH)
    X_train, X_val, X_test, y_train, y_val, y_test = split_data(df)

    print(f"Total:      {len(df)}")
    print(f"Train (70%): {len(X_train)} (Positive: {y_train.sum()})")
    print(f"Val (15%):   {len(X_val)} (Positive: {y_val.sum()})")
    print(f"Test (15%):  {len(X_test)} (Positive: {y_test.sum()})")

    preprocessor = create_preprocessor()
    X_train_trans = preprocessor.fit_transform(X_train)
    print(f"Transformed feature matrix shape: {X_train_trans.shape}")
    print("[Preprocessor] Pipeline test complete.")
