// SessionCompiler: copies only the planned packets of a SessionPlan into ONE session file in OPFS
// (spec 01 §8 steps 3-7). No decoding, no re-encoding; unsupported inputs are refused, never transcoded.
import {
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  ALL_FORMATS,
  Output,
  StreamTarget,
  type AudioCodec,
  type EncodedPacket,
  type InputAudioTrack,
} from 'mediabunny'
import type { SessionPart } from '../../domain/session-planner'
import { adapterFor, mp3Reservoir, type CodecAdapter } from './codec-adapters'
import { createSessionFile, deleteSession, openPositionedWritable } from './opfs-output'

export type CompilePhase = 'analyzing' | 'reading' | 'writing' | 'finalizing'

export interface CompileProgress {
  phase: CompilePhase
  /** Units of real work finished in this phase: parts (analyzing, reading) or packets (writing, finalizing). */
  done: number
  total: number
  bytesWritten: number
}

export interface CompileRequest {
  sessionId: string
  parts: SessionPart[]
}

export interface PartTrim {
  assetId: string
  /** Extra source seconds kept before the planned start (packet boundary or join preroll). */
  leading: number
  /** Extra source seconds kept after the planned end (the last packet runs past it). */
  trailing: number
  /** Packets copied ahead of the start packet so the decoder state (MDCT overlap, MP3 bit reservoir) is valid. */
  prerollPackets: number
  /** Seconds the container hides at the file start (MP3 LAME delay / MP4 edit list). */
  containerTrim: number
}

export interface CompileResult {
  outputPath: string
  mimeType: string
  /** Actual packet-boundary map: session media time -> asset time. */
  sourceMap: SessionPart[]
  /** Duration of the written timeline. */
  writtenMediaDuration: number
  /** Duration measured by re-reading the finished file. */
  actualMediaDuration: number
  trims: PartTrim[]
}

export type CompileErrorName = 'AbortError' | 'QuotaExceededError' | 'UnsupportedMediaError' | 'VerificationError'

/** Typed failure; only `name` and `message` survive the worker boundary, so the type lives in `name`. */
export class CompileError extends Error {
  constructor(name: CompileErrorName, message: string) {
    super(message)
    this.name = name
  }
}

export interface CompileDeps {
  getFile(assetId: string): Promise<Blob>
  onProgress?(progress: CompileProgress): void
}

const EPS = 1e-6
const VERIFY_TOLERANCE = 0.1
// Bounded write buffer: positioned 1 MiB chunks instead of one OPFS write per packet.
const WRITE_CHUNK = 1 << 20

interface PartPlan {
  part: SessionPart
  input: Input
  track: InputAudioTrack
  sink: EncodedPacketSink
  first: EncodedPacket
  preroll: number
  packetCount: number
}

function findCause(error: unknown, name: string): boolean {
  for (let e = error as { name?: string; cause?: unknown } | undefined, depth = 0; e && depth < 5; e = e.cause as typeof e, depth++) {
    if (e.name === name) return true
  }
  return false
}

const sameBytes = (a?: AllowSharedBufferSource, b?: AllowSharedBufferSource) => {
  if (!a || !b) return a === b
  const x = new Uint8Array(ArrayBuffer.isView(a) ? a.buffer : a, ArrayBuffer.isView(a) ? a.byteOffset : 0, a.byteLength)
  const y = new Uint8Array(ArrayBuffer.isView(b) ? b.buffer : b, ArrayBuffer.isView(b) ? b.byteOffset : 0, b.byteLength)
  return x.length === y.length && x.every((v, i) => v === y[i])
}

