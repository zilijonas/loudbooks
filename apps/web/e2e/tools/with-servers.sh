#!/usr/bin/env bash
# Starts the design server (design/ on :8123) and the Vite dev server (:5173), runs "$@", then stops exactly those PIDs.
# Run it through the memory queue, e.g.:
#   ~/ai/bin/memory-queue run --owner <id> --label 'loudbooks compare' --need-gb 3 --restartable --wait 1800 -- \
#     apps/web/e2e/tools/with-servers.sh node e2e/tools/compare.mjs --section Button --width 390
set -euo pipefail
web="$(cd "$(dirname "$0")/../.." && pwd)"
design="$(cd "$web/../../design" && pwd)"
DESIGN_PORT="${DESIGN_PORT:-8123}"
APP_PORT="${APP_PORT:-5173}"

python3 -m http.server "$DESIGN_PORT" --bind 127.0.0.1 --directory "$design" >/dev/null 2>&1 &
dpid=$!
(cd "$web" && exec ./node_modules/.bin/vite --port "$APP_PORT" --strictPort --host 127.0.0.1 >/dev/null 2>&1) &
vpid=$!
trap 'kill "$dpid" "$vpid" 2>/dev/null || true; wait "$dpid" "$vpid" 2>/dev/null || true' EXIT

for u in "http://127.0.0.1:$DESIGN_PORT/" "http://127.0.0.1:$APP_PORT/loudbooks/"; do
  for _ in $(seq 1 60); do curl -sf -o /dev/null "$u" && break; sleep 0.5; done
done
cd "$web"
"$@"
