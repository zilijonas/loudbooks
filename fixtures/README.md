# Audio test fixtures

Synthetic and public-sample audio for the compiler, import, E2E and transfer tests (plan §10).
Only `fixtures/small/` is committed. Everything else is gitignored and regenerated on demand.

## How to run

```sh
bash fixtures/download-zeland.sh   # -> fixtures/downloads/zeland/ (12 chapters, needs network)
bash fixtures/generate.sh          # -> fixtures/generated/ (~520 MB, ~1 min, run it via memory-queue)
bash fixtures/generate.sh small    # -> fixtures/small/ (committed, regenerate only if the recipe changes)
```

Both scripts are idempotent. Existing non-empty outputs are skipped, and every output is verified with
`ffprobe` (an audio stream with a positive duration) before it is accepted. The Zeland script re-downloads
a file only when the existing copy does not probe as audio.

Heavy generation runs through the shared queue:

```sh
~/ai/bin/memory-queue run --owner <task-id> --label 'loudbooks LB-2 fixtures' --need-gb 1 --restartable --wait 1800 -- bash fixtures/generate.sh
```

Requirements: `ffmpeg`/`ffprobe` (built with `libmp3lame` and the native `aac` encoder), `python3`, `curl`.

## Signal

Generated files use the same test signal: a warbling low tone (pitch varies per chapter) with pink noise
underneath, a 1 kHz, 80 ms beep at every whole second (cut positions can be measured to about 10 ms),
and a 2 kHz, 250 ms beep every 10 seconds.

## What each fixture tests

| Fixture | Tests |
|---|---|
| `generated/mp3-cbr-64k.mp3` | Mono CBR MP3 decode/compile, 10 min |
| `generated/mp3-cbr-128k.mp3` | Stereo CBR MP3, 10 min (channel handling, bitrate-based size checks) |
| `generated/mp3-vbr.mp3` | VBR MP3 (`-q:a 4`): duration/seek accuracy without a fixed bitrate |
| `generated/m4a-aac.m4a` | AAC-LC in M4A container, 10 min |
| `generated/m4b-aac.m4b` | AAC-LC in M4B (audiobook) container, 10 min |
| `generated/wav-pcm.wav` | PCM 16-bit stereo WAV, 3 min (uncompressed input path) |
| `generated/chapters-20/Chapter 1.mp3` … `Chapter 20.mp3` | Multi-file import and natural sort (1, 2, … 10, … 20, not lexical), 30 s each |
| `generated/corrupt.mp3` | Random bytes with an `.mp3` name: decode failure must surface as an error, never a crash. ffprobe reports an `mp3` stream with duration N/A and decoder "Header missing" errors |
| `generated/long-13h.mp3` | 13 h single-file MP3 (mono 32 kbps, ~178 MB): long-file memory, seek and compile limits. Built by stream-copying a 10 min base 78 times, so its duration is 13:00:00.026 (header frame) |
| `downloads/zeland/*.mp3` | Real-world Lithuanian audiobook chapters: 12 files from 25 s to 43 min, varied sizes, spaces and diacritics in names |
| `small/sample-5s-cbr64k.mp3` | Tiny committed unit-test MP3 |
| `small/sample-5s-aac.m4a` | Tiny committed unit-test AAC |
| `small/sample-2s-pcm16.wav` | Tiny committed unit-test WAV (22.05 kHz mono) |
| `small/chapter-1.mp3` … `chapter-3.mp3` | Tiny committed multi-chapter set |
| `../audio_samples/book-short.mp3`, `book-long.mp3` | Owner samples, reference only: never copied, never committed. They are 48 kHz stereo |

## ffprobe table

Codec, sample rate, channels, bitrate, duration and size from `ffprobe` (format size for the file).
Chapters and the Zeland files are listed individually.

