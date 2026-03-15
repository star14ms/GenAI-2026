import os
import json
import ssl
import urllib.request
import urllib.error
from dotenv import load_dotenv
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
        load_dotenv()

        api_key = (
            os.environ.get("OPENAI_API_KEY")
            or os.environ.get("HUGGINGFACEHUB_API_TOKEN")
            or os.environ.get("HF_TOKEN")
        )
        base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        ssl_verify = os.environ.get("OPENAI_SSL_VERIFY", "true").lower() not in {
            "0",
            "false",
            "no",
        }

        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")

        if str(api_key).startswith("http://") or str(api_key).startswith("https://"):
            raise ValueError(
                "OPENAI_API_KEY is set to a URL. Put the endpoint URL in OPENAI_BASE_URL and put the real API token in OPENAI_API_KEY."
            )

        if "huggingface" in str(base_url).lower() and model == "gpt-4o-mini":
            raise ValueError(
                "OPENAI_MODEL is set to gpt-4o-mini, but this Hugging Face endpoint likely serves a different model. Set OPENAI_MODEL to your deployed endpoint model id."
            )

        formatted = [{"role": msg.role, "content": msg.content} for msg in messages]
        model = self.model

        payload_obj: dict = {"model": model, "messages": formatted}
        if tools:
            from ..tools import AVAILABLE_TOOLS
            tool_configs = []
            for t in AVAILABLE_TOOLS:
                if t["id"] not in tools:
                    continue
                cfg = t.get("config")
                if cfg is None and "config_factory" in t:
                    cfg = t["config_factory"]()
                if not cfg or not isinstance(cfg, dict):
                    continue
                if cfg.get("type") == "file_search" and not cfg.get("vector_store_ids"):
                    continue
                tool_configs.append(cfg)
            if tool_configs:
                payload_obj["tools"] = tool_configs

        payload = json.dumps(payload_obj).encode("utf-8")

        endpoint = f"{base_url.rstrip('/')}/chat/completions"
        request = urllib.request.Request(
            endpoint,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

        if ssl_verify:
            try:
                import certifi

                ssl_context = ssl.create_default_context(cafile=certifi.where())
            except Exception:
                ssl_context = ssl.create_default_context()
        else:
            ssl_context = ssl._create_unverified_context()

        try:
            with urllib.request.urlopen(request, timeout=60, context=ssl_context) as response:
                response_json = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", errors="ignore")
            except Exception:
                pass
            if e.code == 404 and "model" in (body or "").lower():
                raise ValueError(
                    f"LLM endpoint request failed (404): model '{model}' not found. Set OPENAI_MODEL to the deployed model id for this endpoint."
                )
            raise ValueError(f"LLM endpoint request failed ({e.code}): {body or e.reason}")
        except Exception as e:
            raise ValueError(f"LLM endpoint request failed: {str(e)}")

        choices = response_json.get("choices") or []
        if choices:
            message = (choices[0] or {}).get("message") or {}
            content = message.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                text_parts = [
                    part.get("text", "")
                    for part in content
                    if isinstance(part, dict)
                ]
                return "".join(text_parts).strip()
        return ""

    def chat_stream(self, messages: list[ChatMessage], tools: list[str] | None = None):
        """Stream chat response token by token. Yields text chunks."""
        load_dotenv()
        from openai import OpenAI

        api_key = (
            os.environ.get("OPENAI_API_KEY")
            or os.environ.get("HUGGINGFACEHUB_API_TOKEN")
            or os.environ.get("HF_TOKEN")
        )
        base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        model = self.model

        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")

        client = OpenAI(api_key=api_key, base_url=base_url)
        formatted = [{"role": msg.role, "content": msg.content} for msg in messages]

        payload: dict = {"model": model, "messages": formatted, "stream": True}
        # Tools are not supported for streaming in this implementation

        stream = client.chat.completions.create(**payload)
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

