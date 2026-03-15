# CommonCents

A full-stack stock research and analysis app with Next.js (Vercel) and FastAPI (AWS Lambda).

## Project Structure

```
├── frontend/     # Next.js → Vercel
├── backend/      # FastAPI + Mangum → AWS Lambda
└── README.md
```

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

### 1. Deploy Backend (AWS)

```bash
cd backend
sam build
sam deploy --guided
```

On first run, answer the prompts (stack name, region, etc.). After deployment, note the **ApiUrl** output.

### 2. Deploy Frontend (Vercel)

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo.
3. Set **Root Directory** to `frontend`.
4. Add environment variable: `NEXT_PUBLIC_API_URL` = your ApiUrl from step 1.
5. Deploy.

Or via CLI:

```bash
cd frontend
npm i -g vercel
vercel
# Set root to frontend, add NEXT_PUBLIC_API_URL when prompted
```

## Chatbot (LLM)

The app includes a chatbot at `/chat` that supports three LLMs: **Gemini**, **Claude**, and **ChatGPT**. Toggle between them in the UI.

Set the corresponding API key(s) for the provider(s) you want to use:

| Variable | Provider | Get key from |
|----------|----------|--------------|
| `GEMINI_API_KEY` | Gemini | [Google AI Studio](https://ai.google.dev/) |
| `ANTHROPIC_API_KEY` | Claude | [Anthropic Console](https://console.anthropic.com/) |
| `OPENAI_API_KEY` | ChatGPT | [OpenAI Platform](https://platform.openai.com/) |

For local development, create `backend/.env` (see `backend/.env.example`). For Lambda, add these as environment variables in `template.yaml` or via the AWS Console.

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | Vercel / .env.local | Backend API base URL (e.g. `https://xxx.execute-api.us-east-1.amazonaws.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel / .env.local | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel / .env.local | Supabase anon public key |
| `GEMINI_API_KEY` | Backend / Lambda | Google Gemini API key (chatbot) |
| `ANTHROPIC_API_KEY` | Backend / Lambda | Anthropic Claude API key (chatbot) |
| `OPENAI_API_KEY` | Backend / Lambda | OpenAI API key (chatbot) |

## Supabase Setup

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
