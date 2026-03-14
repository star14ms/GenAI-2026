import pandas as pd
import pandas_ta as ta
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
import pytz
from .model import get_stock_features, get_historical_price_series
from .predict import train_linear_model, predict_next_close

router = APIRouter()


@router.get("/api/stocks/history/{symbol}")
def get_stock_history(symbol: str, years: int = 1):
    if years not in (1, 3, 5, 10):
        raise HTTPException(status_code=400, detail="Years must be one of: 1, 3, 5, 10")

    clean_symbol = symbol.strip().upper()
    if not clean_symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    try:
        points = get_historical_price_series(clean_symbol, years)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stock history: {str(e)}")

    return {
        "symbol": clean_symbol,
        "years": years,
        "points": points,
    }

@router.get("/analysis/{symbol}")
def get_stock_analysis(symbol: str, days: int = 30):
    if not symbol or not symbol.isalpha() or len(symbol) > 5:
        raise HTTPException(status_code=400, detail="Invalid stock symbol. Must be 1-5 alphabetic characters.")
    
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 365.")
    
    try:
        df = get_stock_features(symbol, days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(e)}")

    # Drop ML target columns from display payload
    df = df.drop(columns=['target', 'target_3m_avg'], errors='ignore')
    
    # Use RSI for signal
    latest_rsi = df['RSI'].iloc[-1] if 'RSI' in df.columns else None
    if pd.isna(latest_rsi):
        signal = "Insufficient data for analysis"
    elif latest_rsi > 70:
        signal = "Overbought - Consider selling"
    elif latest_rsi < 30:
        signal = "Oversold - Consider buying"
    else:
        signal = "Neutral"
    
    # Convert DataFrame to dict for JSON response, replacing NaN with None
    import numpy as np
    data = df.tail(5).to_dict(orient='records')
    # Replace NaN with None for JSON compliance
    for record in data:
        for key, value in record.items():
            if isinstance(value, float) and np.isnan(value):
                record[key] = None

    return {
        "data": data,
        "signal": signal,
        "latest_price": df['close'].iloc[-1] if not df.empty else None
    }

@router.get("/predict/{symbol}")
def get_stock_prediction(symbol: str, days: int = 180):
    if not symbol or not symbol.isalpha() or len(symbol) > 5:
        raise HTTPException(status_code=400, detail="Invalid stock symbol. Must be 1-5 alphabetic characters.")

    if days < 30 or days > 365:
        raise HTTPException(status_code=400, detail="Days must be between 30 and 365.")

    try:
        df = get_stock_features(symbol, days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(e)}")

    model = train_linear_model(df)
    prediction = predict_next_close(df, model)

    return {
        "symbol": symbol.upper(),
        "prediction_3m_avg": prediction,
        "prediction_horizon_trading_days": 63,
        "model": model,
        "features_used": model.get("feature_cols"),
    }
