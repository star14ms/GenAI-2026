from typing import Protocol, runtime_checkable


class ChatMessage:
    """Unified chat message format."""

    def __init__(self, role: str, content: str):
        self.role = role  # "user" or "assistant"
        self.content = content

    def to_dict(self) -> dict:
        return {"role": self.role, "content": self.content}


@runtime_checkable
class LLMProvider(Protocol):
    """Protocol for LLM providers. Implement this to add new LLM backends."""

    @property
    def name(self) -> str:
        """Display name of the provider (e.g. 'Gemini', 'Claude')."""
        ...

    @property
    def id(self) -> str:
        """Unique identifier used in API (e.g. 'gemini', 'claude')."""
        ...

    @property
    def model(self) -> str:
        """Model version used (e.g. 'gpt-4o-mini', 'gemini-2.0-flash')."""
        ...

    def chat(self, messages: list[ChatMessage]) -> str:
        """Send messages and return the assistant's reply."""
        ...
