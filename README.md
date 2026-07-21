# GROUP FLOW V1.4 — Supabase Auth

## 1) Supabase database
Open **Supabase → SQL Editor → New query**, paste `supabase/schema.sql`, then click **Run**.

## 2) Create the first user
Open **Authentication → Users → Add user**. Create an email/password account and enable **Auto Confirm User**.

## 3) Vercel environment variables
Open **Vercel → Project → Settings → Environment Variables** and add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use the Project URL ending in `.supabase.co`, not the dashboard URL. Apply to Production, Preview, and Development, then redeploy.

## 4) Local development
Copy `.env.example` to `.env.local`, fill in the two values, then run:

```bash
npm ci
npm run dev
```

Open `/login` and sign in with the user created in Supabase.
