# Google Social Login Setup

## 1. Supabase Dashboard

### Enable Google Provider
1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. **Authentication** → **Providers** → **Google**
3. Enable Google and note the **Callback URL** (e.g. `https://xxx.supabase.co/auth/v1/callback`)

### Add Redirect URL (required for "No auth code received")
1. **Authentication** → **URL Configuration**
2. Add your app URL(s) to **Redirect URLs**:
   - `http://localhost:3000/auth/callback` (development)
   - `https://yourdomain.com/auth/callback` (production)
3. If the exact path fails, try the wildcard: `http://localhost:3000/**`
4. **Save** — without this, Supabase redirects without the auth code and the callback fails

## 2. Google Cloud Console (fixes redirect_uri_mismatch)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs & Services** → **Credentials**
3. Click your **OAuth 2.0 Client ID** (Web application)
4. Under **Authorized redirect URIs**, add this **exact** URL (no trailing slash):
   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```
   Example: `https://luiodmrjlwoktksescqz.supabase.co/auth/v1/callback`
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000`
   - `https://yourdomain.com` (or your Vercel URL)
6. **Save** — changes can take a few minutes to propagate

## 3. Supabase – Add Google Credentials

1. Back in Supabase → **Authentication** → **Providers** → **Google**
2. Paste **Client ID** and **Client Secret**
3. Save

## 4. Run Database Migration (chat history)

User info comes from **Authentication → Users** (Supabase Auth). For chat history, run:

**Option A – Supabase SQL Editor:**
1. Supabase Dashboard → **SQL Editor**
2. Run `supabase/migrations/20250315000000_create_chat_messages.sql`

**Option B – Supabase CLI:**
```bash
supabase db push
```

## 5. Environment Variables

Ensure `.env.local` has:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Flow

1. User clicks "Sign in with Google"
2. Redirects to Google OAuth
3. Google redirects back to Supabase callback
4. Supabase creates/updates `auth.users` and redirects to `/auth/callback`
5. Next.js route exchanges code for session
6. Trigger creates/updates row in `public.profiles` with email, name, avatar
