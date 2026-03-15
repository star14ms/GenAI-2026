from __future__ import annotations

import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import pandas as pd
import yfinance as yf

from ..llm import ChatMessage, get_provider

from .model import get_stock_features
from .predict import predict_next_close, train_linear_model


def _clean_value(value):
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return value
    return value


def _fetch_company_profile(symbol: str) -> dict:
    try:
        info = yf.Ticker(symbol).info or {}
    except Exception:
        return {}

    return {
        "symbol": symbol,
        "company_name": info.get("longName") or info.get("shortName") or symbol,
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "quote_type": info.get("quoteType"),
        "market_cap": info.get("marketCap"),
        "country": info.get("country"),
        "currency": info.get("currency"),
    }


def _fetch_google_news(query: str, limit: int = 3, topic: str | None = None) -> list[dict]:
    url = (
        "https://news.google.com/rss/search?"
        + urllib.parse.urlencode(
            {
                "q": query,
                "hl": "en-US",
                "gl": "US",
                "ceid": "US:en",
            }
        )
    )
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = response.read()
    except Exception:
        return []

    try:
        root = ET.fromstring(payload)
    except Exception:
        return []

    items: list[dict] = []
    for item in root.findall(".//item")[:limit]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        source = ""
        source_node = item.find("source")
        if source_node is not None and source_node.text:
            source = source_node.text.strip()

        if not title:
            continue

        items.append(
            {
                "topic": topic,
                "query": query,
                "title": title,
                "source": source,
                "published_at": pub_date,
                "link": link,
            }
        )
    return items


def _fetch_yfinance_news(symbol: str, limit: int = 3, topic: str | None = None) -> list[dict]:
    try:
        raw_items = yf.Ticker(symbol).news or []
    except Exception:
        return []

    items: list[dict] = []
    for raw in raw_items[:limit]:
        content = raw.get("content", {})
        provider = (content.get("provider") or {}).get("displayName", "")
        canonical = content.get("canonicalUrl") or {}
        clickthrough = content.get("clickThroughUrl") or {}
        link = canonical.get("url") or clickthrough.get("url") or ""

        title = (content.get("title") or "").strip()
        if not title:
            continue

        items.append(
            {
                "topic": topic,
                "query": symbol,
                "title": title,
                "source": provider,
                "published_at": content.get("pubDate") or content.get("displayTime") or "",
                "summary": content.get("summary") or content.get("description") or "",
                "link": link,
            }
        )
    return items


def _collect_market_news(symbol: str, company_name: str, limit: int = 8) -> list[dict]:
    queries = [
        (f'"{symbol}" stock OR "{company_name}" stock', "company"),
        (f'"{company_name}" earnings OR guidance OR outlook', "company"),
        ("geopolitics OR war OR sanctions global markets equities", "geopolitics"),
        ("oil prices OR OPEC OR crude global markets stocks", "energy"),
        ("inflation OR interest rates OR Federal Reserve macroeconomics stocks", "macro"),
    ]

    seen: set[tuple[str, str]] = set()
    headlines: list[dict] = []

    for query, topic in queries:
        for item in _fetch_google_news(query, limit=3, topic=topic):
            key = (item.get("title", ""), item.get("link", ""))
            if key in seen:
                continue
            seen.add(key)
            headlines.append(item)
            if len(headlines) >= limit:
                return headlines

    fallback_symbols = [
        (symbol, "company"),
        ("SPY", "macro"),
        ("USO", "energy"),
        ("^TNX", "rates"),
    ]

    for fallback_symbol, topic in fallback_symbols:
        for item in _fetch_yfinance_news(fallback_symbol, limit=3, topic=topic):
            key = (item.get("title", ""), item.get("link", ""))
            if key in seen:
                continue
            seen.add(key)
            headlines.append(item)
            if len(headlines) >= limit:
                return headlines

    return headlines


