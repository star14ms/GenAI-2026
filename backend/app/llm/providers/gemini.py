import os
from ..base import LLMProvider, ChatMessage


class GeminiProvider:
    """Google Gemini LLM provider."""

    @property
    def name(self) -> str:
        return "Gemini"

    @property
    def id(self) -> str:
        return "gemini"

    @property
    def model(self) -> str:
        return "gemini-2.0-flash"

    def chat(self, messages: list[ChatMessage]) -> str:
        from google import genai
        from google.genai import types

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required")

        client = genai.Client(api_key=api_key)

        contents = []
        for msg in messages:
            role = "user" if msg.role == "user" else "model"
            contents.append(
                types.Content(role=role, parts=[types.Part.from_text(text=msg.content)])
            )

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=contents,
        )

        if response.text:
            return response.text
        return ""

