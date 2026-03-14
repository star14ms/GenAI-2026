import os
from ..base import LLMProvider, ChatMessage


class ChatGPTProvider:
    """OpenAI ChatGPT LLM provider."""

    @property
    def name(self) -> str:
        return "ChatGPT"

    @property
    def id(self) -> str:
        return "chatgpt"

    def chat(self, messages: list[ChatMessage]) -> str:
        from openai import OpenAI

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")

        client = OpenAI(api_key=api_key)

        formatted = [{"role": msg.role, "content": msg.content} for msg in messages]

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=formatted,
        )

        if response.choices and len(response.choices) > 0:
            choice = response.choices[0]
            if choice.message and choice.message.content:
                return choice.message.content
        return ""

