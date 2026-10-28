# Deploy EVChargePress to Vercel (from GitHub)

The Next.js app lives in `web/`. Supabase (database, auth, pg_cron simulators) is already hosted,
so Vercel only runs the web app.

## 1. Push the code to GitHub

```bash
cd "~/projects List/EVChargerPress"
git push -u origin main          # repo: github.com/mithun-uplers/EVchargerPress
```

`.env.local` is git-ignored — secrets never go to GitHub.

## 2. Import the project in Vercel

1. vercel.com → sign in with GitHub → **Add New… → Project**.
2. Pick **mithun-uplers/EVchargerPress** (grant Vercel access to the repo if it isn't listed).
3. **Root Directory: `web`** (important — the app is not at the repo root).
4. Framework preset: **Next.js** (auto-detected). Leave build/install commands as default
   (`npm install` runs `postinstall`, which copies the map worker; `npm run build` builds).

## 3. Environment variables (Project → Settings → Environment Variables)

| Name | Value | Environments |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://igvdjixjrqmrfzrvsqps.supabase.co` | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret (service_role) key — **mark Sensitive**, no `NEXT_PUBLIC_` | Production (and Preview only if needed) |
| `OSM_USER_AGENT` | `EVChargePress/1.0 (mithun.r@mavlers.com)` (recommended for route search) | Production, Preview |
| `SMARTCAR_CLIENT_ID`, `SMARTCAR_CLIENT_SECRET`, `SMARTCAR_MODE` | only when you set up Smartcar | Production |
| `VEHICLE_INGEST_KEY` | only with Smartcar; same value as in `app.set_integration_key('vehicle_ingest', …)` | Production |

Do **not** set `ENABLE_DESIGN_PREVIEW` on Vercel (it exposes the sample-data preview pages).

Then **Deploy**. You get a URL like `https://evchargerpress.vercel.app`.

## 4. Point Supabase Auth at the Vercel URL

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://<your-app>.vercel.app` (or your custom domain)
- **Redirect URLs** — add:
  - `https://<your-app>.vercel.app/auth/confirm`
  - `https://*-<your-vercel-team>.vercel.app/auth/confirm` (preview deployments, optional)
  - keep `http://localhost:3000/auth/confirm` for local dev

Without this, sign-up confirmation and password-reset emails link back to localhost.

## 5. Smoke test the live site

1. Sign in as mithun.r@mavlers.com → sidebar shows **Admin**.
2. `/map` shows the station pins; open a demo station → **Book a slot**.
3. Admin → Users → **Add a user** works (needs `SUPABASE_SERVICE_ROLE_KEY`).
4. Bookings and the demo charger simulator are driven by Supabase pg_cron, so they work the same.

## 6. Every later change

Push to `main` → Vercel deploys production automatically. Pushes to other branches / pull
requests get their own preview URL.

## Notes

- **Custom domain**: Vercel → Project → Settings → Domains → add it, follow the DNS steps,
  then update the Supabase Site URL / Redirect URLs (step 4) and `SMARTCAR_REDIRECT_URI` if used.
- **Smartcar**: add `https://<domain>/api/vehicle-connect/smartcar/callback` as a redirect URI in
  the Smartcar dashboard.
- **Real OCPP chargers**: `tools/ocpp-gateway` keeps WebSocket connections open, which Vercel
  functions can't do. Run it on a small always-on server (Render, Fly.io, Railway, a VM) and point
  it at `https://<domain>/api/integrations/ocpp/...`. The built-in simulator needs nothing extra.
- Database migrations are already applied to Supabase; Vercel never runs them.
