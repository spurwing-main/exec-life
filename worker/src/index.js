import { Hono } from "hono";
import { cors } from "hono/cors";

// Clean worker shell. Add routes under src/routes/ and shared helpers under
// src/lib/ as the site needs them (e.g. file uploads, third-party proxies that
// must keep an API key server-side).

const app = new Hono();

app.use(
	"*",
	cors({
		origin: (origin, c) => {
			const allowed = (c.env.ALLOWED_ORIGINS || "")
				.split(",")
				.map((o) => o.trim())
				.filter(Boolean);
			return allowed.includes(origin) ? origin : "";
		},
	})
);

app.get("/health", (c) => c.json({ ok: true }));

export default app;
