# Claude Design Brief: The Complete Loud Books Design Package

## Role and Required Outcome

Act as one integrated product design team: a product designer, mobile UX specialist, brand designer, design systems architect, motion designer, and accessibility specialist.

Create the complete visual identity, design system, reusable UI component library, required pages, overlays, states, responsive layouts, lively animations, and connected interactive prototype for **Loud Books**, a personal audiobook PWA. The result must be suitable for React / TypeScript UI implementation, not merely a presentation mood board.

Provide actual assets and usable design/UI files to the extent supported by your environment. Do not deliver only a few screenshots. Do not describe a design prototype as an already implemented WebRTC transfer system or iPhone background playback engine.

The accompanying `01-Architecture-EN.md` and `02-Implementation-Plan-EN.md` define the functional decisions. This prompt defines the design assignment. Flag any contradiction before resolving it independently.

**Language requirement:** Use English throughout the entire package: questions, explanations, headings, UI copy, sample book titles, component documentation, code comments, accessibility labels, prototype content, and developer handoff. English is the default product language. Do not make another language primary or produce bilingual deliverables unless explicitly requested later. Keep UI strings externalized for future localization.

## 1. First: Ask Questions Only Where Information Is Truly Missing

Read the entire brief before committing to the final visual direction. Ask one short batch of questions about genuine uncertainties that would materially affect the outcome. Limit this to six to eight questions at a time.

Do not ask the user to explain the product, accounts, offline operation, timer behavior, sharing, platform, or whether animations are needed again: these are already specified. Make minor design decisions independently and identify them as assumptions. If there are no blocking uncertainties, begin with your proposed direction. Do not stop progress over insignificant details.

## 2. Product

**Name: Loud Books. Do not rename it.**

This is a free, open-source, personal audiobook application. Users import their own book audio files, add a title and optional description and cover, and listen entirely offline, including in airplane mode.

The primary environment is an iPhone PWA installed on the Home Screen. On desktop, the same application opens in a browser; Android is supported too. This is not a native App Store application.

There are no user accounts, login/signup, pricing tiers, premium features, advertisements, social network, public book marketplace, cloud library, or automatic synchronization. Do not add these even as visual filler.

The library is local to each device. Internet access is needed for the initial application load and convenient pairing between two devices; it is not required to listen to books already imported. Avoid an absolute “internet never needed” claim for the entire product.

Communicate ownership, simplicity, and personal listening. A possible tagline direction is **“Your books. Your pace.”** Refine the final brand copy to match the chosen identity.

## 3. Visual Direction

Create a distinctive, warm, modern, meticulously polished consumer product. It must feel **playful, lively, and visibly springy**, not like a formal dashboard or a bland productivity tool.

Use an original editorial-meets-tactile direction: clear typography, large comfortable controls, attractive book covers, deliberately rounded forms, warm neutral surfaces, and expressive accents. You may explore coral, violet, mint, yellow, and cream, without using all of them at once. Build colors into a coherent system with verified text and control contrast.

Avoid generic purple SaaS gradients, arbitrary glassmorphism, overloaded statistics panels, and direct Audible or Spotify imitation. Friendly does not mean childish. The word “Loud” does not require an aggressive or dazzling interface.

Present two concise brand directions if useful, but develop the complete product in one coherent direction. Do not stop at mood boards.

## 4. Complete Brand Identity

Create an original logo combining the idea of books/pages with sound/listening. Do not settle for a stock headphones icon.

Required variants: horizontal wordmark, compact lockup, standalone symbol, versions for light and dark backgrounds, monochrome version, favicon, and app icon. Provide SVG artwork, clear-space rules, minimum sizes, and examples of incorrect use.

Plan PWA icons at 192×192 and 512×512, a separate maskable version with the appropriate safe area, and a 180×180 Apple touch icon. Check the symbol at 16–32 px and inside an iOS rounded app-icon container.

Create four to six original fictional audiobook covers, including at least one long English title to test wrapping. Include a generated typographic-cover system for books without uploaded artwork. Do not make real authors' book covers a required product asset.

## 5. Design System

Define primitive and semantic tokens for brand, background, surface, text, muted text, border, focus, action, success, warning, danger, and disabled states. Provide complete Light and Dark themes plus a System preference.

Define typography, font sizes/weights/line heights, numeral styling for time displays, spacing scale, grid, responsive containers, radii, shadows, layering, icon sizes, and interactive target sizes. Fonts must work with the required English content and be suitable for bundling locally in the offline build, without a runtime font CDN.

