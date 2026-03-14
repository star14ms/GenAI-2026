import pandas as pd
import pandas_ta as ta
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
import pytz
from .base import data_client

router = APIRouter()

@router.get("/analysis/{symbol}")
def get_stock_analysis(symbol: str, days: int = 30):
    if not symbol or not symbol.isalpha() or len(symbol) > 5:
        raise HTTPException(status_code=400, detail="Invalid stock symbol. Must be 1-5 alphabetic characters.")
    
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 365.")
    
    try:
        # Use a fixed end date to bypass subscription limits for recent data
        end_date = datetime(2024, 12, 31, tzinfo=pytz.UTC)
        start_date = end_date - timedelta(days=days)
        
        request = StockBarsRequest(
            symbol_or_symbols=symbol.upper(),
            timeframe=TimeFrame.Day,
            start=start_date,
            end=end_date
        )
        
        bars = data_client.get_stock_bars(request)
        df = bars.df
        
        if df.empty:
            return {"error": "No data available for this symbol in the specified period."}
        
        # Basic analysis: Add moving averages and RSI
        df['SMA_20'] = ta.sma(df['close'], length=20)
        df['RSI'] = ta.rsi(df['close'], length=14)
        
        # Example: Check if RSI > 70 (overbought) or < 30 (oversold)
        latest_rsi = df['RSI'].iloc[-1]
        if pd.isna(latest_rsi):
            signal = "Insufficient data for RSI calculation"
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(e)}")