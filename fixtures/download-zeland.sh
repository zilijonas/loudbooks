#!/usr/bin/env bash
# Downloads the first N (default 12) chapter MP3s of the Zeland audiobook index
# into fixtures/downloads/zeland/ (gitignored). Idempotent: existing files that
# still probe as audio are skipped. Owner-provided public samples only; never commit.
set -euo pipefail

BASE="https://bioenergetikas.lt/failai/Zeland/"
COUNT="${ZELAND_COUNT:-12}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HERE/downloads/zeland"

for tool in curl ffprobe python3; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

# Returns 0 when the file has an audio stream with a positive duration.
probe_ok() {
  local dur
  dur="$(ffprobe -v error -select_streams a:0 -show_entries format=duration \
    -of csv=p=0 "$1" 2>/dev/null)" || return 1
  awk -v d="$dur" 'BEGIN { exit !(d + 0 > 0) }'
}

# Percent-encodes a file name for the URL path (spaces and non-ASCII included).
url_encode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$1"
}

mkdir -p "$DEST"
index="$(mktemp "${TMPDIR:-/tmp}/zeland-index.XXXXXX")"
trap 'rm -f "$index"' EXIT

curl --fail --silent --show-error --location --retry 5 --retry-delay 3 \
  --output "$index" "$BASE"

# Chapter links are the .mp3 hrefs in index order; keep the first COUNT.
names=()
while IFS= read -r name; do
  names+=("$name")
done < <(grep -o 'href="[^"]*\.mp3"' "$index" | sed -e 's/^href="//' -e 's/"$//' | head -n "$COUNT")

if [[ "${#names[@]}" -lt "$COUNT" ]]; then
  echo "index yielded ${#names[@]} mp3 links, expected $COUNT" >&2
  exit 1
fi

for name in "${names[@]}"; do
  out="$DEST/$name"
  if [[ -s "$out" ]]; then
    if probe_ok "$out"; then
      echo "skip  $name"
      continue
    fi
    echo "redo  $name (existing file does not probe as audio)"
    rm -f "$out"
  fi

  echo "get   $name"
  tmp="$out.part"
  curl --fail --location --retry 5 --retry-delay 3 --retry-connrefused \
    --output "$tmp" "$BASE$(url_encode "$name")"
  if ! probe_ok "$tmp"; then
    rm -f "$tmp"
    echo "verify failed: $name" >&2
    exit 1
  fi
  mv "$tmp" "$out"
done

echo "done: ${#names[@]} Zeland chapters in $DEST"
