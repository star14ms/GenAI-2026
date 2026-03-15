# CommonCents

A full-stack stock research and analysis app with Next.js (Vercel) and FastAPI (AWS Lambda). Built with **vibe coding**—AI-assisted development where natural-language specs meet conversational refinement.

## Project Structure

```
├── frontend/     # Next.js → Vercel
├── backend/      # FastAPI + Mangum → AWS Lambda
└── README.md
```

## Tech Stack

### Frontend
| Category | Library | Purpose |
|----------|---------|---------|
| Framework | Next.js 14 | React framework, routing, SSR |
| UI | React 18 | Components |
| Auth/DB | Supabase | Authentication, database |
| Content | react-markdown, rehype-raw | Markdown rendering |
| Language | TypeScript | Typing |

### Backend
| Category | Library | Purpose |
|----------|---------|---------|
| Framework | FastAPI | REST API |
| Serverless | Mangum | FastAPI → AWS Lambda adapter |
| Server | Uvicorn | ASGI server (local dev) |
| Config | python-dotenv, Pydantic | Env loading, validation |

**LLM providers:** google-genai (Gemini), anthropic (Claude), openai (ChatGPT / HuggingFace)

**Stocks:** alpaca-py, pandas, pandas-ta, yfinance, numpy, pytz

### Deployment
| Tool | Purpose |
|------|---------|
| AWS SAM | Deploy backend to Lambda |
| Docker | Container image for Lambda |
| Vercel | Host frontend |

## Prerequisites

- Node.js 18+
- Python 3.11+
- AWS CLI configured (`aws configure`)
- AWS SAM CLI (`brew install aws-sam-cli`)
- Vercel account

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API: http://localhost:8000

- `GET /health` — health check
- `GET /api/hello` — hello message
- `GET /api/chat/providers` — list LLM providers
- `POST /api/chat` — chatbot (body: `{ provider, messages }`)

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local: set NEXT_PUBLIC_API_URL to your backend URL
npm install
npm run dev
```

App: http://localhost:3000

## Deployment

### 1. Deploy Backend (AWS Lambda)

**Build options:**
- **Container** (chat + stocks): `make build` — requires Docker, full deps (pandas, alpaca, yfinance)
- **Zip** (chat only): `make build-zip` — no Docker, minimal deps

**Deploy:**
```bash
cd backend
make build          # or make build-zip
make deploy         # loads .env and deploys with parameter overrides
```

`make deploy` reads `../.env` and passes keys to SAM. Ensure `.env` has no spaces around `=` (e.g. `ALPACA_API_KEY='...'`).

**First-time setup:** Run `sam deploy --guided` once to configure stack name, region, etc. Then use `make deploy`.

**Mac M1/M2:** Set `DOCKER_DEFAULT_PLATFORM=linux/amd64` if Docker build fails (Lambda runs x86_64).

### 2. Deploy Frontend (Vercel)

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo.
3. Set **Root Directory** to `frontend`.
4. Add environment variable: `NEXT_PUBLIC_API_URL` = your ApiUrl from backend deployment.
5. Deploy.

Or via CLI:

```bash
cd frontend
npm i -g vercel
vercel
# Set root to frontend, add NEXT_PUBLIC_API_URL when prompted
```

**Static assets:** Files in `frontend/public/` (e.g. `logo.png`) are included automatically — no extra config.

---

## Deployment Considerations

| Topic | Notes |
|-------|-------|
| **Lambda env vars** | Backend needs `OPENAI_API_KEY`, `ALPACA_API_KEY`, `ALPACA_SECRET_KEY` for full features. Pass via `make deploy` (from `.env`) or `sam deploy --parameter-overrides`. |
| **Secrets** | Never commit `.env`. Use `--parameter-overrides` or AWS Secrets Manager for production. |
| **SAM "No changes"** | If `sam deploy` says stack is up to date but env vars are wrong, update Lambda directly: `aws lambda update-function-configuration --function-name <name> --environment 'Variables={...}'`. |
| **Docker issues** | On Mac, if you see read-only filesystem or I/O errors, see `docs/DOCKER_FIX.md` (VirtioFS → gRPC FUSE, disk space). |
| **Stocks without Alpaca** | If Alpaca keys are missing, stock analysis/stream endpoints return 503. Chat and `/api/stocks/history` (yfinance) still work. |
| **HuggingFace endpoint** | For `OPENAI_BASE_URL` (e.g. HuggingFace), also set `OPENAI_MODEL` to your deployed model id. |

## Chatbot (LLM)

The app includes a chatbot at `/chat` that supports three LLMs: **Gemini**, **Claude**, and **ChatGPT**. Toggle between them in the UI.

Set the corresponding API key(s) for the provider(s) you want to use:

| Variable | Provider | Get key from |
|----------|----------|--------------|
| `GEMINI_API_KEY` | Gemini | [Google AI Studio](https://ai.google.dev/) |
| `ANTHROPIC_API_KEY` | Claude | [Anthropic Console](https://console.anthropic.com/) |
| `OPENAI_API_KEY` | ChatGPT | [OpenAI Platform](https://platform.openai.com/) |

For local development, create `.env` at project root (see `frontend/.env.example`). For Lambda, use `make deploy` (loads from `.env`) or pass via `sam deploy --parameter-overrides`.

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | Vercel / .env.local | Backend API base URL (e.g. `https://xxx.execute-api.ca-central-1.amazonaws.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel / .env.local | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel / .env.local | Supabase anon public key |
| `GEMINI_API_KEY` | Backend / Lambda | Google Gemini API key (chatbot) |
| `ANTHROPIC_API_KEY` | Backend / Lambda | Anthropic Claude API key (chatbot) |
| `OPENAI_API_KEY` | Backend / Lambda | OpenAI or HuggingFace token (chatbot) |
| `OPENAI_BASE_URL` | Backend / Lambda | Optional. Override base URL (e.g. HuggingFace endpoint) |
| `OPENAI_MODEL` | Backend / Lambda | Optional. Model id (e.g. `openai/gpt-oss-120b`) |
| `ALPACA_API_KEY` | Backend / Lambda | Alpaca API key (stock data for analysis/stream) |
| `ALPACA_SECRET_KEY` | Backend / Lambda | Alpaca secret key |

## Supabase Setup

### Required tables

Create the `items` table in Supabase (SQL Editor):

```sql
create table items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now()
);

alter table items enable row level security;

create policy "Allow all" on items for all using (true) with check (true);
```

Then add rows via Table Editor or API.

**Search history (signed-in users):** Run `supabase/migrations/20250317000000_create_search_history.sql` in the Supabase SQL Editor to enable saving and viewing search history for authenticated users.