| File | Codec | Sample rate | Channels | Bitrate | Duration | Size |
|---|---|---|---|---|---|---|
| generated/mp3-cbr-64k.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:10:00.000 | 4.6 MB |
| generated/mp3-cbr-128k.mp3 | mp3 | 44100 Hz | 2 (stereo) | 128 kb/s | 00:10:00.000 | 9.2 MB |
| generated/mp3-vbr.mp3 | mp3 | 44100 Hz | 2 (stereo) | 97 kb/s (VBR avg) | 00:10:00.000 | 7.0 MB |
| generated/m4a-aac.m4a | aac | 44100 Hz | 2 (stereo) | 128 kb/s | 00:10:00.000 | 9.3 MB |
| generated/m4b-aac.m4b | aac | 44100 Hz | 2 (stereo) | 96 kb/s | 00:10:00.000 | 7.0 MB |
| generated/wav-pcm.wav | pcm_s16le | 44100 Hz | 2 (stereo) | 1411 kb/s | 00:03:00.000 | 30.3 MB |
| generated/long-13h.mp3 | mp3 | 44100 Hz | 1 (mono) | 32 kb/s | 13:00:00.026 | 178.5 MB |
| generated/chapters-20/Chapter 1.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 2.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 3.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 4.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 5.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 6.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 7.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 8.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 9.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 10.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 11.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 12.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 13.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 14.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 15.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 16.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 17.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 18.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 19.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/chapters-20/Chapter 20.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:30.000 | 240.6 kB |
| generated/corrupt.mp3 | mp3 (undecodable) | n/a | n/a | n/a | N/A | 262.1 kB |
| downloads/zeland/001 I PAKOPA. Variantu erdve.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:00:40.897 | 286.9 kB |
| downloads/zeland/002 Izanginis zodis.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:03:03.625 | 1.2 MB |
| downloads/zeland/003 I skyrius. VARIANTU MODELIS.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:00:25.009 | 175.5 kB |
| downloads/zeland/004 Ryto zvaigzdziu snaresys.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:13:54.241 | 5.6 MB |
| downloads/zeland/005 Priziuretojo misle.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:42:46.489 | 17.1 MB |
| downloads/zeland/006 Isvados.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:01:46.777 | 748.1 kB |
| downloads/zeland/007 II skyrius. SVYTUOKLES.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:00:27.721 | 194.6 kB |
| downloads/zeland/008 Destruktyvios svytuokles.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:12:44.017 | 5.1 MB |
| downloads/zeland/009 Svytuokliu kova.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:07:41.481 | 3.1 MB |
| downloads/zeland/010 Marionetes.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:09:39.193 | 3.9 MB |
| downloads/zeland/011 Gaunate tai ko nenorite.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:03:46.345 | 1.5 MB |
| downloads/zeland/012 Svytuokles zlugdymas.mp3 | mp3 | 44100 Hz | 1 (mono) | 56 kb/s | 00:09:51.097 | 3.9 MB |
| small/sample-5s-cbr64k.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:05.000 | 40.6 kB |
| small/sample-5s-aac.m4a | aac | 44100 Hz | 2 (stereo) | 96 kb/s | 00:00:05.000 | 62.0 kB |
| small/sample-2s-pcm16.wav | pcm_s16le | 22050 Hz | 1 (mono) | 352 kb/s | 00:00:02.000 | 88.3 kB |
| small/chapter-1.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:03.000 | 24.5 kB |
| small/chapter-2.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:03.000 | 24.5 kB |
| small/chapter-3.mp3 | mp3 | 44100 Hz | 1 (mono) | 64 kb/s | 00:00:03.000 | 24.5 kB |
| ../audio_samples/book-short.mp3 | mp3 | 48000 Hz | 2 (stereo) | 83 kb/s | 00:11:59.189 | 7.1 MB |
| ../audio_samples/book-long.mp3 | mp3 | 48000 Hz | 2 (stereo) | 85 kb/s | 00:46:12.280 | 28.3 MB |

Zeland sizes are from the source server, and the chapters vary in length. Generated files are deterministic
for a given ffmpeg version, but the encoder output can differ slightly across ffmpeg releases.
