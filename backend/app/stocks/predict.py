from __future__ import annotations

import numpy as np
import pandas as pd


def _prepare_features_for_training(df: pd.DataFrame, feature_cols: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Prepare X/y arrays for regression training."""
    df = df.copy()
    if "target_3m_avg" not in df.columns:
        return np.empty((0, len(feature_cols) + 1)), np.empty((0,))
    df = df.dropna(subset=feature_cols + ["target_3m_avg"])
    if df.empty:
        return np.empty((0, len(feature_cols) + 1)), np.empty((0,))

    X = df[feature_cols].to_numpy(dtype=float)
    y = df["target_3m_avg"].to_numpy(dtype=float)

    X = np.hstack([np.ones((X.shape[0], 1)), X])
    return X, y


def _resolve_feature_columns(df: pd.DataFrame, requested_cols: list[str] | None = None) -> list[str]:
    candidates = requested_cols or [
        "close",
        "volume",
        "returns",
        "SMA_10",
        "EMA_12",
        "RSI",
        "MACD",
        "ATR",
    ]

    valid: list[str] = []
    for col in candidates:
        if col not in df.columns:
            continue
        if not pd.api.types.is_numeric_dtype(df[col]):
            continue
        if df[col].notna().sum() < 2:
            continue
        valid.append(col)
    return valid


def train_linear_model(df: pd.DataFrame, feature_cols: list[str] | None = None) -> dict:
    """Train a simple linear regression model and return coefficients."""
    feature_cols = _resolve_feature_columns(df, feature_cols)
    if not feature_cols:
        return {"coeffs": None, "feature_cols": []}

    X, y = _prepare_features_for_training(df, feature_cols)
    if X.shape[0] < 2:
        return {"coeffs": None, "feature_cols": feature_cols}

    coeffs, *_ = np.linalg.lstsq(X, y, rcond=None)
    return {"coeffs": coeffs.tolist(), "feature_cols": feature_cols}


def predict_next_close(df: pd.DataFrame, model: dict) -> float | None:
    """Predict next close using a trained linear model on the latest row."""
    coeffs = model.get("coeffs")
    if not coeffs:
        return None

    feature_cols = model.get("feature_cols", [])
    last = df.tail(1)
    if last.empty:
        return None

    X = []
    for col in feature_cols:
        X.append(last[col].iat[0] if col in last.columns else np.nan)

    if any(pd.isna(X)):
        return None

    X = np.array([1.0] + X, dtype=float)
    return float(np.dot(X, np.array(coeffs, dtype=float)))
