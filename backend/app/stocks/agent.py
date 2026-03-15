from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed

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


def _fetch_og_image(url: str, timeout: float = 5) -> str | None:
    """Fetch a URL (following redirects) and extract og:image from meta tags."""
    if not url or not url.startswith(("http://", "https://")):
        return None
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; GenAI-2026/1.0; +https://github.com)"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            # Read first 100KB to find og:image (usually in head)
            chunk = resp.read(100_000)
    except Exception:
        return None
    html = chunk.decode("utf-8", errors="ignore")
    # Match og:image - property before content or content before property
    m = re.search(
        r'property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    )
    if not m:
        m = re.search(
            r'content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']',
            html,
            re.IGNORECASE,
        )
    if m:
        img_url = m.group(1).strip()
        if img_url.startswith("//"):
            img_url = "https:" + img_url
        elif img_url.startswith("/"):
            parsed = urllib.parse.urlparse(url)
            img_url = f"{parsed.scheme}://{parsed.netloc}{img_url}"
        return img_url if img_url.startswith("http") else None
    return None


def _enrich_headlines_with_images(headlines: list[dict]) -> list[dict]:
    """Add image_url to each headline by fetching og:image from the article page."""
    if not headlines:
        return headlines
    enriched = [dict(h) for h in headlines]

    def fetch_one(i: int, link: str) -> tuple[int, str | None]:
        return (i, _fetch_og_image(link))

    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {
            ex.submit(fetch_one, i, h.get("link", "")): i
            for i, h in enumerate(enriched)
            if h.get("link")
        }
        for fut in as_completed(futures, timeout=15):
            try:
                i, img_url = fut.result()
                if img_url:
                    enriched[i]["image_url"] = img_url
            except Exception:
                pass
    return enriched


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


def _normalize_mode(mode: str) -> str:
    return "expert" if str(mode).strip().lower() == "expert" else "beginner"


def _build_qualitative_prompt(payload: dict, mode: str) -> str:
    fmt_rules = (
        "OUTPUT FORMAT (strict): No <hr>, no --- or ***, no numbering (1), 2), etc.). "
        "Start directly with HighRisk—never write 'Debate' before it.\n\n"
    )
    normalized_mode = _normalize_mode(mode)
    if normalized_mode == "expert":
        return (
            fmt_rules
            + "You are a stock strategist writing for advanced users. Use only the provided JSON context.\n\n"
            "Present 3 perspectives directly:\n"
            "- HighRisk (aggressive growth)\n"
            "- MediumRisk (balanced)\n"
            "- LowRisk (capital preservation)\n\n"
            "Each persona gives 2 specific bullets grounded in BOTH news/macro context and quantitative signals.\n"
            "Then provide FINAL QUALITATIVE SUMMARY with:\n"
            "- News & macro regime\n"
            "- Cross-asset/geopolitics implications\n"
            "- Event risks and catalysts\n"
            "- Near-term watchlist\n\n"
            "Rules: keep it tight (<=260 words), use precise language, do not invent facts, if data missing say 'data unavailable', end with 'Not financial advice.'\n\n"
            f"Context JSON:\n{json.dumps(payload, default=str, indent=2)}"
        )

    return (
        fmt_rules
        + "You are explaining the stock update to someone with zero finance or technical background. Use only the JSON context.\n\n"
        "Write in calm, everyday language for a first-time reader.\n"
        "Present 3 perspectives directly:\n"
        "- HighRisk (more comfortable with bigger ups and downs)\n"
        "- MediumRisk (balanced)\n"
        "- LowRisk (more focused on stability)\n\n"
        "Each voice gives exactly 2 short bullet points.\n"
        "Then write FINAL QUALITATIVE SUMMARY with exactly 3 bullets:\n"
        "- What is happening now\n"
        "- Why this could be risky\n"
        "- What to watch next\n\n"
        "Hard rules:\n"
        "- Do NOT use technical terms, formulas, theorems, indicator names, or stock metric names.\n"
        "- Do NOT mention terms such as RSI, MACD, beta, PE, ATR, volatility, market cap, earnings per share, moving average, momentum, or valuation.\n"
        "- Keep sentences short and clear.\n"
        "- Keep total length <=190 words.\n"
        "- If data is missing, say 'data unavailable'.\n"
        "- End with 'Not financial advice.'\n"
        "- Keep the output neat with clear section titles and bullet points.\n\n"
        f"Context JSON:\n{json.dumps(payload, default=str, indent=2)}"
    )


