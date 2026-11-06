#!/usr/bin/env bash
# Generates synthetic audio fixtures with ffmpeg.
#   bash fixtures/generate.sh          -> fixtures/generated/ (gitignored, large set)
#   bash fixtures/generate.sh small    -> fixtures/small/ (committed, each < 200 KB)
# Idempotent: an output that already exists and is non-empty is skipped.
# Test signal: a warbling tone with pink noise underneath, a 1 kHz 80 ms beep at
# every whole second (cut positions measurable to ~10 ms) and a 2 kHz 250 ms beep
# every 10 s.
set -euo pipefail

MODE="${1:-generated}"
HERE="$(cd "$(dirname "$0")" && pwd)"
case "$MODE" in
  generated) OUT="$HERE/generated" ;;
  small) OUT="$HERE/small" ;;
  *) echo "usage: $0 [small]" >&2; exit 2 ;;
esac

for tool in ffmpeg ffprobe python3; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

mkdir -p "$OUT"

# Returns 0 when the file has an audio stream with a positive duration.
probe_ok() {
  local dur
  dur="$(ffprobe -v error -select_streams a:0 -show_entries format=duration \
    -of csv=p=0 "$1" 2>/dev/null)" || return 1
  awk -v d="$dur" 'BEGIN { exit !(d + 0 > 0) }'
}

# speech_src DURATION PITCH: sets SRC to ffmpeg input/filter args for the test signal.
# Commas inside lt() are escaped for the filtergraph parser; the expression has no ":" or "[".
speech_src() {
  local dur="$1" pitch="$2"
  local expr="0.22*sin(2*PI*(${pitch}+160*sin(2*PI*0.3*t))*t)*(0.55+0.45*sin(2*PI*0.7*t))"
  expr+="+0.5*sin(2*PI*1000*t)*lt(t-floor(t)\\,0.08)"
  expr+="+0.5*sin(2*PI*2000*t)*lt(t/10-floor(t/10)\\,0.025)"
  SRC=(
    -f lavfi -i "aevalsrc=exprs=${expr}:s=44100:d=${dur}"
    -f lavfi -i "anoisesrc=d=${dur}:c=pink:a=0.03:s=7:r=44100"
    -filter_complex "[0:a][1:a]amix=inputs=2:normalize=0:duration=first[a]"
    -map "[a]"
  )
}

# enc PATH FORMAT [ffmpeg args...]: encodes to PATH via a .partial file, then verifies.
enc() {
  local out="$1" fmt="$2"
  shift 2
  if [[ -s "$out" ]] && probe_ok "$out"; then
    echo "skip  $(basename "$out")"
    return 0
  fi
  echo "make  $(basename "$out")"
  rm -f "$out"
  ffmpeg -hide_banner -loglevel error -nostdin -y "$@" -f "$fmt" "$out.partial"
  if ! probe_ok "$out.partial"; then
    rm -f "$out.partial"
    echo "verify failed: $out" >&2
    exit 1
  fi
  mv "$out.partial" "$out"
}

gen_small() {
  speech_src 5 220
  enc "$OUT/sample-5s-cbr64k.mp3" mp3 "${SRC[@]}" -c:a libmp3lame -b:a 64k -ac 1 -ar 44100
  speech_src 5 220
  enc "$OUT/sample-5s-aac.m4a" ipod "${SRC[@]}" -c:a aac -b:a 96k -ac 2 -ar 44100
  speech_src 2 220
  enc "$OUT/sample-2s-pcm16.wav" wav "${SRC[@]}" -c:a pcm_s16le -ac 1 -ar 22050
  for n in 1 2 3; do
    speech_src 3 $((180 + n * 10))
    enc "$OUT/chapter-$n.mp3" mp3 "${SRC[@]}" -c:a libmp3lame -b:a 64k -ac 1 -ar 44100
  done
  local f size
  for f in "$OUT"/*; do
    size="$(wc -c <"$f" | tr -d ' ')"
    if (( size >= 204800 )); then
      echo "committed fixture too large (>= 200 KB): $f" >&2
      exit 1
    fi
  done
}

gen_generated() {
  local src="$OUT/_src"
  mkdir -p "$src" "$OUT/chapters-20"

  speech_src 600 220
  enc "$OUT/mp3-cbr-64k.mp3" mp3 "${SRC[@]}" -c:a libmp3lame -b:a 64k -ac 1 -ar 44100

  speech_src 600 220
  enc "$OUT/mp3-cbr-128k.mp3" mp3 "${SRC[@]}" -c:a libmp3lame -b:a 128k -ac 2 -ar 44100

  speech_src 600 220
  enc "$OUT/mp3-vbr.mp3" mp3 "${SRC[@]}" -c:a libmp3lame -q:a 4 -ac 2 -ar 44100

  speech_src 600 220
  enc "$OUT/m4a-aac.m4a" ipod "${SRC[@]}" -c:a aac -profile:a aac_low -b:a 128k -ac 2 -ar 44100

  speech_src 600 220
  enc "$OUT/m4b-aac.m4b" ipod "${SRC[@]}" -c:a aac -profile:a aac_low -b:a 96k -ac 2 -ar 44100

  speech_src 180 220
  enc "$OUT/wav-pcm.wav" wav "${SRC[@]}" -c:a pcm_s16le -ac 2 -ar 44100

  for n in $(seq 1 20); do
    speech_src 30 $((150 + n * 10))
    enc "$OUT/chapters-20/Chapter $n.mp3" mp3 "${SRC[@]}" -c:a libmp3lame -b:a 64k -ac 1 -ar 44100
  done

  if [[ ! -s "$OUT/corrupt.mp3" ]]; then
    echo "make  corrupt.mp3"
    python3 -c 'import random, sys; sys.stdout.buffer.write(random.Random(1234).randbytes(262144))' \
      >"$OUT/corrupt.mp3.partial"
    mv "$OUT/corrupt.mp3.partial" "$OUT/corrupt.mp3"
  else
    echo "skip  corrupt.mp3"
  fi

  # 13 h mono 32 kbps: one 10-minute base encoded once, then stream-copied 78 times.
  speech_src 600 220
  enc "$src/base-mono-32k.mp3" mp3 "${SRC[@]}" -c:a libmp3lame -b:a 32k -ac 1 -ar 44100
  if [[ ! -s "$OUT/long-13h.mp3" ]] || ! probe_ok "$OUT/long-13h.mp3"; then
    echo "make  long-13h.mp3"
    rm -f "$OUT/long-13h.mp3"
    ffmpeg -hide_banner -loglevel error -nostdin -y -stream_loop 77 -i "$src/base-mono-32k.mp3" \
      -t 46800 -c copy -f mp3 "$OUT/long-13h.mp3.partial"
    probe_ok "$OUT/long-13h.mp3.partial" || { echo "verify failed: long-13h.mp3" >&2; exit 1; }
    mv "$OUT/long-13h.mp3.partial" "$OUT/long-13h.mp3"
  else
    echo "skip  long-13h.mp3"
  fi
}

if [[ "$MODE" == small ]]; then
  gen_small
else
  gen_generated
fi
echo "done: $MODE fixtures in $OUT"
