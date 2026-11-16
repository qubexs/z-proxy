#!/usr/bin/env node
/**
 * install-omniroute.mjs — Type 2 install: zen-proxy side-by-side with OmniRoute.
 *
 * What it does:
 *   1. Locates your OmniRoute install and its runtime data dir.
 *   2. Copies zen-proxy into <dataDir>/bin/zen-proxy (next to cliproxyapi etc.).
 *   3. If the OmniRoute server is running, registers:
 *        - a provider node  (prefix "zen", apiType "chat")
 *        - an active provider connection bound to that node
 *   4. Optionally starts zen-proxy under Bun (or Node).
 *
 * Usage:
 *   node install-omniroute.mjs                 # install + register (no start)
 *   node install-omniroute.mjs --start         # install + register + run
 *   node install-omniroute.mjs --no-register   # only copy files
 *   node install-omniroute.mjs --data-dir <p>  # override data dir
 *   node install-omniroute.mjs --omniroute <p> # override omniroute package dir
 *
 * Idempotent: existing node/connection with the same name are reused.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NODE_NAME = "zen-proxy";
const PREFIX = "zen";
const API_TYPE = "chat";
const NODE_TYPE = "openai-compatible";
const PORT = Number(process.env.PORT || 8787);
const BASE_URL = `http://127.0.0.1:${PORT}/v1`;
const SERVER = process.env.OMNIROUTE_BASE_URL || "http://127.0.0.1:20128";

function log(msg) { console.log(`[zen-proxy] ${msg}`); }
function fail(msg) { console.error(`[zen-proxy] ERROR: ${msg}`); process.exit(1); }

// ── 1. Resolve OmniRoute package dir ─────────────────────────────────────────
function resolveOmnirouteDir() {
  const explicit = val("--omniroute");
  if (explicit) return explicit;
  if (process.env.OMNIROUTE_DIR) return process.env.OMNIROUTE_DIR;

  const candidates = [];
  if (process.platform === "win32") {
    if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules", "omniroute"));
  } else {
    candidates.push("/usr/local/lib/node_modules/omniroute");
    candidates.push("/usr/lib/node_modules/omniroute");
  }
  candidates.push(path.join(os.homedir(), ".npm-global", "lib", "node_modules", "omniroute"));
  candidates.push(path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "omniroute"));

  for (const c of candidates) {
    try { if (fs.existsSync(path.join(c, "package.json"))) return c; } catch {}
  }
  return null;
}

// ── 2. Resolve data dir ──────────────────────────────────────────────────────
function resolveDataDir() {
  const explicit = val("--data-dir");
  if (explicit) return explicit;
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  return path.join(os.homedir(), ".omniroute");
}

const omniDir = resolveOmnirouteDir();
const dataDir = resolveDataDir();
const destDir = path.join(dataDir, "bin", "zen-proxy");

log(`omniroute: ${omniDir ?? "(not found — copying only)"}`);
log(`data dir : ${dataDir}`);
log(`install  : ${destDir}`);

// ── 3. Copy files ────────────────────────────────────────────────────────────
const skipCopy = has("--no-copy");
if (!skipCopy) {
fs.mkdirSync(destDir, { recursive: true });
const FILES = ["zen-proxy.mjs", "zen-proxy.json", "run-zen-proxy.sh", "README.md"];
for (const f of FILES) {
  const src = path.join(HERE, f);
  if (!fs.existsSync(src)) {
    log(`skip (missing): ${f}`);
    continue;
  }
  fs.copyFileSync(src, path.join(destDir, f));
  log(`copied ${f}`);
}

// Ensure a config with hourly rotation exists and is not overwritten.
const cfgPath = path.join(destDir, "zen-proxy.json");
if (!fs.existsSync(cfgPath)) {
  fs.writeFileSync(cfgPath, JSON.stringify({ identityRotateMs: 3600000 }, null, 2) + "\n");
  log("created zen-proxy.json (identityRotateMs: 3600000)");
} else {
  log("kept existing zen-proxy.json");
}
} else {
  log("skipping file copy (--no-copy)");
}

// ── 4. Register with a running OmniRoute server ──────────────────────────────
async function cliToken() {
  if (!omniDir) return null;
  const tokenFile = path.join(omniDir, "bin", "cli", "utils", "cliToken.mjs");
  if (!fs.existsSync(tokenFile)) return null;
  try {
    const mod = await import(pathToFileURL(tokenFile).href);
    return await mod.getCliToken();
  } catch {
    return null;
  }
}

async function api(token, method, route, body) {
  const res = await fetch(`${SERVER}${route}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(token ? { "x-omniroute-cli-token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function register() {
  let token = null;
  try {
    const ping = await fetch(`${SERVER}/api/provider-nodes`, { signal: AbortSignal.timeout(3000) });
    if (!ping.status) throw new Error("no status");
  } catch {
    log(`OmniRoute server not reachable at ${SERVER}; skipping registration.`);
    log("Start OmniRoute, then re-run: node install-omniroute.mjs --no-copy");
    return;
  }

  token = await cliToken();
  if (!token) fail("could not derive the OmniRoute CLI token; run from the same user that owns OmniRoute");

  // Node
  const nodesRes = await api(token, "GET", "/api/provider-nodes");
  const nodes = nodesRes.json?.nodes ?? [];
  let node = nodes.find((n) => n.name === NODE_NAME && n.prefix === PREFIX);
  if (!node) {
    const created = await api(token, "POST", "/api/provider-nodes", {
      type: NODE_TYPE,
      apiType: API_TYPE,
      name: NODE_NAME,
      prefix: PREFIX,
      baseUrl: BASE_URL,
    });
    if (created.status >= 300) fail(`node create failed: ${created.text.slice(0, 300)}`);
    node = created.json.node;
    log(`node created: ${node.id}`);
  } else {
    log(`node exists : ${node.id}`);
  }

  // Connection
  const provRes = await api(token, "GET", "/api/providers");
  const list = provRes.json?.providers ?? provRes.json?.connections ?? provRes.json?.data ?? [];
  let conn = Array.isArray(list) ? list.find((p) => p.name === NODE_NAME) : null;
  if (!conn) {
    const created = await api(token, "POST", "/api/providers", {
      provider: `${NODE_TYPE}-${API_TYPE}`,
      name: NODE_NAME,
      apiKey: "public",
      providerSpecificData: {
        baseUrl: BASE_URL,
        apiType: API_TYPE,
        prefix: PREFIX,
        nodeId: node.id,
      },
    });
    if (created.status >= 300) fail(`connection create failed: ${created.text.slice(0, 300)}`);
    conn = created.json.connection;
    log(`connection created: ${conn.id}`);
  } else {
    log(`connection exists : ${conn.id}`);
  }

  // Activate
  const activated = await api(token, "PATCH", `/api/providers/${conn.id}`, { isActive: true });
  if (activated.status >= 300) log(`activate returned ${activated.status}`);
  else log("connection active");

  log(`route as: ${PREFIX}/<model>  (e.g. ${PREFIX}/big-pickle)`);
}

// ── 5. Start zen-proxy ───────────────────────────────────────────────────────
function start() {
  const runner = (() => {
    try {
      execSync("bun --version", { stdio: "ignore" });
      return "bun";
    } catch {
      return "node";
    }
  })();

  log(`starting zen-proxy with ${runner} on ${BASE_URL}...`);
  const child = spawn(runner, ["zen-proxy.mjs"], {
    cwd: destDir,
    stdio: "inherit",
    detached: false,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

// ── main ─────────────────────────────────────────────────────────────────────
const skipCopyMain = has("--no-copy");
if (!skipCopyMain) log("files installed");
if (!has("--no-register")) await register();
if (has("--start")) start();
else log("done. Start with: ./run-zen-proxy.sh  (or: bun zen-proxy.mjs)");
