# Screen map

Routes use `createHashRouter`. Overlays are not routes, so Back closes them.

| Route | Screen | Opens | Fixture presets |
|---|---|---|---|
| `#/welcome` | Welcome & install | Install sheet, Library | welcome, welcome-installed, sheet-install |
| `#/` | Library | Details, Add, Receive, Settings, Book actions, Player | library-empty, library-empty-safari, library-one, library-many, library-playing, library-offline, library-no-results, library-missing, library-new, library-update, data-unavailable |
| `#/add`, `#/book/:id/edit` | Add / edit book | Discard dialog, Import dialog (progress, quota) | add-empty, add-multi, add-reorder, add-single, add-errors, add-importing, add-quota, add-discard, edit |
| `#/book/:id` | Book details | Player, Edit, Send, Book actions, Delete | details, details-long, details-single, details-completed, details-new, sheet-menu, dialog-delete, dialog-delete-playing |
| `#/player` | Full player | Speed, Sleep timer, Chapters | player-*, sheet-speed*, sheet-timer*, sheet-chapters |
| `#/receive` | Receive (phone) | Cancel dialog, Install sheet | receive-* |
| overlay on details | Send (computer) | Cancel dialog | send-* |
| `#/settings` | Settings / storage / about | Clear temporary files, Delete library, Install | settings, settings-standard, settings-update, dialog-clear, dialog-delete-library |

Returning users with a library open `#/`. Welcome shows until "Open my library" is pressed once (flag in Settings).

Desktop (≥ 768 px): left sidebar (Add book, Library, Receive, Settings, offline status) and a persistent player bar when a book is active. Sheets become centred dialogs (max 520 px). Phone: no tab bar; Settings is an icon in the Library header; Add/Receive are buttons under the title.