def _build_quant_snapshot(df: pd.DataFrame) -> dict:
    latest = df.tail(1)
    if latest.empty:
        return {}

    latest_row = latest.iloc[0]
    close_series = df["close"].dropna() if "close" in df.columns else pd.Series(dtype=float)

    def _return_over(period: int):
        if len(close_series) <= period:
            return None
        current = close_series.iloc[-1]
        base = close_series.iloc[-(period + 1)]
        if base == 0:
            return None
        return ((current / base) - 1) * 100

    model = train_linear_model(df)
    prediction_3m_avg = predict_next_close(df, model)
    latest_close = _clean_value(latest_row.get("close"))
    upside = None
    if prediction_3m_avg is not None and latest_close not in (None, 0):
        upside = ((prediction_3m_avg / latest_close) - 1) * 100

    fields = [
        "close",
        "volume",
        "returns",
        "SMA_10",
        "SMA_20",
        "SMA_50",
        "EMA_12",
        "EMA_26",
        "RSI",
        "MACD",
        "MACD_signal",
        "ATR",
        "volatility",
        "pe_ratio",
        "forward_pe",
        "eps",
        "forward_eps",
        "beta",
        "market_cap",
        "profit_margin",
        "debt_to_equity",
        "current_ratio",
        "dividend_yield",
        "quote_type",
        "is_etf",
        "sector",
        "industry",
    ]

    latest_metrics = {
        field: _clean_value(latest_row.get(field))
        for field in fields
        if field in df.columns
    }

    return {
        "latest_metrics": latest_metrics,
        "return_1m_pct": _return_over(21),
        "return_3m_pct": _return_over(63),
        "prediction_3m_avg": prediction_3m_avg,
        "prediction_vs_latest_pct": upside,
        "model_features_used": model.get("feature_cols", []),
    }


def generate_stock_agentic_summary(
    symbol: str,
    provider_id: str = "gemini",
    days: int = 252,
    news_limit: int = 8,
) -> dict:
    clean_symbol = symbol.strip().upper()
    provider = get_provider(provider_id)
    if not provider:
        raise ValueError("Unknown provider. Available: gemini, claude, chatgpt")

    df = get_stock_features(clean_symbol, days)
    profile = _fetch_company_profile(clean_symbol)
    headlines = _collect_market_news(
        clean_symbol,
        profile.get("company_name") or clean_symbol,
        limit=news_limit,
    )
    quant_snapshot = _build_quant_snapshot(df)

    news_payload = {
        "symbol": clean_symbol,
        "profile": profile,
        "headlines": headlines,
    }

    news_prompt = (
        "You are a beginner-friendly market news explainer. "
        "Use only the provided profile and headlines. "
        "Do not include technical indicators or model predictions.\n\n"
        "Write 5 short bullet points in simple language:\n"
        "1) Big picture takeaway (1 line)\n"
        "2) Key news/events (2-3 items)\n"
        "3) Why this matters for the stock\n"
        "4) Main risks (macro/geopolitics/oil/rates)\n"
        "5) What to watch next (week/month)\n\n"
        "Rules: max 150 words, avoid jargon (or explain it in a few words), if data is missing say 'data unavailable', end with 'Not financial advice.'\n\n"
        f"Context JSON:\n{json.dumps(news_payload, default=str, indent=2)}"
    )

    quant_payload = {
        "symbol": clean_symbol,
        "profile": profile,
        "quant_snapshot": quant_snapshot,
    }

    quant_prompt = (
        "You are a beginner-friendly quantitative stock explainer. "
        "Use only the provided profile and quant_snapshot. "
        "Do not discuss news in this section.\n\n"
        "Write 5 short bullet points in simple language:\n"
        "1) Data takeaway (1 line)\n"
        "2) Recent performance (1M and 3M returns)\n"
        "3) Key indicators in plain words (trend/momentum/volatility)\n"
        "4) 3-month average prediction and what it implies vs latest price\n"
        "5) Data-based risks/limitations\n\n"
        "Rules: max 150 words, avoid jargon (or explain it), if a metric is missing say 'data unavailable', end with 'Not financial advice.'\n\n"
        f"Context JSON:\n{json.dumps(quant_payload, default=str, indent=2)}"
    )

    news_summary = provider.chat([ChatMessage(role="user", content=news_prompt)])
    data_prediction_summary = provider.chat([ChatMessage(role="user", content=quant_prompt)])

    summary = (
        "## News & Macro Summary\n"
        f"{news_summary}\n\n"
        "## Data & Prediction Summary\n"
        f"{data_prediction_summary}"
    )
    return {
        "symbol": clean_symbol,
        "provider": provider.id,
        "summary": summary,
        "news_summary": news_summary,
        "data_prediction_summary": data_prediction_summary,
        "profile": profile,
        "quant_snapshot": quant_snapshot,
        "headlines": headlines,
    }


