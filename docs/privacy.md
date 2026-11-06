# Privacy

Short version: your books never leave your devices except when you copy them from one of your own devices to another, and then they go directly between the two.

## What Loud Books does not have

- No accounts or sign-in.
- No analytics, tracking, advertising or crash reporting.
- No server that stores books, covers, titles, progress or settings.
- No third-party scripts, fonts or images loaded at runtime. Everything the app needs is served from the app's own address and cached for offline use.

## Where your data lives

In the browser storage of the app's origin (`https://zilijonas.github.io`), on the device you use:

- audio files, covers and prepared listening sessions in the origin private file system (OPFS)
- titles, chapters, progress and settings in IndexedDB
- the app's own files in Cache Storage

Clearing site data in the browser, or removing the Home Screen app, removes all of it. Safari and the installed Home Screen app each have their own copy. Other project sites under the same `github.io` account share the origin, so Loud Books namespaces its database and file paths and expects nothing untrusted to be hosted there.

Opening the app is an ordinary page load from GitHub Pages. GitHub sees the usual request details (IP address, user agent) as any web host does, under its own privacy policy. After the first load the app starts from its offline cache.

Backups (`.loudbook.zip`) are plain files you save wherever you choose. They are not encrypted.

## Moving a book between devices

Pairing uses a small Cloudflare Worker at `https://loudbooks-signaling.lijonas-it.workers.dev`. Its job is to let two devices find each other. It never receives book data.

What the Worker sees and keeps for a pairing, which lasts at most five minutes:

- A random room ID, which appears in the connection address.
- SHA-256 hashes of two one-time tokens (sender and receiver). A token's hash is deleted from the room the moment that token is used. The tokens themselves are never stored.
- The 6-digit confirmation code until the room ends, the number of wrong attempts (three closes the room), whether the pairing was approved, and the expiry time.
- The connection setup messages (SDP and ICE candidates) from one device to the other. These are passed along while both are connected and are not written to storage. They do contain network addresses of the devices, which is how WebRTC works.

The room, its stored state and its sockets are deleted when time runs out, when either side closes or rejects, or after three wrong codes.

Tokens are never in a URL path or query. The QR code and pairing link carry the receiver token in the URL fragment (after `#`), which browsers do not send to servers. Each device sends its token in its first WebSocket message, and the Worker compares its hash. The Worker code does not log tokens or message contents. Cloudflare Workers observability (request logs and traces) is turned on for the Worker, so Cloudflare records request-level data such as the room-ID path, status and timing, and as the host it can see connecting IP addresses like any web host. Tokens and message bodies are not in the request paths.

The Worker accepts only requests from the app's own origin (plus localhost for development), caps messages at 16 KiB, limits each connection to 60 messages per 10 seconds, and allows two connections per room.

### STUN

To find out how to reach each other, the devices ask Cloudflare's public STUN server (`stun.cloudflare.com:3478`) for their public address. STUN sees each device's IP address and port and nothing else. It does not carry any book data. There is no TURN relay, so if a direct connection can't be made (some guest and office networks), the transfer fails instead of routing through a server.

### The transfer itself

Book metadata and audio travel over an encrypted WebRTC data channel directly from device to device. The receiver checks every file's size and SHA-256 before the book is added to its library. See [transfer-protocol.md](transfer-protocol.md).

## Camera

The camera is requested only on the Receive screen, to read the pairing QR code. Frames are processed on the device, never recorded or sent anywhere, and the camera is switched off as soon as a code is found or you close the scanner. The microphone is never requested. If you deny the camera you can paste the pairing link instead.

## Deleting your data

Delete a book or the whole library in the app. That removes its audio, covers, sessions and metadata from the device. To remove everything including app files, clear the site's data in your browser or remove the Home Screen app. There is nothing on a server to delete.