export async function compileSession(request: CompileRequest, deps: CompileDeps): Promise<CompileResult> {
  const { parts, sessionId } = request
  if (parts.length === 0) throw new CompileError('UnsupportedMediaError', 'Nothing to compile: the plan has no parts')
  let bytesWritten = 0
  let lastReport = 0
  const report = (phase: CompilePhase, done: number, total: number, force = false) => {
    const now = performance.now()
    if (!deps.onProgress || (!force && now - lastReport < 100 && done < total)) return
    lastReport = now
    deps.onProgress({ phase, done, total, bytesWritten })
  }

  const plans: PartPlan[] = []
  let output: Output | null = null
  let release: (() => unknown) | null = null
  try {
    // analyzing: open each source, refuse anything we cannot packet-copy correctly.
    let adapter: CodecAdapter | null = null
    let config: AudioDecoderConfig | null = null
    let codec: AudioCodec | null = null
    for (const [i, part] of parts.entries()) {
      report('analyzing', i, parts.length, i === 0)
      const input = new Input({ source: new BlobSource(await deps.getFile(part.assetId)), formats: ALL_FORMATS })
      const track = await input.getPrimaryAudioTrack()
      const partAdapter = adapterFor(track?.codec ?? null)
      const format = await input.getFormat().catch(() => null)
      if (!track || !partAdapter || !format || !partAdapter.inputs.includes(format)) {
        input.dispose()
        throw new CompileError('UnsupportedMediaError', `Asset ${part.assetId}: ${track?.codec ?? 'no audio'} in ${format?.name ?? 'unknown container'} cannot be prepared without re-encoding`)
      }
      const partConfig = await track.getDecoderConfig()
      if (!partConfig) {
        input.dispose()
        throw new CompileError('UnsupportedMediaError', `Asset ${part.assetId}: missing decoder config`)
      }
      if (config && (partAdapter.kind !== adapter!.kind || partConfig.codec !== config.codec || partConfig.sampleRate !== config.sampleRate
        || partConfig.numberOfChannels !== config.numberOfChannels || !sameBytes(partConfig.description, config.description))) {
        input.dispose()
        throw new CompileError('UnsupportedMediaError', `Asset ${part.assetId} has a different codec setup than the rest of the session; one file cannot hold both without re-encoding`)
      }
      adapter ??= partAdapter
      config ??= partConfig
      codec ??= track.codec
      plans.push({ part, input, track, sink: new EncodedPacketSink(track), first: null!, preroll: 0, packetCount: 0 })
    }
    const sampleRate = config!.sampleRate

    // reading: locate start packet, decoder preroll and packet count per part.
    let totalPackets = 0
    for (const [i, plan] of plans.entries()) {
      report('reading', i, plans.length, i === 0)
      const { sink, part } = plan
      const start = (await sink.getPacket(part.sourceStart)) ?? (await sink.getFirstPacket())
      if (!start) throw new CompileError('UnsupportedMediaError', `Asset ${part.assetId} has no audio packets`)
      let first = start
      let preroll = 0
      if (adapter!.kind === 'aac') {
        // One packet of MDCT overlap; at a file start this is the encoder priming packet.
        const prev = await sink.getPacket(start.timestamp - start.duration / 2)
        if (prev) [first, preroll] = [prev, 1]
      } else if (adapter!.kind === 'mp3' && i === 0) {
        // Later parts always start at their file's first frame (main_data_begin 0). The first part starts
        // mid-file: keep earlier frames until the start frame's bit reservoir is covered (at least one, for
        // MDCT overlap), within what the LAME delay field can hide again.
        const need = mp3Reservoir(start)?.mainDataBegin ?? 0
        const lead = Math.round((part.sourceStart - start.timestamp) * sampleRate)
        let have = 0
        while (preroll === 0 || have < need) {
          const prev = await sink.getPacket(first.timestamp - first.duration / 2)
          if (!prev || lead + Math.round((start.timestamp - prev.timestamp) * sampleRate) > adapter!.maxTrimSamples) break
          have += mp3Reservoir(prev)?.mainDataBytes ?? 0
          first = prev
          preroll++
        }
      }
      const last = (await sink.getPacket(part.sourceEnd - EPS, { metadataOnly: true })) ?? start
      plan.first = first
      plan.preroll = preroll
      plan.packetCount = last.sequenceNumber >= 0 && first.sequenceNumber >= 0
        ? last.sequenceNumber - first.sequenceNumber + 1
        : Math.ceil((part.sourceEnd - first.timestamp) / start.duration)
      totalPackets += plan.packetCount
    }

    // writing: one output, one continuous timeline counted in integer samples.
    const file = await createSessionFile(sessionId, `audio.${adapter!.extension}`)
    const writable = await openPositionedWritable(file.handle, (bytes) => (bytesWritten += bytes))
    release = writable.release
    output = new Output({ format: adapter!.createFormat(), target: new StreamTarget(writable.stream, { chunked: true, chunkSize: WRITE_CHUNK }) })
    const source = new EncodedAudioPacketSource(codec!)
    output.addAudioTrack(source)
    await output.start()

    const sourceMap: SessionPart[] = []
    const trims: PartTrim[] = []
    let outSamples = 0
    let outIndex = 0
    let packetsDone = 0
    for (const [i, plan] of plans.entries()) {
      const { part, sink } = plan
      let containerTrim = 0
      if (i === 0) {
        const lead = Math.round((part.sourceStart - plan.first.timestamp) * sampleRate)
        const trim = Math.min(lead, adapter!.maxTrimSamples)
        // Negative timestamps become the MP3 LAME delay / MP4 edit list, so playback starts at sourceStart.
        containerTrim = trim >= adapter!.minTrimSamples ? trim : 0
        outSamples = -containerTrim
      }
      const partStartSamples = outSamples
      let mapStart: number | null = null
      let mapEnd = part.sourceStart
      for await (const packet of sink.packets(plan.first)) {
        if (packet.timestamp >= part.sourceEnd - EPS && mapStart !== null) break
        let data = packet.data
        let ts = packet.timestamp
        let frames = Math.round(packet.duration * sampleRate)
        if (adapter!.kind === 'pcm') {
          // Sample-exact: cut whole PCM frames (blockAlign = bytes per frame) at both ends.
          const blockAlign = data.byteLength / frames
          const head = Math.max(0, Math.round((part.sourceStart - ts) * sampleRate))
          const tail = Math.max(0, Math.round((ts + packet.duration - part.sourceEnd) * sampleRate))
          if (head + tail >= frames) continue
          data = data.subarray(head * blockAlign, (frames - tail) * blockAlign)
          ts += head / sampleRate
          frames -= head + tail
        }
        mapStart ??= ts
        mapEnd = ts + frames / sampleRate
        await source.add(
          packet.clone({ data, timestamp: outSamples / sampleRate, duration: frames / sampleRate, sequenceNumber: outIndex++ }),
          outIndex === 1 ? { decoderConfig: config! } : undefined,
        )
        outSamples += frames
        report('writing', ++packetsDone, totalPackets, packetsDone === 1)
      }
      plan.input.dispose()
      if (mapStart === null) throw new CompileError('UnsupportedMediaError', `Asset ${part.assetId}: no packets in ${part.sourceStart}-${part.sourceEnd} s`)
      // The container hides `containerTrim` samples, so the visible session starts that much later in the source.
      const hidden = Math.max(0, -partStartSamples) / sampleRate
      sourceMap.push({ assetId: part.assetId, sourceStart: mapStart + hidden, sourceEnd: mapEnd, sessionStart: Math.max(0, partStartSamples / sampleRate) })
      trims.push({
        assetId: part.assetId,
        leading: Math.max(0, part.sourceStart - (mapStart + hidden)),
        trailing: mapEnd - part.sourceEnd,
        prerollPackets: plan.preroll,
        containerTrim: containerTrim / sampleRate,
      })
    }
    // finalizing: headers (MP3 Xing/LAME, MP4 moov + edit list, WAV sizes) are rewritten at their positions.
    report('finalizing', packetsDone, totalPackets, true)
    source.close()
    await output.finalize()
    release = null

    const writtenMediaDuration = outSamples / sampleRate
    const check = new Input({ source: new BlobSource(await file.handle.getFile()), formats: ALL_FORMATS })
    let actualMediaDuration: number
    try {
      actualMediaDuration = await check.computeDuration()
    } finally {
      check.dispose()
    }
    if (Math.abs(actualMediaDuration - writtenMediaDuration) > VERIFY_TOLERANCE) {
      throw new CompileError('VerificationError', `Session file reads as ${actualMediaDuration.toFixed(3)} s, expected ${writtenMediaDuration.toFixed(3)} s`)
    }
    report('finalizing', totalPackets, totalPackets, true)
    return { outputPath: file.path, mimeType: await output.getMimeType(), sourceMap, writtenMediaDuration, actualMediaDuration, trims }
  } catch (error) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {})
    await release?.()
    for (const plan of plans) if (!plan.input.disposed) plan.input.dispose()
    await deleteSession(sessionId).catch(() => {})
    if (findCause(error, 'QuotaExceededError')) throw new CompileError('QuotaExceededError', 'Not enough storage to prepare this session')
    throw error
  }
}