Provide `tokens.css`, structured `tokens.json`, and their mapping into a Tailwind CSS theme. Components must use semantic tokens, not unrelated hardcoded colors on each page.

Specify responsive behavior for at least a 320 px small screen, the primary 390×844 px phone viewport, a 430 px large phone, a 768 px tablet, and a 1440 px desktop. Desktop needs a deliberate desktop layout, not a stretched phone screen.

## 6. Motion Direction — Expressive Spring and Bounce

Motion is an important part of the product identity. Do not reduce the result to a handful of faint opacity transitions.

Use noticeable but controlled physics-based transitions: springs, bounce, overshoot, hints of squash-and-stretch, tactile press/release feedback, hover lift, and smooth shared-element transitions. The default experience must feel lively.

Design these specific interactions:

- A book card rises and scales up slightly on hover, with an optional subtle tilt; pressing compresses it before an elastic release.
- The primary Play button has a clear press/release response and a smooth Play/Pause icon transition.
- Cover artwork can transition from a library card into the details/player view; the mini-player expands into the full player.
- Bottom sheets enter with brief overshoot and settle naturally; dismissal gestures must not interfere with scrolling.
- Speed and timer selections use a moving selection background or pill with a brief spring confirmation.
- Chapter reordering uses lift, a clear placeholder, and spring-driven layout changes.
- A newly received book enters the library with a brief success animation.
- Empty-library artwork may move briefly without running a continuously expensive effect.

Create centralized motion presets: `press`, `hoverLift`, `springSoft`, `springPlayful`, `sheet`, `sharedCover`, `success`, and `reducedMotion`. Specify displacement, duration or spring stiffness/damping/mass, trigger, and interruption behavior. Supply values usable with Motion for React rather than only describing an interaction as “smooth.”

Starting points you may refine aesthetically: press scale around 0.94–0.97; hover scale around 1.02–1.04 with a 3–6 px lift; spring-driven UI movements around 250–500 ms. Do not disable a button until its animation finishes. Do not create endlessly bouncing text or misleading fake waveforms.

Apply hover behavior only to devices that actually support hover; mobile needs equivalent tap feedback. Every feature requires a reduced-motion path without substantial displacement, bounce, or parallax. Reduced motion must not remove functionality or explanations of loading states.

## 7. Information Architecture

Primary navigation: Welcome, Library, Add/Edit Book, Book Details, Player, Receive, and Settings/Storage/About.

Timer, speed, chapters, share/send, delete, and other contextual actions should primarily use bottom sheets or dialogs rather than unnecessary full pages. Do not invent five empty mobile tabs just to fill a navigation bar. Show the mini-player only when a book is active, and never let it cover primary actions.

Returning users land in the library, not on a landing page every time. Welcome is a brief introduction, not a registration-style onboarding barrier.

## 8. Screens

### Welcome and Installation

Explain the value: personal files, a local library, and offline listening. Provide a clear call to action to open the library. iPhone installation guidance must reflect the Add to Home Screen action rather than an invented universal Install dialog.

Before a first large phone import or transfer, gently recommend installing the PWA and opening it from its icon: its library is separate from Safari's. Show a “Ready for offline use” state when the application is actually prepared.

### Library

Design first-run empty, single-book, multiple-book, completed-book, and no-search-results views. Each book card contains artwork, title, listening progress, a Play/Resume action, and a contextual menu. Add Book and Receive Book must be easy to find.

Show useful information only: no ratings, recommendations, followers, or subscription badges. Offline status should be calm; do not display a persistent red “No internet” error when normal listening works.

### Add / Edit Book

Title is required; description and cover are optional. The audio file picker accepts one or multiple files, with desktop drag-and-drop. Multiple files create automatically numbered, renameable, reorderable chapters. Show filename, duration/size when known, and Remove.

A single file represents one complete book. An optional control can show generated 30-minute parts; do not describe these as the author's chapters. Internal storage segmentation must not appear as an arbitrary list of technical files in the UI.

Include validation, analysis, import progress, cancellation, insufficient storage, unsupported format, and success states. Processing happens on the device, so use copy such as “Importing” or “Preparing,” not “Uploading to cloud.”

### Book Details

Include a large cover, title, description, total duration, progress, Play/Resume, chapter list, current-chapter indicator, Edit, Send, Export Backup, and Delete. A single-file book must not look broken because its chapter list is short.

### Full Player

