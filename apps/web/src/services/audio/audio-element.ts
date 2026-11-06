// The one HTMLAudioElement of the app (spec 01 §9). Created once per page, outside React, and attached to <body>
// so route changes never unmount it. Never recreated; loop stays off so a file end is a real stop.
let element: HTMLAudioElement | null = null

export function audioElement(): HTMLAudioElement {
  if (element) return element
  element = document.createElement('audio')
  element.loop = false
  element.preload = 'auto'
  element.setAttribute('playsinline', '')
  element.hidden = true
  document.body.append(element)
  return element
}

/** Resolves once the attached source has metadata (duration known, seekable). */
export function whenLoaded(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = () => { audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', fail) }
    const ok = () => { done(); resolve() }
    const fail = () => { done(); reject(new Error(`Audio could not be loaded (${audio.error?.code ?? 'unknown'})`)) }
    audio.addEventListener('loadedmetadata', ok)
    audio.addEventListener('error', fail)
  })
}
