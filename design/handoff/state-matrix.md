# State coverage matrix

Every row maps to a fixture preset in **Screens.dc.html** (see screen-map.md). Focus = where focus lands when the state appears. Dialogs trap focus and return it to the trigger; Escape closes everything except the import dialog and an active send (Escape there asks to cancel).

| ID | Screen / component | Trigger | User-facing copy | Primary | Alternative | Focus | Exit |
|---|---|---|---|---|---|---|---|
| L1 | Library | First launch | Your library is empty · Add audiobook files you own… | Add book | Receive from another device | Heading | Book added or received |
| L2 | Library | Empty, running in Safari | Same + Safari note | Add book | How to install | Heading | Installed app opened |
| L3 | Library | One book | Continue card + "Books you add or receive will show up here." | Resume | Add book / Receive | Heading | Second book added |
| L4 | Library | Many books | "6 books on this device · Works offline" | Card Play / open | Search, menu | Heading | — |
| L5 | Library | Book finished | Card meta "Finished" + check | Open details | Menu | — | Listen again |
| L6 | Library | Search has no match | No books match “zebra” | Clear search | Edit query | Search field | Query changed |
| L7 | Library | Very long title | 2-line clamp on cards, full on details | — | — | — | — |
| L8 | Library | Audio file missing | Cover dimmed, "Audio file missing", no Play | More › Re-import audio | Delete book | — | Re-import succeeds |
| L9 | Library | New book arrived | "New" badge pops; toast "Book added. Ready to listen offline." | Open book | — | Unchanged | Next visit |
| I1 | Add | No files yet | "Choose audio files" + formats | Choose audio files | Drop files (desktop) | Title field | Files chosen |
| I2 | Add | Save without title | Add a title to save this book. | Fix title | — | Title field (aria-invalid) | Title entered |
| I3 | Add | One file | "One file · whole book" + 30-minute parts switch | Save book | Toggle parts | — | — |
| I4 | Add | Several files | Natural order, numbered, editable titles | Save book | Reorder, rename, remove | — | — |
| I5 | Add | Reorder | Row lifts 1.03 with placeholder; neighbours spring | Drop | Up/Down buttons | Moved row keeps focus | Pointer up |
| I6 | Add | Generated cover | Preview updates from title | Choose image | — | — | Image chosen |
| I7 | Add | Unsupported/corrupt file | "FLAC isn’t supported yet…" row tinted | Remove file | — | Error row | Removed |
| I8 | Add | Analysing | "Checking file…" per row | Wait | Remove | — | Checked |
| I9 | Import dialog | Importing | Importing {title} · phase · bytes · keep open | Wait | Cancel | Dialog (non-dismissable) | Done → details |
| I10 | Dialog | Cancel import | Stop importing? | Stop import | Keep importing | Confirm | Choice made |
| I11 | Import dialog | Quota exceeded | Not enough space · needs ~X, ~40 MB free | Open Settings | Back to the form | Primary | Choice made |
| I12 | Details | Import success | Toast + New badge | Play from the start | Edit | Heading | — |
| I13 | Dialog | Leave unsaved form | Discard this book? | Discard | Keep editing | Keep editing | Choice made |
| P1 | Player | Play with a timer | Finding your place → Preparing your listening session → Almost ready | — | Cancel | Status (aria-live) | File ready |
| P2 | Player | play() rejected after prep | Your session is ready · needs one more tap | Ready — play | — | Ready button | Tapped |
| P3 | Player | Playing | "28:14 of listening left" | Pause | −30/+15, speed, timer, chapters | — | Pause / end |
| P4 | Player | Paused | "Paused · 28:14 left" (budget frozen) | Play | — | — | Play |
| P5 | Player | First / middle / final chapter | "Chapter 1 of 14 · Arrival"; timer options adapt | — | — | — | — |
| P6 | Timer sheet | Not enough chapters | Disabled, "This is the last chapter" / "Only one chapter left after this one" | Pick another | — | First enabled option | — |
| P7 | Speed sheet | Custom speed invalid | Enter a speed between 0.5× and 3×. | Set | Preset | Input | Valid value |
| P8 | Timer sheet | Custom minutes invalid | Enter a number of minutes from 1 to 600. | Start session | Other option | Input | Valid value |
| P9 | Player | Speed/position/timer changed | Updating your session for 1.5× · listened time still counts | — | — | Status | Replacement ready |
| P10 | Player | Timed session ended | Your 30 minutes are up · 5 seconds earlier | Keep listening | Change timer | Primary | Play (rewind 5 s once) |
| P11 | Player | Chapter-end stop | Stopped after Chapter 4 | Play Chapter 5 | Change timer | Primary | Play |
| P12 | Player | Book finished | You finished the book | Listen again from the start | Back to library | Primary | Choice made |
| P13 | Player | OS interruption | Playback was interrupted · Your place is saved. | Resume | — | Primary | Resume |
| P14 | Player | Read/prep error | This book can’t play right now | Try again | Book details | Primary | Retry succeeds |
| T1 | Receive | Before camera | Use the camera to scan | Continue | Paste link | Primary | Prompt answered |
| T2 | Receive | Permission denied | Camera access is off | Paste link instead | Try the camera again | Primary | — |
| T3 | Receive | Scanning | Point your camera at the code on your computer. | — | Paste link / Cancel | Viewfinder | QR read |
| T4 | Receive | QR expired | This code has expired | Scan again | Back | Primary | New QR |
| T5 | Receive | Invalid pasted link | That doesn’t look like a Loud Books pairing link… | Connect | Cancel | Input | Valid link |
| T6 | Receive | Code shown | Type this code on your computer · 482 915 | — | Cancel | Heading | Computer confirms |
| T7 | Send | Wrong code | That code doesn’t match. 2 tries left. → Too many tries… | Pair and send | Close | Input | Correct / locked |
| T8 | Both | Connecting | Connecting… · same Wi-Fi | — | — | Status | Channel open |
| T9 | Both | Transferring | Sending/Receiving {title} · X of Y MB · File n of m | — | Cancel | Status | 100% |
| T10 | Both | Verifying | Checking the files… | — | — | Status | Hashes match |
| T11 | Both | Disconnected | Connection lost · same regular Wi-Fi · complete files kept | Pair again / Try again | Cancel | Primary | Re-paired |
| T12 | Dialog | Cancel transfer | Stop sending? / Stop receiving? | Stop | Keep | Keep | Choice made |
| T13 | Receive | Duplicate | You already have this book | Keep both | Replace / Cancel | Primary | Choice made |
| T14 | Receive | Not enough space | Not enough space · needs ~270 MB, ~180 MB free | Clear temporary files | Cancel | Primary | Space freed |
| T15 | Receive | Success | Your book is ready to listen offline | Open book | Back to library | Primary | — |
| A1 | Welcome/Settings | Not installed (iOS Safari) | Install before your first big import… | How to add to Home Screen | Open my library | — | Installed |
| A2 | Welcome/Sidebar | Precache incomplete / complete | Getting ready for offline use… / Ready for offline use | — | — | — | SW installed |
| A3 | Library | Offline (normal) | "Offline. Everything here still plays." No error styling | — | — | — | — |
| A4 | Send/Receive | Signaling unreachable | Can’t reach the pairing service · listening isn’t affected | Try again | Close / Back | Primary | Reachable |
| A5 | Settings | persisted() true / false | Protected from automatic cleanup / Standard storage | Ask to keep my books | — | — | Granted |
| A6 | Library/Settings | Update ready | An update is ready… | Restart | Later | — | Restarted |
| A7 | Library/Settings | Update while playing | Installs after you stop listening; Restart disabled | Later | — | — | Paused |
| A8 | App | Storage unavailable | Your library couldn’t be opened | Try again | Open Settings | Heading | Storage opens |
| A9 | App | Theme | System / Light / Dark via data-theme | — | — | — | — |
| A10 | App | Reduced motion | Transforms removed; 150 ms fades; spinners keep labels | — | — | — | — |
| D1 | Dialog | Delete book | Delete “{title}”? · removes book and audio ({size}) | Delete book | Cancel | Cancel | Choice made |
| D2 | Dialog | Delete playing book | + "This book is playing now. Playback will stop." | Delete book | Cancel | Cancel | Choice made |
| D3 | Dialog | Delete library | Delete your whole library? · Type delete to confirm | Delete library (after typing) | Cancel | Input | Choice made |
| D4 | Dialog | Clear temporary files | Clear temporary files? · frees about X | Clear temporary files | Cancel | Cancel | Choice made |
| D5 | Dialog | Cancel import / transfer | See I10, T12 | — | — | — | — |
| D6 | Dialog | Discard unsaved edits | Discard your changes? | Discard | Keep editing | Keep editing | Choice made |