def _build_quantitative_prompt(payload: dict, mode: str) -> str:
    fmt_rules = (
        "OUTPUT FORMAT (strict): No <hr>, no --- or ***, no numbering (1), 2), etc.). "
        "Start directly with HighRisk—never write 'Debate' before it.\n\n"
    )
    normalized_mode = _normalize_mode(mode)
    if normalized_mode == "expert":
        return (
            fmt_rules
            + "You are a quantitative stock strategist writing for advanced users. Use only the provided JSON context.\n\n"
            "Present 3 perspectives directly:\n"
            "- HighRisk (aggressive growth)\n"
            "- MediumRisk (balanced)\n"
            "- LowRisk (capital preservation)\n\n"
            "Each persona gives 2 specific bullets grounded in BOTH quant_snapshot and current-event context.\n"
            "Then provide FINAL QUANTITATIVE SUMMARY with:\n"
            "- Return profile (1M/3M)\n"
            "- Signal state (trend/momentum/risk)\n"
            "- 3-month average prediction interpretation\n"
            "- Data-driven risks and assumptions\n\n"
            "Rules: <=260 words, use precise language, do not invent facts, if data missing say 'data unavailable', end with 'Not financial advice.'\n\n"
            f"Context JSON:\n{json.dumps(payload, default=str, indent=2)}"
        )

    return (
        fmt_rules
        + "You are explaining the stock numbers to someone with zero finance or technical background. Use only the JSON context.\n\n"
        "Write in calm, everyday language for a first-time reader.\n"
        "Present 3 perspectives directly:\n"
        "- HighRisk (more comfortable with bigger ups and downs)\n"
        "- MediumRisk (balanced)\n"
        "- LowRisk (more focused on stability)\n\n"
        "Each voice gives exactly 2 short bullet points.\n"
        "Then write FINAL QUANTITATIVE SUMMARY with exactly 3 bullets:\n"
        "- Is the stock generally rising or falling lately (plain words)\n"
        "- What the 3-month estimate means (plain words)\n"
        "- Main risk to pay attention to\n\n"
        "Hard rules:\n"
        "- Do NOT use technical terms, formulas, theorems, indicator names, or stock metric names.\n"
        "- Do NOT mention terms such as RSI, MACD, beta, PE, ATR, volatility, market cap, earnings per share, moving average, momentum, or valuation.\n"
        "- Keep sentences short and clear.\n"
        "- Keep total length <=190 words.\n"
        "- If data is missing, say 'data unavailable'.\n"
        "- End with 'Not financial advice.'\n"
        "- Keep the output neat with clear section titles and bullet points.\n\n"
        f"Context JSON:\n{json.dumps(payload, default=str, indent=2)}"
    )


