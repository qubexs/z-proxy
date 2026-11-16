# z-proxy

**Use OpenCode Zen's free models from any AI coding agent — no account, no API key. Hourly identity rotation added.**

This is the **qubexs/z-proxy** repository — a patched fork of [12errh/zen-proxy](https://github.com/12errh/zen-proxy) with hourly identity rotation (`identityRotateMs: 3600000`), plus a convenience launcher and installer so you can run it standalone or side-by-side with OmniRoute.

---

## What you get

- **Full zen-proxy server** (`zen-proxy.mjs`) with:
  - OpenAI `/v1/chat/completions` and `/v1/responses` routes
  - Anthropic `/v1/messages` route (for Claude Code)
  - Hourly identity rotation (fresh session + project + trace every 60 min)
  - Hot-reloadable config via `zen-proxy.json`
- **Launcher** (`run-zen-proxy.sh`) — start/stop with `./run-zen-proxy.sh`
- **Installer** (`install.sh`) — quick start with Bun (recommended) or Node
- **Config template** (`zen-proxy.json`) — `{ "identityRotateMs": 3600000 }`

---

## Quick start

### Standalone

```bash
# Clone or download this repo
git clone https://github.com/qubexs/z-proxy.git
cd z-proxy

# Start (uses Bun if available, falls back to Node)
./run-zen-proxy.sh

# Or start in foreground
bun zen-proxy.mjs     # recommended
# or
node zen-proxy.mjs
```

Health check:

```bash
curl -s http://127.0.0.1:8787/health
# {"ok":true,"upstream":"https://opencode.ai/inference/openai/v1"}
```

Point any OpenAI-compatible agent at:

| Setting | Value |
|---|---|
| Base URL | `http://127.0.0.1:8787/v1` |
| API key | `public` |
| Model | anything from `GET /v1/models` |

For Claude Code:

```bash
# Start the proxy, then run Claude Code with it
zen-claude
# (zen-claude is provided by upstream zen-proxy; you can also set ANTHROPIC_BASE_URL manually)
```

### Side-by-side with OmniRoute

Drop the `zen-proxy` folder inside your OmniRoute workspace:

```
omniroute/
└── zen-proxy/
    ├── zen-proxy.mjs
    ├── zen-proxy.json
    ├── run-zen-proxy.sh
    ├── install.sh
    └── README.md
```

From the OmniRoute root:

```bash
./zen-proxy/run-zen-proxy.sh       # start
./zen-proxy/run-zen-proxy.sh stop  # stop
```

---

## Configuration

Edit `zen-proxy.json` (hot-reloaded while the server runs):

| Key | Default | Effect |
|---|---|---|
| `identityRotateMs` | `3600000` (1 hr) | Fresh session/project/trace every interval. Set `0` to keep a stable identity. |
| `retriesPerModel` | `2` | Retries per model before the fallback chain moves on. |
| `autoSync` | `true` | Hourly probe of live free models. |
| `autoUA` | `true` | Refreshes the injected `User-Agent` from npm. |
| `proxyKey` | `""` | If set, require this as the API key. |
| `defaultZenKey` | `""` | BYOK: your own OpenCode Zen key. |

Environment overrides (startup only):

- `IDENTITY_ROTATE_MS=0` — disable rotation.
- `ZEN_PROXY_CONFIG` — point to a different `zen-proxy.json`.
- `PORT` / `HOST` — bind address (default `8787` / `127.0.0.1`).
- `ZEN_KEY` — your Zen key.
- `ZEN_URL` — override upstream base URL.

---

## Identity rotation

Each rotation (default: every 60 min):

1. Clears the in-memory `identityPool`.
2. Resets the session clock.
3. Re-rolls the trace root (`traceRoot`).

This makes every request after a rotation carry a **new session ID, project hash, and trace root** — indistinguishable on the wire from a fresh OpenCode CLI in a new workspace.

The startup log confirms it:

```
identity rotation every 60 min — fresh session/project/trace per window
```

---

## Files

| File | Purpose |
|---|---|
| `zen-proxy.mjs` | The patched server (zero dependencies). |
| `zen-proxy.json` | Hot-reloadable config. |
| `run-zen-proxy.sh` | Launcher: `./run-zen-proxy.sh [start|stop]`. |
| `install.sh` | Quick install + run with Bun/Node. |
| `package.json` | npm metadata. |
| `README.md` | This file. |

---

## Requirements

- **Bun** (recommended) or **Node.js 18+**.
- No account or API key required for the free tier.

The upstream README warns that Node's TLS stack can trigger `429 FreeUsageLimitError` — **run under Bun for best results**.

---

## Original upstream

This is based on <https://github.com/12errh/zen-proxy> (MIT). The only change is the identity-rotation feature plus the launcher/installer and this README.

---

## License

MIT — same as upstream.