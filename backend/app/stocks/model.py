import pandas as pd
import pandas_ta as ta
import numpy as np
import yfinance as yf
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame
from datetime import datetime, timedelta
import pytz
from .base import data_client


def get_historical_price_series(symbol: str, years: int) -> list[dict]:
    """Fetch daily historical prices for a symbol over N years."""
    if years not in (1, 3, 5, 10):
        raise ValueError("Years must be one of: 1, 3, 5, 10")

    clean_symbol = symbol.strip().upper()
    if not clean_symbol:
        raise ValueError("Symbol is required")

    try:
        history = yf.Ticker(clean_symbol).history(period=f"{years}y", interval="1d")
    except Exception as exc:
        raise ValueError(f"Failed to fetch history for {clean_symbol}: {exc}")

    if history is None or history.empty:
        raise ValueError(f"No historical price data found for {clean_symbol}")

    history = history.reset_index()
    date_col = "Date" if "Date" in history.columns else history.columns[0]

    points: list[dict] = []
    for _, row in history.iterrows():
        date_value = pd.to_datetime(row[date_col]).date().isoformat()
        close_value = row.get("Close")
        open_value = row.get("Open")
        high_value = row.get("High")
        low_value = row.get("Low")
        volume_value = row.get("Volume")

        points.append(
            {
                "date": date_value,
                "open": float(open_value) if pd.notna(open_value) else None,
                "high": float(high_value) if pd.notna(high_value) else None,
                "low": float(low_value) if pd.notna(low_value) else None,
                "close": float(close_value) if pd.notna(close_value) else None,
                "volume": int(volume_value) if pd.notna(volume_value) else None,
            }
        )

    return points


def _fetch_yahoo_metrics(symbol: str) -> dict:
    """Fetch stock metrics/financials using yfinance."""
    try:
        info = yf.Ticker(symbol).info or {}
    except Exception:
        return {}

    out = {}
    quote_type = info.get("quoteType")
    out["quote_type"] = quote_type
    out["is_etf"] = quote_type == "ETF"

    out["pe_ratio"] = info.get("trailingPE")
    out["forward_pe"] = info.get("forwardPE")
    out["eps"] = info.get("trailingEps")
    out["forward_eps"] = info.get("forwardEps")
    out["peg_ratio"] = info.get("pegRatio")
    out["beta"] = info.get("beta")
    out["market_cap"] = info.get("marketCap")

    out["dividend_yield"] = info.get("dividendYield")
    out["dividend_rate"] = info.get("dividendRate")

    out["sector"] = info.get("sector")
    out["industry"] = info.get("industry")

    out["debt_to_equity"] = info.get("debtToEquity")
    out["current_ratio"] = info.get("currentRatio")
    out["profit_margin"] = info.get("profitMargins")

    return out


def get_stock_features(symbol: str, days: int = 365) -> pd.DataFrame:
    """
    Fetch stock data and calculate features for ML model to predict price.
    Returns DataFrame with OHLCV, technical indicators, and target (next day's close).
    """
    end_date = datetime(2024, 12, 31, tzinfo=pytz.UTC)
    start_date = end_date - timedelta(days=days)
    
    request = StockBarsRequest(
        symbol_or_symbols=symbol.upper(),
        timeframe=TimeFrame.Day,
        start=start_date,
        end=end_date
    )
    
    bars = data_client.get_stock_bars(request)
    if bars is None or bars.df is None:
        raise ValueError("Alpaca returned no bars for the requested symbol/date range. Check API key, plan, or symbol validity.")
    df = bars.df.copy()
    
    if df.empty:
        raise ValueError("Alpaca returned an empty price series for this symbol. Try a different symbol or verify your Alpaca data access.")

    # Fetch per-stock metrics (PE, ETF flag, sector, etc.)
    metrics = _fetch_yahoo_metrics(symbol)
    for k, v in metrics.items():
        df[k] = v
    
    # Basic price features
    df['returns'] = df['close'].pct_change()
    df['log_returns'] = np.log(df['close']).diff()
    
    # Volume features
    df['volume_sma_20'] = ta.sma(df['volume'], length=20)
    df['volume_ratio'] = df['volume'] / df['volume_sma_20']
    
    # Trend indicators
    try:
        df['SMA_10'] = ta.sma(df['close'], length=min(10, len(df)))
        df['SMA_20'] = ta.sma(df['close'], length=min(20, len(df)))
        df['SMA_50'] = ta.sma(df['close'], length=min(50, len(df)))
        df['EMA_12'] = ta.ema(df['close'], length=min(12, len(df)))
        df['EMA_26'] = ta.ema(df['close'], length=min(26, len(df)))
    except Exception:
        pass  # Skip if calculation fails
    
    # Momentum indicators
    try:
        df['RSI'] = ta.rsi(df['close'], length=14)
        df['RSI_7'] = ta.rsi(df['close'], length=7)
        df['RSI_21'] = ta.rsi(df['close'], length=21)
    except Exception:
        pass
    
    # MACD
    try:
        macd = ta.macd(df['close'])
        if macd is not None:
            df['MACD'] = macd['MACD']
            df['MACD_signal'] = macd['MACDs']
            df['MACD_hist'] = macd['MACDh']
    except Exception:
        pass
    
    # Bollinger Bands
    try:
        bb = ta.bbands(df['close'], length=20)
        if bb is not None:
            df['BB_upper'] = bb['BBU_20_2.0']
            df['BB_middle'] = bb['BBM_20_2.0']
            df['BB_lower'] = bb['BBL_20_2.0']
            df['BB_width'] = (df['BB_upper'] - df['BB_lower']) / df['BB_middle']
    except Exception:
        pass
    
    # Volatility
    try:
        df['ATR'] = ta.atr(df['high'], df['low'], df['close'], length=14)
        df['volatility'] = df['returns'].rolling(20).std()
    except Exception:
        pass
    
    # Stochastic Oscillator
    try:
        stoch = ta.stoch(df['high'], df['low'], df['close'])
        if stoch is not None:
            df['stoch_k'] = stoch['STOCHk_14_3_3']
            df['stoch_d'] = stoch['STOCHd_14_3_3']
    except Exception:
        pass
    
    # Williams %R
    try:
        df['williams_r'] = ta.willr(df['high'], df['low'], df['close'], length=14)
    except Exception:
        pass
    
    # On-Balance Volume
    try:
        df['obv'] = ta.obv(df['close'], df['volume'])
    except Exception:
        pass
    
    # Target: average close price over the next ~3 months (63 trading days)
    horizon_days = 63
    df['target_3m_avg'] = (
        df['close']
        .shift(-1)
        .iloc[::-1]
        .rolling(window=horizon_days, min_periods=horizon_days)
        .mean()
        .iloc[::-1]
    )
    
    # Note: Not dropping NaN to preserve data for short periods
    return df