# Loud Books transfer protocol v1

The Worker coordinates pairing only. Book metadata and bytes travel over an encrypted, reliable, ordered WebRTC DataChannel, never through the signaling service. Tokens belong in the pairing URL fragment, not query strings, referrers or logs. A room lasts five minutes and tokens are single-use, role-specific 256-bit random values. Room storage contains only token hashes. Pairing needs an allowed Origin, a valid token and the six-digit confirmation; the code alone is not authorization.

```text
Sender                       Worker / PairRoom                    Receiver
  | POST /rooms                     |                                |
  |<-- roomId, tokens, expiresAt ---|                                |
  | display QR containing receiver token in fragment -------------->|
  |--- WS /rooms/{roomId}/ws ------>|<----- WS /rooms/{roomId}/ws ---|
  |--- auth(sender, token) -------->|<---- auth(receiver, token) ----|
  |<-- authenticated ---------------|----- authenticated, code ----->|
  |        user enters receiver code |                                |
  |--- approve(code) -------------->|----- approved ---------------->|
  |<-- approved --------------------|                                |
  |--- offer ---------------------->|----- offer ------------------->|
  |<-- answer ----------------------|<---- answer -------------------|
  |<----------------- ICE candidates both directions -------------->|
  |=================== ordered DataChannel =========================>|
  |--- manifest ---------------------------------------------------->|
  |<---------------------------------------------------------- credit |
  |--- binary chunks ----------------------------------------------->|
  |<------------------------------------------ ACK after disk write --|
  |--- done -------------------------------------------------------->|
  |--- close ---------------------->|----- close ------------------->|
```

HTTP `GET /health` returns `{ok:true}`. `POST /rooms` returns `{roomId,senderToken,receiverToken,expiresAt}` (Unix milliseconds). Allowed origins are configured in `ALLOWED_ORIGINS`. Connect with WebSocket upgrade to `/rooms/:id/ws`; first JSON message must be `{type:"auth",role:"sender"|"receiver",token}` within five seconds. Authentication consumes the role token; a new pairing is required after disconnection. The receiver gets `{type:"confirmation-code",code}`; only sender can submit `{type:"approve",code}`. Three wrong attempts close the room. Both receive `{type:"approved"}` on success. `join`, `reject`, `close` may precede approval; `offer`, `answer`, `ice-candidate` require approval. Offer originates from sender and answer from receiver. Schemas in `@loudbooks/contracts` define exact fields. Messages are limited to 16 KiB UTF-8 and 60 per socket per 10 seconds. Invalid messages or unauthorized actions close the socket. TTL applies to every operation; alarm closes sockets and removes room data. At most two sockets, including unauthenticated sockets, may connect.

## DataChannel

JSON control messages use `transferMessageSchema`. The manifest specifies version 1, book metadata, ordered chapters, files (ID, name, byte size, SHA-256 hex and MIME), and optional one-time listening position. Never treat received names as paths; create local staging paths. Check unique file IDs, references, size and digest before import. Include position only when explicitly selected.

Binary chunk header is 14 bytes, network byte order: unsigned 16-bit file index into manifest `files`, unsigned 64-bit byte offset, unsigned 32-bit payload length. Payload follows immediately. Validate header with `chunkHeaderSchema`, file index, safe integer offset, exact frame length and `offset + length <= file.size` before writing. Target 16 KiB frames including header, also bounded by negotiated `pc.sctp.maxMessageSize`; sender must not send beyond granted receiver credit. Receiver grants credit or ACKs only after successful writes. Bound sender bufferedAmount and receiver write queue independently.

On interruption, a new pairing may send `resume` with manifest SHA-256 digest, verified file IDs and validated offsets. Compare digest and local checkpoints before resuming. Initial implementation may restart an unfinished file while retaining completed verified files; byte-level resume requires separate testing. `cancel`, `done` and `error` terminate or describe transfer; verify every final size and SHA-256 before committing through ImportCoordinator. Keep partial data in staging until verified, never silently commit incomplete files.