def generate_qualitative_summary(
    symbol: str,
    provider_id: str = "chatgpt",
    news_limit: int = 8,
    mode: str = "beginner",
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
    df = get_stock_features(clean_symbol, 252)
    quant_snapshot = _build_quant_snapshot(df)

    news_payload = {
        "symbol": clean_symbol,
        "profile": profile,
        "headlines": headlines,
        "quant_snapshot": quant_snapshot,
    }

    news_prompt = _build_qualitative_prompt(news_payload, mode)

    qualitative_summary = provider.chat([ChatMessage(role="user", content=news_prompt)])
    return {
        "symbol": clean_symbol,
        "provider": provider.id,
        "mode": _normalize_mode(mode),
        "qualitative_summary": qualitative_summary,
        "profile": profile,
        "headlines": headlines,
        "quant_snapshot": quant_snapshot,
    }


def generate_qualitative_summary_stream(
    symbol: str,
    provider_id: str = "chatgpt",
    news_limit: int = 8,
    mode: str = "beginner",
):
    """Stream qualitative summary. First yields a metadata dict (for headlines), then text chunks."""
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
    df = get_stock_features(clean_symbol, 252)
    quant_snapshot = _build_quant_snapshot(df)

    news_payload = {
        "symbol": clean_symbol,
        "profile": profile,
        "headlines": headlines,
        "quant_snapshot": quant_snapshot,
    }

    news_prompt = _build_qualitative_prompt(news_payload, mode)

    # First yield metadata (headlines) for the frontend
    yield {"_meta": {"headlines": headlines}}

    if hasattr(provider, "chat_stream"):
        yield from provider.chat_stream([ChatMessage(role="user", content=news_prompt)])
    else:
        text = provider.chat([ChatMessage(role="user", content=news_prompt)])
        yield text


def generate_quantitative_summary(
    symbol: str,
    provider_id: str = "chatgpt",
    days: int = 252,
    mode: str = "beginner",
) -> dict:
    clean_symbol = symbol.strip().upper()
    provider = get_provider(provider_id)
    if not provider:
        raise ValueError("Unknown provider. Available: gemini, claude, chatgpt")

    df = get_stock_features(clean_symbol, days)
    profile = _fetch_company_profile(clean_symbol)
    quant_snapshot = _build_quant_snapshot(df)
    headlines = _collect_market_news(
        clean_symbol,
        profile.get("company_name") or clean_symbol,
        limit=8,
    )

    quant_payload = {
        "symbol": clean_symbol,
        "profile": profile,
        "quant_snapshot": quant_snapshot,
        "headlines": headlines,
    }

    quant_prompt = _build_quantitative_prompt(quant_payload, mode)

    quantitative_summary = provider.chat([ChatMessage(role="user", content=quant_prompt)])
    return {
        "symbol": clean_symbol,
        "provider": provider.id,
        "mode": _normalize_mode(mode),
        "quantitative_summary": quantitative_summary,
        "profile": profile,
        "quant_snapshot": quant_snapshot,
        "headlines": headlines,
    }


def generate_quantitative_summary_stream(
    symbol: str,
    provider_id: str = "chatgpt",
    days: int = 252,
    mode: str = "beginner",
):
    """Stream quantitative summary token by token. Yields text chunks."""
    clean_symbol = symbol.strip().upper()
    provider = get_provider(provider_id)
    if not provider:
        raise ValueError("Unknown provider. Available: gemini, claude, chatgpt")

    df = get_stock_features(clean_symbol, days)
    profile = _fetch_company_profile(clean_symbol)
    quant_snapshot = _build_quant_snapshot(df)
    headlines = _collect_market_news(
        clean_symbol,
        profile.get("company_name") or clean_symbol,
        limit=8,
    )

    quant_payload = {
        "symbol": clean_symbol,
        "profile": profile,
        "quant_snapshot": quant_snapshot,
        "headlines": headlines,
    }

    quant_prompt = _build_quantitative_prompt(quant_payload, mode)

    if hasattr(provider, "chat_stream"):
        yield from provider.chat_stream([ChatMessage(role="user", content=quant_prompt)])
    else:
        text = provider.chat([ChatMessage(role="user", content=quant_prompt)])
        yield text


def _fetch_url_text(url: str, timeout: float = 8, max_chars: int = 8000) -> str | None:
    """Fetch a URL and extract plain text from HTML. Returns None on failure."""
    if not url or not url.startswith(("http://", "https://")):
        return None
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; GenAI-2026/1.0; +https://github.com)"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            chunk = resp.read(200_000)
    except Exception:
        return None
    html = chunk.decode("utf-8", errors="ignore")
    # Strip script/style and basic tag removal for text extraction
    html = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars] + "..."
    return text if text else None


