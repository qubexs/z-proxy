#!/bin/bash
# run-zen-proxy.sh - Start the patched zen-proxy with hourly identity rotation
#
# Usage:
#   ./run-zen-proxy.sh          # start with default config (identityRotateMs: 3600000)
#   ./run-zen-proxy.sh stop     # stop if running
#
# Requirements: bun (recommended) or node

set -e
cd "$(dirname "$0")"

PID_FILE="zen-proxy.pid"
PORT="${PORT:-8787}"

if [ "$1" = "stop" ]; then
  if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping zen-proxy (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      rm -f "$PID_FILE"
      echo "Stopped."
      exit 0
    else
      echo "zen-proxy not running (stale PID file)."
      rm -f "$PID_FILE"
      exit 0
    fi
  else
    echo "zen-proxy not running (no PID file)."
    exit 0
  fi
fi

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "zen-proxy already running (PID $(cat "$PID_FILE")). Use '$0 stop' to stop."
  exit 0
fi

if command -v bun >/dev/null 2>&1; then
  echo "Starting zen-proxy with Bun (identity rotation every 60 min)..."
  nohup bun zen-proxy.mjs > zen-proxy.log 2>&1 &
  echo $! > "$PID_FILE"
  echo "Started. PID: $(cat "$PID_FILE")"
  echo "Health: curl -s http://127.0.0.1:${PORT}/health"
  echo "Logs:   tail -f zen-proxy.log"
else
  echo "Bun not found. Starting with Node..."
  nohup node zen-proxy.mjs > zen-proxy.log 2>&1 &
  echo $! > "$PID_FILE"
  echo "Started. PID: $(cat "$PID_FILE")"
  echo "Health: curl -s http://127.0.0.1:${PORT}/health"
  echo "Logs:   tail -f zen-proxy.log"
fi