from typing import Optional

from .base import LLMProvider
from .providers import GeminiProvider, ClaudeProvider, ChatGPTProvider

_PROVIDERS: dict[str, LLMProvider] = {
    "gemini": GeminiProvider(),
    "claude": ClaudeProvider(),
    "chatgpt": ChatGPTProvider(),
}


def get_provider(provider_id: str) -> Optional[LLMProvider]:
    """Get an LLM provider by id. Returns None if not found."""
    return _PROVIDERS.get(provider_id.lower())


def list_providers() -> list[dict]:
    """List all available providers with id and name."""
    return [
        {"id": p.id, "name": p.name}
        for p in _PROVIDERS.values()
    ]


def register_provider(provider: LLMProvider) -> None:
    """Register a custom LLM provider. Use to extend with new LLMs."""
    _PROVIDERS[provider.id.lower()] = provider
