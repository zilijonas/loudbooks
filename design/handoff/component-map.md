# Component map

| Screen | Components |
|---|---|
| Welcome | Logo, Button, InstallGuide (sheet), OfflineReadyStatus |
| Library | PageHeader, Button, SearchField, ContinueCard, BookCard grid, EmptyState, UpdateBanner, MiniPlayer / PlayerBar, Toast |
| Add / edit | TopBar, CoverPicker + GeneratedCover, TextField, TextArea, FileDropzone, EditableChapterRow + ReorderHandle, Switch, Button, AlertDialog (discard), Dialog + StatusPanel (import) |
| Book details | BackButton, BookCover, Badge, Progress, Button, ChapterRow list, BottomSheet/Menu, AlertDialog (delete) |
| Player | BookCover, ActiveSessionBadge, SessionPreparation, Slider, TimeDisplay, PlaybackControls, StatusPanel (ended/completed/interrupted/error), SpeedSelector, TimerSheet, ChapterRow list |
| Send | SendBookDialog: BookRow, QR, PairingCode (enter), Switch (include position), TransferProgress, StatusPanel |
| Receive | ReceiveScanner, TextField (paste link), PairingCode (show), TransferProgress, StatusPanel |
| Settings | SegmentedControl (theme), StorageBar, Button, StatusRow, AlertDialog (clear, typed-confirm delete) |

`StatusPanel` (LB Status Panel.dc.html) is the shared layout for success/error/progress outcomes: tone icon, title, body, optional progress, note, up to three actions.
