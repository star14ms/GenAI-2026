import os
from ..base import LLMProvider, ChatMessage


class ClaudeProvider:
    """Anthropic Claude LLM provider."""

    @property
    def name(self) -> str:
        return "Claude"

    @property
    def id(self) -> str:
        return "claude"

    def chat(self, messages: list[ChatMessage]) -> str:
        from anthropic import Anthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")

        client = Anthropic(api_key=api_key)

        # Claude expects messages in their format
        formatted = []
        for msg in messages:
            if msg.role == "user":
                formatted.append({"role": "user", "content": msg.content})
            elif msg.role == "assistant":
                formatted.append({"role": "assistant", "content": msg.content})

        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=formatted,
        )

        if response.content and len(response.content) > 0:
            block = response.content[0]
            if hasattr(block, "text"):
                return block.text
        return ""