This is the most important screen: large artwork, book and chapter titles, position slider, elapsed and remaining time, unmistakable Play/Pause, −30 seconds and +15 seconds, speed, timer, and chapters. Chapter navigation can live in the chapter list rather than overloading the main screen with every possible button.

Make controls comfortable to use one-handed. Clearly distinguish chapter/book content time from remaining listening-session time. Support long titles, larger text settings, and iPhone safe areas without overflow.

States: playing, paused, preparing session, ready to play, rebuilding after changes, session ended, book completed, interrupted, and error. “Ready — play” must be a real, prominent button when the browser requires another user gesture.

### Playback Speed

Provide 0.75×, 1×, 1.25×, 1.5×, and custom. Validate custom input; the initial designed range is 0.5–3×. Make the selected speed unmistakable. Changing speed during an active timed session can require brief preparation of a replacement excerpt: design that state.

### Sleep Timer

Options: 5 minutes, 15 minutes, 30 minutes, custom duration, end of this chapter, end of the next chapter, end of the chapter after next, and turn off timer. Disable options that require more remaining chapters than the book contains, with a short explanation.

A concise summary should explain the outcome: “Listen for about 30 minutes” or “Stop after Chapter 4.” Once selected, the player clearly shows the active mode and a way to change or cancel it.

Technical behavior: before playback, the app creates one temporary audio file from the necessary portions of the source chapters; that file ends naturally. There is no volume fade-out feature. Do not design a volume-fade preference.

At 1.5×, approximately 45 minutes of source content is prepared for 30 minutes of listening. Pausing does not consume listening time. Changing speed or position within the open app can recalculate and rebuild the session. Do not promise an uninterrupted exact wall-clock timer independent of every possible OS-level seek action.

After a confirmed duration-based stop, the next Play starts five seconds earlier in the original book. After a chapter-end stop, resume at the beginning of the next chapter. After a manual pause, resume from the same position. Reaching the book's end marks it completed.

### Sharing / Send / Receive

This is a complete V1 feature, not a distant future concept.

The sender selects a book and Send on the computer, then sees a QR code. The receiver opens the already installed Loud Books PWA on the phone, selects Receive, and scans the QR inside the application. The phone displays a short confirmation code to enter on the computer. After pairing, the book transfers and automatically appears in the phone's library.

The primary flow must not require iPhone Files, saving to Downloads, or a second manual import. Do not depict Bluetooth or an automatic radar discovering every nearby device. The QR contains pairing information, not the book itself.

Design both devices' views: QR/waiting, camera permission, scanner, invalid/expired QR, confirmation code, connecting, transferring, verifying, success, canceled, disconnected/retry, storage full, and duplicate book. If the camera is unavailable, provide an option to paste the full pairing link inside the PWA.

During transfer, show book title, byte/percentage progress, file count, Cancel, and a short instruction to keep both screens open. Do not promise a background 500 MB transfer on a locked iPhone. When a peer connection fails, clearly suggest using the same regular Wi-Fi network and retrying, not creating an account.

On completion, show “Your book is ready to listen offline” and “Open book.” Temporary playback-session files must not appear in book-transfer UI.

### Settings / Storage / About

Include System/Light/Dark appearance, storage usage, local-storage status, clearing temporary files only, backup export/import, installation/offline states, product information, an open-source link, and a privacy explanation.

English is the V1 language. Do not add a language selector containing invented or unimplemented languages. Keep the component structure ready for future localization.

Storage categories: books, temporary sessions/cache, and application data. Distinguish “Clear temporary files” from the destructive “Delete library.” Do not describe persistence as “100% protected forever.”

Optional `.loudbook.zip` export/import is a secondary path. It does not replace the simple WebRTC transfer in the primary experience.

## 9. UI Component Library

Create genuinely reusable components with consistent APIs and variants: Button, IconButton, TextField, TextArea, FileDropzone, CoverPicker, Slider, Progress, SegmentedControl, Switch, Select, Tabs where useful, Tooltip, Badge, Menu, Dialog, AlertDialog, BottomSheet, Toast, Skeleton, EmptyState, and ErrorState.

Audiobook-specific components: BookCover, GeneratedCover, BookCard, BookRow, ChapterRow, ReorderHandle, PlaybackControls, SeekButtons, TimeDisplay, MiniPlayer, FullPlayer, SpeedSelector, TimerSheet, ActiveSessionBadge, SessionPreparation, StorageBar, SendBookDialog, ReceiveScanner, PairingCode, and TransferProgress.

