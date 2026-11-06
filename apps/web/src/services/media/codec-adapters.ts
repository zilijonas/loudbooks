// Codec adapters: where a packet-copy cut may start, how much decoder preroll it needs, and how the
// container trims it back out (spec 01 §8 "Format Accuracy"). Only these three are copied without re-encoding.
import { Mp3OutputFormat, Mp4OutputFormat, WavOutputFormat, MP3, MP4, WAVE, type EncodedPacket, type InputFormat, type OutputFormat } from 'mediabunny'

export type AdapterKind = 'mp3' | 'aac' | 'pcm'

export interface CodecAdapter {
  kind: AdapterKind
  /** Input containers this adapter has been verified with. */
  inputs: InputFormat[]
  createFormat(): OutputFormat
  extension: string
  /**
   * Longest start trim the output container can express, in samples. MP3 trims via the LAME encoder-delay field
   * (12 bits, plus the 529-sample decoder delay readers add); MP4 via an edit list; PCM is sliced instead.
   */
  maxTrimSamples: number
  /** Smallest trim the container can express (MP3 cannot signal less than the decoder delay). */
  minTrimSamples: number
}

const MP3_DECODER_DELAY = 529

export function adapterFor(codec: string | null): CodecAdapter | null {
  if (codec === 'mp3') {
    return {
      kind: 'mp3',
      inputs: [MP3],
      createFormat: () => new Mp3OutputFormat(),
      extension: 'mp3',
      maxTrimSamples: 0xfff + MP3_DECODER_DELAY,
      minTrimSamples: MP3_DECODER_DELAY,
    }
  }
  if (codec === 'aac') {
    // Mediabunny writes plain MP4 (no chapter atoms); an .m4b source therefore becomes an .m4a session file.
    return {
      kind: 'aac',
      inputs: [MP4],
      createFormat: () => new Mp4OutputFormat({ fastStart: false }),
      extension: 'm4a',
      maxTrimSamples: Infinity,
      minTrimSamples: 1,
    }
  }
  if (codec?.startsWith('pcm-')) {
    return { kind: 'pcm', inputs: [WAVE], createFormat: () => new WavOutputFormat(), extension: 'wav', maxTrimSamples: 0, minTrimSamples: Infinity }
  }
  return null
}

/**
 * Bytes of MP3 main data a frame contributes to the bit reservoir, and how far back (main_data_begin) its own
 * main data starts. Layer III only; returns null for anything else.
 */
export function mp3Reservoir(packet: EncodedPacket): { mainDataBegin: number; mainDataBytes: number } | null {
  const size = packet.data.byteLength
  const d = (i: number) => packet.data[i] ?? 0
  if (size < 8 || d(0) !== 0xff || (d(1) & 0xe0) !== 0xe0 || ((d(1) >> 1) & 3) !== 1) return null
  const mpeg1 = ((d(1) >> 3) & 3) === 3
  const crc = (d(1) & 1) === 0 ? 2 : 0
  const mono = ((d(3) >> 6) & 3) === 3
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17
  const s = 4 + crc
  const mainDataBegin = mpeg1 ? (d(s) << 1) | (d(s + 1) >> 7) : d(s)
  return { mainDataBegin, mainDataBytes: Math.max(0, size - s - sideInfo) }
}
