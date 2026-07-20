# Exec-Life Worker

Cloudflare Worker backing the Exec-Life Webflow site. This is a clean shell —
it currently exposes a single `/health` route and CORS wired to
`ALLOWED_ORIGINS`. Add routes as the site needs server-side work a browser
can't do safely (file uploads, keeping third-party API keys off the client).

## Setup

```bash
npm install
cp wrangler.toml.example wrangler.toml   # then edit for this environment
```

## Develop / deploy

```bash
npm run dev      # wrangler dev  → http://localhost:8787
npm run deploy   # wrangler deploy
```

Set secrets with `wrangler secret put <NAME>`.