def _build_rating_prompt(
    symbol: str,
    qualitative_summary: str,
    quantitative_summary: str,
    headlines: list[dict],
    news_content: list[dict],
    latest_price: float | None,
    mode: str,
) -> str:
    """Build the rating prompt with all outputs from quantitative/qualitative summaries and news."""
    normalized_mode = _normalize_mode(mode)
    news_section = ""
    if news_content:
        parts = []
        for item in news_content:
            title = item.get("title", "Article")
            link = item.get("link", "")
            content = item.get("fetched_content")
            if content:
                parts.append(f"### {title}\nURL: {link}\nContent excerpt:\n{content}\n")
            else:
                parts.append(f"### {title}\nURL: {link}\n(Content could not be fetched)\n")
        news_section = "\n## Recent News (with content)\n" + "\n".join(parts)
    elif headlines:
        news_section = (
            "\n## Recent News (headlines only)\n"
            + "\n".join(
                f"- {h.get('title', 'Article')} ({h.get('link', '')})"
                for h in headlines
            )
        )

    price_line = f"\nLatest price: ${latest_price:.2f}" if latest_price is not None else ""

    if normalized_mode == "expert":
        return (
            "You are a stock strategist producing a single overall rating. Use ONLY the provided context.\n\n"
            "## Quantitative Summary\n"
            f"{quantitative_summary or 'Not available.'}\n\n"
            "## Qualitative Summary\n"
            f"{qualitative_summary or 'Not available.'}\n"
            f"{news_section}\n"
            f"{price_line}\n\n"
            "TASK: Produce a stock rating from 0 to 10 (0=avoid, 10=strong buy) based on the quantitative signals, "
            "qualitative narrative, and news context above. Output valid JSON only: {\"score\": <float 0-10>, \"reasoning\": \"<2-3 sentences>\"}.\n"
            "Rules: One decimal for score. Do not invent facts. End with valid JSON. Not financial advice."
        )
    return (
        "You are a stock analyst producing a simple rating for a beginner. Use ONLY the provided context.\n\n"
        "## Quantitative Summary\n"
        f"{quantitative_summary or 'Not available.'}\n\n"
        "## Qualitative Summary\n"
        f"{qualitative_summary or 'Not available.'}\n"
        f"{news_section}\n"
        f"{price_line}\n\n"
        "TASK: Produce a stock rating from 0 to 10 (0=avoid, 10=strong buy) based on the summaries and news above. "
        "Output valid JSON only: {\"score\": <float 0-10>, \"reasoning\": \"<1-2 short sentences>\"}.\n"
        "Rules: One decimal for score. Plain language. Do not invent facts. End with valid JSON. Not financial advice."
    )


def generate_stock_rating(
    symbol: str,
    qualitative_summary: str,
    quantitative_summary: str,
    headlines: list[dict],
    provider_id: str = "chatgpt",
    mode: str = "beginner",
    latest_price: float | None = None,
) -> dict:
    """
    Generate an LLM-based stock rating (0-10) using all outputs from quantitative/qualitative summaries
    and news. Fetches content from news links and uses web_search when available.
    Call this ONLY after qualitative and quantitative streams have completed.
    """
    clean_symbol = symbol.strip().upper()
    provider = get_provider(provider_id)
    if not provider:
        raise ValueError("Unknown provider. Available: gemini, claude, chatgpt")

    # Fetch content from news links in parallel
    news_content: list[dict] = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {}
        for h in headlines or []:
            link = h.get("link")
            if link:
                futures[ex.submit(_fetch_url_text, link)] = h
        for fut in as_completed(futures, timeout=20):
            try:
                h = futures[fut]
                content = fut.result()
                news_content.append({**h, "fetched_content": content})
            except Exception:
                pass
    # Preserve order and include headlines we couldn't fetch
    seen_links = {n.get("link") for n in news_content}
    for h in headlines or []:
        if h.get("link") and h.get("link") not in seen_links:
            news_content.append({**h, "fetched_content": None})
            seen_links.add(h.get("link"))

    prompt = _build_rating_prompt(
        symbol=clean_symbol,
        qualitative_summary=qualitative_summary,
        quantitative_summary=quantitative_summary,
        headlines=headlines or [],
        news_content=news_content,
        latest_price=latest_price,
        mode=mode,
    )

    # Do not use web_search - vLLM and other OpenAI-compatible backends expect
    # type: "function" tools, not type: "web_search". News content is already
    # fetched from URLs and included in the prompt.
    raw = provider.chat([ChatMessage(role="user", content=prompt)])

    # Parse JSON from response
    score = None
    reasoning = ""
    try:
        start = raw.find("{")
        if start >= 0:
            depth = 0
            for i, c in enumerate(raw[start:], start):
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        obj = json.loads(raw[start : i + 1])
                        score = float(obj.get("score", 0))
                        score = max(0.0, min(10.0, round(score, 1)))
                        reasoning = str(obj.get("reasoning", ""))[:500]
                        break
    except Exception:
        pass

    return {
        "symbol": clean_symbol,
        "score": score,
        "reasoning": reasoning,
        "provider": provider.id,
    }