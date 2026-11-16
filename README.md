# Mazel Tov

Mazel Tov is a React, TypeScript, and Vite web app backed by Supabase. It supports community announcements, account and guest access, neighborhood feeds, referrals, ads, and invitation RSVPs.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

```powershell
npm ci
Copy-Item .env.example .env
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` using the values from your Supabase project. The browser app must use only the public anon key; never put a Supabase service-role key in a `VITE_` variable.

```powershell
npm run dev
```

Before deploying, run:

```powershell
npm run typecheck
npm run lint
npm run build
```

## Supabase setup

Create a Supabase project and apply the SQL files in `supabase/migrations` in timestamp order. You can use the Supabase CLI after initializing and linking the project, or run each migration in the Supabase SQL Editor. Configure the production site URL and allowed authentication redirect URLs in Supabase Auth.

Keep the local `.env` file private. The repository ignores it; `.env.example` contains placeholders only.

## Web deployment

Deploy the repository to a static host such as Vercel or Netlify with:

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

Use HTTPS, configure the production domain in Supabase Auth, then test sign-up, sign-in, guest browsing, posting, invitation links and RSVPs, and account deletion on the deployed site. The web manifest supports browser installation where supported; this is not an App Store or Google Play package.

## Before a public launch

- Publish privacy and terms information appropriate for your users and location.
- Establish a process for moderation, abuse reports, and account support.
- Configure Supabase backups, email delivery, and production monitoring.
- Advertising requests currently use manual review and payment follow-up; automated card payments are not configured.
- Test database policies and account flows in a separate production-like Supabase project before inviting users.