Provide meaningful default, hover, focus-visible, pressed, selected, disabled, loading, error, and success variants. Do not add semantically inappropriate variants simply to make the list longer.

Provide a component gallery showing states and mobile/desktop adaptations. Where supported by the environment, provide React/TypeScript prototype components, Storybook-style stories, or an equivalent interactive catalog.

## 10. State Coverage Matrix

Create a document that records, for each state: screen/component, trigger, user-facing copy, primary action, alternative action, focus behavior, and exit condition.

Required groups:

**Library:** first launch, empty, single book, populated, completed, no search results, very long titles, and missing local file.

**Import:** no files, missing title, one file, multiple files, reorder, generated cover, corrupt/unsupported file, analysis, progress, cancellation, quota error, success, and leaving an unsaved form.

**Listening:** preparing, ready, gesture required, playing, paused, first/middle/final chapter, timer enabled/disabled, insufficient chapters for a selection, custom-input validation, rebuilding, timed end, chapter end, completed, interrupted, and playback error.

**Transfer:** camera permission request, permission denied, QR waiting/scanning/expired, wrong code, connecting, sending/receiving, verifying, disconnection/retry, cancellation, duplicate, insufficient storage, and success.

**Application:** installed/not installed, offline-ready, normal offline operation, signaling unavailable, persistent storage granted/not granted, update ready, update postponed due to active work, local data unavailable, dark/light, and reduced motion.

**Dialogs:** delete book, delete currently playing book, delete library, clear temporary cache, cancel import/transfer, and discard unsaved edits.

## 11. Accessibility and Quality

Provide WCAG AA contrast; 44–48 px touch targets; keyboard navigation; visible focus; semantic controls; screen-reader labels; dialog focus trapping and focus return; alternative reorder buttons; and status indicators that do not rely on color alone.

Respect iOS safe areas, the onscreen keyboard, and scrolling behavior. Do not allow the mini-player to obscure a form's Save button. Avoid application-wide scroll locking caused by an incorrectly managed dialog.

Use English copy throughout the primary prototype and deliver English UI strings for implementation. Avoid technical jargon in user-facing text: use “Preparing your listening session,” not “Muxing encoded packets.”

## 12. Interactive Scenarios

Connect the prototype to demonstrate the complete flow: empty library → Add → select multiple files → reorder → Save → details → prepare 30 minutes → Play → change speed → show rebuild → Pause → session end → Resume with five-second rewind. Use scenario controls to advance between states without implying that a paused session's timer keeps running.

Second scenario: chapter timer → stop at chapter boundary → Resume at next chapter. Third: desktop Send → phone Receive/QR → confirmation code → transfer → verification → book in phone library → offline player. Fourth: edit, delete, clear temporary cache, change theme, and at least one realistic error/recovery flow.

Use explicit fixture states and scenario controls so reviewers can switch states without waiting 30 minutes. Identify simulated native/network actions in the handoff documentation. Do not provide unexplained dead buttons, false completion screens, or claims that a real offline iPhone test has already been performed.

## 13. Final Handoff Package

Provide one coherent structure:

```text
brand/
  Logo SVGs, app icons, palette, brand guidelines, and cover system

design-system/
  tokens.json, tokens.css, typography, spacing, responsive rules,
  accessibility guidelines, and motion specifications

components/
  Component inventory, variant gallery, proposed React/TypeScript APIs,
  available prototype code, and state examples

screens/
  All primary pages, overlays, and meaningful error states,
  with mobile/desktop and light/dark variants

prototype/
  Connected interactive prototype or working export,
  to the extent supported by the environment

handoff/
  README, screen map, component map, state matrix, motion specifications,
  English UI copy, component-to-domain-state mapping,
  implementation notes, and remaining open questions
```

If a requested format cannot actually be exported, state that clearly and provide the closest usable alternative. Do not merely claim that files exist when they do not.

## 14. Work Sequence and Acceptance Criteria

Start with necessary questions and assumptions only. Then establish the brand direction and core tokens, followed by the component system, screens, and states. Finish with the connected prototype, detailed spring/bounce motion, and developer handoff.

The project is not complete after a landing page or three attractive screens. Cover the whole product described here, particularly session preparation, a genuinely local offline library, and the two-device transfer experience.

The final impression should be a distinctive, highly polished, easy-to-control audiobook app with satisfying elastic interactions. Visible, lively motion is required, but it supports listening rather than distracting from it.