def generate_qualitative_summary(
    symbol: str,
    provider_id: str = "chatgpt",
    news_limit: int = 8,
) -> dict:
    clean_symbol = symbol.strip().upper()
    provider = get_provider(provider_id)
    if not provider:
        raise ValueError("Unknown provider. Available: gemini, claude, chatgpt")

    profile = _fetch_company_profile(clean_symbol)
    headlines = _collect_market_news(
        clean_symbol,
        profile.get("company_name") or clean_symbol,
        limit=news_limit,
    )

    news_payload = {
        "symbol": clean_symbol,
        "profile": profile,
        "headlines": headlines,
    }

    news_prompt = (
        "You are a beginner-friendly market news explainer. "
        "Use only the provided profile and headlines. "
        "Do not include technical indicators or model predictions.\n\n"
        "Write 5 short bullet points in simple language:\n"
        "1) Big picture takeaway (1 line)\n"
        "2) Key news/events (2-3 items)\n"
        "3) Why this matters for the stock\n"
        "4) Main risks (macro/geopolitics/oil/rates)\n"
        "5) What to watch next (week/month)\n\n"
        "Rules: max 150 words, avoid jargon (or explain it in a few words), if data is missing say 'data unavailable', end with 'Not financial advice.'\n\n"
        f"Context JSON:\n{json.dumps(news_payload, default=str, indent=2)}"
    )

    qualitative_summary = provider.chat([ChatMessage(role="user", content=news_prompt)])
    return {
        "symbol": clean_symbol,
        "provider": provider.id,
        "qualitative_summary": qualitative_summary,
        "profile": profile,
        "headlines": headlines,
    }


def generate_quantitative_summary(
    symbol: str,
    provider_id: str = "chatgpt",
    days: int = 252,
) -> dict:
    clean_symbol = symbol.strip().upper()
    provider = get_provider(provider_id)
    if not provider:
        raise ValueError("Unknown provider. Available: gemini, claude, chatgpt")

    df = get_stock_features(clean_symbol, days)
    profile = _fetch_company_profile(clean_symbol)
    quant_snapshot = _build_quant_snapshot(df)

    quant_payload = {
        "symbol": clean_symbol,
        "profile": profile,
        "quant_snapshot": quant_snapshot,
    }

    quant_prompt = (
        "You are a beginner-friendly quantitative stock explainer. "
        "Use only the provided profile and quant_snapshot. "
        "Do not discuss news in this section.\n\n"
        "Write 5 short bullet points in simple language:\n"
        "1) Data takeaway (1 line)\n"
        "2) Recent performance (1M and 3M returns)\n"
        "3) Key indicators in plain words (trend/momentum/volatility)\n"
        "4) 3-month average prediction and what it implies vs latest price\n"
        "5) Data-based risks/limitations\n\n"
        "Rules: max 150 words, avoid jargon (or explain it), if a metric is missing say 'data unavailable', end with 'Not financial advice.'\n\n"
        f"Context JSON:\n{json.dumps(quant_payload, default=str, indent=2)}"
    )

    quantitative_summary = provider.chat([ChatMessage(role="user", content=quant_prompt)])
    return {
        "symbol": clean_symbol,
        "provider": provider.id,
        "quantitative_summary": quantitative_summary,
        "profile": profile,
        "quant_snapshot": quant_snapshot,
    }