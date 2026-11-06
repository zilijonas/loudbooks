import { ALL_FORMATS, BlobSource, Input, MP3, MP4, WAVE } from "mediabunny";

export type ImportErrorCode = "form.unsupported" | "form.mismatch" | "form.titleError" | "form.filesNone" | "importing.quotaTitle" | "importing.stopped";
export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode, options?: ErrorOptions) { super(code, options); }
}
export async function probe(file: File) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const format = await input.getFormat();
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new ImportError("form.unsupported");
    const [codec, parameter, channels, sampleRate, duration] = await Promise.all([
      track.getCodec(), track.getCodecParameterString(), track.getNumberOfChannels(), track.getSampleRate(), track.computeDuration(),
    ]);
    if (!codec || !Number.isFinite(duration) || duration <= 0 || !channels || !sampleRate ||
      !((format === MP3 && codec === "mp3") || (format === MP4 && codec === "aac" && parameter === "mp4a.40.2") || (format === WAVE && codec.startsWith("pcm-")))) {
      throw new ImportError("form.unsupported");
    }
    return { container: format.name, codec, channels, sampleRate, duration };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("form.unsupported", { cause: error });
  } finally { input.dispose(); }
}
export function naturalSort(files: File[]) {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}
