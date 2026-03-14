from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel

from backend.app.llm import get_provider, list_providers, ChatMessage
from backend.app.stocks.routers import router

app = FastAPI(title="Web Service API")


@app.on_event("startup")
def startup():
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).resolve().parent / ".env"
        load_dotenv(env_path)
    except ImportError:
        pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


class ChatRequest(BaseModel):
    provider: str  # "gemini" | "claude" | "chatgpt"
    messages: list[dict]  # [{"role": "user"|"assistant", "content": "..."}]


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
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]

    if not messages:
        raise HTTPException(status_code=400, detail="At least one message is required")

    try:
        reply = provider.chat(messages)
        return ChatResponse(reply=reply)
    except ValueError as e:
        status = 503 if "unreachable" in str(e).lower() else 400
        raise HTTPException(status_code=status, detail=str(e))
    except Exception as e:
        from openai import APIConnectionError
        if isinstance(e, APIConnectionError):
            raise HTTPException(
                status_code=503,
                detail="The LLM server is unreachable. Please try again later or use a different provider.",
            )
        raise HTTPException(status_code=500, detail=str(e))


lambda_handler = Mangum(app, lifespan="off")
