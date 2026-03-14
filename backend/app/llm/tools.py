"""OpenAI-compatible tools available for chat. Used when provider supports them (e.g. ChatGPT)."""

AVAILABLE_TOOLS = [
    {
        "id": "web_search",
        "name": "Web Search",
        "description": "Search the web for current information. Use for news, real-time data, or facts beyond the model's training.",
        "config": {"type": "web_search"},
    },
    {
        "id": "code_interpreter",
        "name": "Code Interpreter",
        "description": "Run Python code in a sandbox. Use for calculations, data analysis, charts, or file processing.",
        "config": {"type": "code_interpreter"},
    },
]
