import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel

from app.llm import get_provider, list_providers, ChatMessage
from app.llm.prompts import DEFAULT_SYSTEM_PROMPT
from app.llm.tools import AVAILABLE_TOOLS

app = FastAPI(title="Web Service API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    provider: str  # "gemini" | "claude" | "chatgpt"
    messages: list[dict]  # [{"role": "user"|"assistant", "content": "..."}]
    system_prompt: str | None = None
    tools: list[str] | None = None  # e.g. ["web_search", "code_interpreter"]


class ChatResponse(BaseModel):
    reply: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/hello")
def hello():
    return {"message": "Hello from API"}


@app.get("/api/chat/providers")
def chat_providers():
    """List available LLM providers."""
    return {"providers": list_providers()}


@app.get("/api/chat/tools")
def get_tools():
    """List available tools (web_search, code_interpreter). Only ChatGPT supports these."""
    return {"tools": AVAILABLE_TOOLS}


@app.get("/api/chat/system-prompt")
def get_system_prompt():
    """Return the current system prompt (env override or default). Editable in the chat UI."""
    return {
        "system_prompt": os.environ.get("LLM_SYSTEM_PROMPT") or DEFAULT_SYSTEM_PROMPT,
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    """Send messages to the selected LLM and get a reply."""
    provider = get_provider(request.provider)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {request.provider}. Available: gemini, claude, chatgpt",
        )

    messages = [
        ChatMessage(role=m["role"], content=m["content"])
        for m in request.messages
        if m.get("role") in ("user", "assistant", "system") and m.get("content")
    ]
    system_prompt = (
        request.system_prompt
        or os.environ.get("LLM_SYSTEM_PROMPT")
        or DEFAULT_SYSTEM_PROMPT
    )
    if system_prompt:
        messages = [ChatMessage(role="system", content=system_prompt)] + [m for m in messages if m.role != "system"]

    if not messages:
        raise HTTPException(status_code=400, detail="At least one message is required")

    try:
        reply = provider.chat(messages, tools=request.tools)
        return ChatResponse(reply=reply)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


lambda_handler = Mangum(app, lifespan="off")
