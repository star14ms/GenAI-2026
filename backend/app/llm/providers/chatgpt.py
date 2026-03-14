import os
from ..base import LLMProvider, ChatMessage


class ChatGPTProvider:
    """OpenAI ChatGPT LLM provider."""

    @property
    def name(self) -> str:
        return "ChatGPT"

    @property
    def model(self) -> str:
        if m := os.environ.get("OPENAI_MODEL"):
            return m
        base_url = os.environ.get("OPENAI_BASE_URL")
        return "openai/gpt-oss-120b" if base_url else "gpt-4o-mini"

    @property
    def id(self) -> str:
        return "chatgpt"

    def chat(self, messages: list[ChatMessage], tools: list[str] | None = None) -> str:
        from openai import OpenAI
        from openai import APIConnectionError

        base_url = os.environ.get("OPENAI_BASE_URL")
        api_key = os.environ.get("OPENAI_API_KEY", "test" if base_url else None)
        if not api_key or (api_key.lower() == "test" and not base_url):
            raise ValueError("OPENAI_API_KEY environment variable is required when not using OPENAI_BASE_URL")

        client_kwargs: dict = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url
        client = OpenAI(**client_kwargs)

        formatted = [{"role": msg.role, "content": msg.content} for msg in messages]
        model = self.model

        from ..tools import AVAILABLE_TOOLS
        tool_configs = []
        if tools:
            id_to_config = {t["id"]: t["config"] for t in AVAILABLE_TOOLS}
            for tid in tools:
                if tid in id_to_config:
                    tool_configs.append(id_to_config[tid])

        create_kwargs = {"model": model, "messages": formatted}
        if tool_configs:
            create_kwargs["tools"] = tool_configs

        try:
            response = client.chat.completions.create(**create_kwargs)
        except APIConnectionError:
            # Fallback to OpenAI when hackathon server is unreachable and user has a real key
            has_real_key = api_key and api_key.lower() != "test" and api_key.startswith("sk-")
            if base_url and has_real_key:
                client = OpenAI(api_key=api_key)
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=formatted,
                    **(dict(tools=tool_configs) if tool_configs else {}),
                )
            else:
                raise ValueError(
                    "The GPT-OSS hackathon server is unreachable. "
                    "Uncomment OPENAI_API_KEY in backend/.env to fall back to OpenAI, or try again later."
                )

        if response.choices and len(response.choices) > 0:
            choice = response.choices[0]
            if choice.message and choice.message.content:
                return choice.message.content
        return ""

