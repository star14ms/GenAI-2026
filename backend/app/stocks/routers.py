import json
import logging
import pandas as pd

logger = logging.getLogger(__name__)
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from .base import data_client
from .agent import (
    generate_qualitative_summary,
    generate_qualitative_summary_stream,
    generate_quantitative_summary,
    generate_quantitative_summary_stream,
    generate_stock_rating,
)
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


@router.get("/api/stocks/qualitative-summary/{symbol}")
def get_qualitative_summary(
    symbol: str,
    provider: str = "chatgpt",
    news_limit: int = 8,
    mode: str = "beginner",
):
    clean_symbol = symbol.strip().upper()
    if not clean_symbol or not clean_symbol.isalpha() or len(clean_symbol) > 5:
        raise HTTPException(status_code=400, detail="Invalid stock symbol. Must be 1-5 alphabetic characters.")

    if news_limit < 3 or news_limit > 15:
        raise HTTPException(status_code=400, detail="news_limit must be between 3 and 15.")

    if data_client is None:
        raise HTTPException(
            status_code=503,
            detail="ALPACA_API_KEY and ALPACA_SECRET_KEY must be set in environment to use this feature.",
        )

    try:
        result = generate_qualitative_summary(
            clean_symbol,
            provider_id=provider,
            news_limit=news_limit,
            mode=mode,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating qualitative summary: {str(e)}")

    return result


@router.get("/api/stocks/qualitative-summary/{symbol}/stream")
def stream_qualitative_summary(
    symbol: str,
    provider: str = "chatgpt",
    news_limit: int = 8,
    mode: str = "beginner",
):
    """Stream qualitative summary as plain text chunks."""
    clean_symbol = symbol.strip().upper()
    if not clean_symbol or not clean_symbol.isalpha() or len(clean_symbol) > 5:
        raise HTTPException(status_code=400, detail="Invalid stock symbol. Must be 1-5 alphabetic characters.")

    if news_limit < 3 or news_limit > 15:
        raise HTTPException(status_code=400, detail="news_limit must be between 3 and 15.")

    if data_client is None:
        raise HTTPException(
            status_code=503,
            detail="ALPACA_API_KEY and ALPACA_SECRET_KEY must be set in environment to use this feature.",
        )

    def generate():
        stream = generate_qualitative_summary_stream(
            clean_symbol,
            provider_id=provider,
            news_limit=news_limit,
            mode=mode,
        )
        first = next(stream, None)
        if first is not None and isinstance(first, dict) and "_meta" in first:
            meta = first["_meta"]
            yield (json.dumps(meta) + "\n").encode("utf-8")
        elif first is not None:
            yield first.encode("utf-8") if isinstance(first, str) else first
        for chunk in stream:
            yield chunk.encode("utf-8") if isinstance(chunk, str) else chunk

    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/api/stocks/quantitative-summary/{symbol}")
def get_quantitative_summary(
    symbol: str,
    provider: str = "chatgpt",
    days: int = 252,
    mode: str = "beginner",
):
    clean_symbol = symbol.strip().upper()
    if not clean_symbol or not clean_symbol.isalpha() or len(clean_symbol) > 5:
        raise HTTPException(status_code=400, detail="Invalid stock symbol. Must be 1-5 alphabetic characters.")

    if days < 60 or days > 365:
        raise HTTPException(status_code=400, detail="Days must be between 60 and 365.")

    if data_client is None:
        raise HTTPException(
            status_code=503,
            detail="ALPACA_API_KEY and ALPACA_SECRET_KEY must be set in environment to use this feature.",
        )

    try:
        result = generate_quantitative_summary(
            clean_symbol,
            provider_id=provider,
            days=days,
            mode=mode,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating quantitative summary: {str(e)}")

    return result


@router.get("/api/stocks/quantitative-summary/{symbol}/stream")
def stream_quantitative_summary(
    symbol: str,
    provider: str = "chatgpt",
    days: int = 252,
    mode: str = "beginner",
):
    """Stream quantitative summary as plain text chunks."""
    clean_symbol = symbol.strip().upper()
    if not clean_symbol or not clean_symbol.isalpha() or len(clean_symbol) > 5:
        raise HTTPException(status_code=400, detail="Invalid stock symbol. Must be 1-5 alphabetic characters.")

    if days < 60 or days > 365:
        raise HTTPException(status_code=400, detail="Days must be between 60 and 365.")

    if data_client is None:
        raise HTTPException(
            status_code=503,
            detail="ALPACA_API_KEY and ALPACA_SECRET_KEY must be set in environment to use this feature.",
        )

    def generate():
        for chunk in generate_quantitative_summary_stream(
            clean_symbol,
            provider_id=provider,
            days=days,
            mode=mode,
        ):
            yield chunk.encode("utf-8")

    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class RatingRequest(BaseModel):
    qualitative_summary: str = ""
    quantitative_summary: str = ""
    headlines: list[dict] = []
    latest_price: float | None = None


@router.post("/api/stocks/rating/{symbol}")
def post_stock_rating(
    symbol: str,
    body: RatingRequest | None = Body(default=None),
    provider: str = "chatgpt",
    mode: str = "beginner",
):
    """
    Generate LLM-based stock rating (0-10). Call this ONLY after qualitative and
    quantitative summary streams have completed. Uses all outputs plus web search
    for news links.
    """
    clean_symbol = symbol.strip().upper()
    if not clean_symbol or not clean_symbol.isalpha() or len(clean_symbol) > 5:
        raise HTTPException(status_code=400, detail="Invalid stock symbol. Must be 1-5 alphabetic characters.")

    req = body or RatingRequest()

    try:
        result = generate_stock_rating(
            symbol=clean_symbol,
            qualitative_summary=req.qualitative_summary or "",
            quantitative_summary=req.quantitative_summary or "",
            headlines=req.headlines or [],
            provider_id=provider,
            mode=mode,
            latest_price=req.latest_price,
        )
    except ValueError as e:
        logger.warning("Stock rating ValueError: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Stock rating error")
        raise HTTPException(status_code=500, detail=f"Error generating rating: {str(e)}")

    return result


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

    # Score 0-10: lower RSI (oversold) = higher score, higher RSI (overbought) = lower score
    if pd.isna(latest_rsi):
        score = None
    else:
        score = max(0.0, min(10.0, 10.0 - latest_rsi / 10.0))
        score = round(score, 1)

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
        "latest_price": df['close'].iloc[-1] if not df.empty else None,
        "score": score,
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
