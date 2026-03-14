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

    @property
    def model(self) -> str:
        return "claude-3-5-sonnet-20241022"

    def chat(self, messages: list[ChatMessage], tools: list[str] | None = None) -> str:
        from anthropic import Anthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")

        client = Anthropic(api_key=api_key)

        system_text = None
        formatted = []
        for msg in messages:
            if msg.role == "system":
                system_text = msg.content
                continue
            if msg.role == "user":
                formatted.append({"role": "user", "content": msg.content})
            elif msg.role == "assistant":
                formatted.append({"role": "assistant", "content": msg.content})

        create_kwargs = {
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 1024,
            "messages": formatted,
        }
        if system_text:
            create_kwargs["system"] = system_text
        response = client.messages.create(**create_kwargs)

        if response.content and len(response.content) > 0:
            block = response.content[0]
            if hasattr(block, "text"):
                return block.text
        return ""

