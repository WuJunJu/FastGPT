#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/projects/app"
STANDALONE_DIR="$APP_DIR/.next/standalone"
STANDALONE_APP_DIR="$STANDALONE_DIR/projects/app"
ENV_FILE="$APP_DIR/.env.local"

if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
  echo "FastGPT standalone build not found at $STANDALONE_APP_DIR/server.js" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FastGPT env file not found at $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$STANDALONE_APP_DIR/.next"
ln -sfn "$STANDALONE_DIR" /app
rm -rf "$STANDALONE_APP_DIR/public"
mkdir -p "$STANDALONE_APP_DIR/public"
cp -a "$APP_DIR/public/." "$STANDALONE_APP_DIR/public/"
ln -sfn "$APP_DIR/.next/static" "$STANDALONE_APP_DIR/.next/static"
ln -sfn "$ENV_FILE" "$STANDALONE_APP_DIR/.env.local"

set -a
source <(tr -d '\r' < "$ENV_FILE")
set +a

export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export HOSTNAME="0.0.0.0"
export PORT="${PORT:-3100}"
export CONFIG_JSON_PATH="${CONFIG_JSON_PATH:-$APP_DIR/data}"

cd "$STANDALONE_DIR"
exec node --max-old-space-size=4096 /app/projects/app/server.js
