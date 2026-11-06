// Loud Books — proposed component APIs. Props take translated strings.
import type { ReactNode } from "react";
export type Tone = "neutral" | "action" | "success" | "warning" | "danger";
export interface Action { label: string; onClick: () => void; danger?: boolean; }
export interface ButtonProps { variant?: "primary" | "secondary" | "strong" | "ghost" | "danger" | "danger-outline"; size?: "md" | "lg"; icon?: ReactNode; loading?: boolean; disabled?: boolean; fullWidth?: boolean; type?: "button" | "submit"; onClick?: () => void; children: ReactNode; }
export interface IconButtonProps { label: string; icon: ReactNode; size?: 44 | 48; variant?: "ghost" | "filled"; onClick?: () => void; tooltip?: boolean; }
export interface TextFieldProps { label: string; value: string; onChange: (v: string) => void; hint?: string; error?: string; required?: boolean; inputMode?: "text" | "decimal" | "numeric" | "url"; placeholder?: string; disabled?: boolean; }
export interface FileDropzoneProps { accept: string[]; multiple?: boolean; onFiles: (files: File[]) => void; label: string; }
export interface CoverPickerProps { title: string; image?: Blob | null; onChange: (img: Blob | null) => void; }
export interface SegmentedControlProps<T extends string> { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; }
export interface SwitchProps { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; }
export interface SliderProps { label: string; value: number; max: number; valueText: string; onScrub: (v: number) => void; onCommit: (v: number) => void; }
export interface ProgressProps { value?: number; label: string; }
export interface BadgeProps { tone: Tone; icon?: ReactNode; children: ReactNode; }
export interface DialogProps { open: boolean; onOpenChange: (o: boolean) => void; title: string; dismissible?: boolean; children: ReactNode; }
export interface AlertDialogProps { open: boolean; title: string; body: string; confirmLabel: string; cancelLabel: string; danger?: boolean; typedConfirm?: string; onConfirm: () => void; onCancel: () => void; }
export interface BottomSheetProps extends DialogProps { dragToDismiss?: boolean; } // renders a centred Dialog at >= 768px
export interface StatusPanelProps { tone?: Tone; icon: ReactNode; title: string; body?: string; progress?: { value: number; label: string; sub: string }; indeterminate?: boolean; note?: string; primary?: Action; secondary?: Action; tertiary?: Action; align?: "center" | "start"; }
export interface BookSummary { id: string; title: string; durationSec: number; positionSec: number; status: "ready" | "completed" | "missing"; cover?: { kind: "image"; url: string } | { kind: "generated" }; chapterCount: number; singleFile: boolean; }
export interface BookCoverProps { book: Pick<BookSummary, "id" | "title" | "cover">; size?: "xs" | "sm" | "md" | "lg" | "fluid"; layoutId?: string; }
export interface BookCardProps { book: BookSummary; isActive: boolean; isPlaying: boolean; isNew?: boolean; onOpen: () => void; onPlay: () => void; onMenu: () => void; }
export interface ChapterRowProps { index: number; title: string; durationSec: number; status: "upcoming" | "current" | "done"; playing?: boolean; positionInChapterSec?: number; onPlay: () => void; }
export interface EditableChapterRowProps { index: number; title: string; filename: string; durationSec?: number; bytes?: number; status: "checking" | "ok" | "error"; error?: string; onRename: (t: string) => void; onMoveUp?: () => void; onMoveDown?: () => void; onRemove: () => void; }
export type PlayerStatus = "idle" | "preparing" | "ready" | "playing" | "paused" | "rebuilding" | "endedTimer" | "endedChapter" | "completed" | "interrupted" | "error";
export type TimerSetting = { mode: "off" } | { mode: "minutes"; minutes: number } | { mode: "chapters"; count: 1 | 2 | 3 };
export interface PlaybackControlsProps { status: PlayerStatus; onToggle: () => void; onBack: () => void; onForward: () => void; }
export interface TimeDisplayProps { seconds: number; kind: "elapsed" | "remaining" | "session" | "bookLeft"; }
export interface ActiveSessionBadgeProps { timer: TimerSetting; listeningLeftSec?: number; stopChapterLabel?: string; paused: boolean; onPress: () => void; }
export interface SessionPreparationProps { phase: "analyzing" | "reading" | "writing" | "finalizing"; reason?: "start" | "speed" | "position" | "timer"; summary: string; onCancel?: () => void; }
export interface SpeedSelectorProps { value: number; presets: number[]; min: 0.5; max: 3; onChange: (v: number) => void; rebuildNotice?: boolean; }
export interface TimerSheetProps { value: TimerSetting; chaptersRemaining: number; speed: number; currentChapterLeftSec: number; onApply: (t: TimerSetting) => void; }
export interface MiniPlayerProps { book: BookSummary; status: PlayerStatus; subtitle: string; onOpen: () => void; onToggle: () => void; }
export interface FullPlayerProps { book: BookSummary; chapterIndex: number; status: PlayerStatus; speed: number; timer: TimerSetting; }
export interface StorageBarProps { segments: { label: string; bytes: number; tokenColor: string; description: string }[]; availableEstimateBytes?: number; }
export type SendStep = "qr" | "code" | "connecting" | "sending" | "verifying" | "done" | "failed" | "signalingUnavailable";
export interface SendBookDialogProps { book: BookSummary; step: SendStep; qrPayload: string; expiresInSec: number; triesLeft: number; includePosition: boolean; onIncludePositionChange: (v: boolean) => void; onSubmitCode: (code: string) => void; onCancel: () => void; progress?: TransferProgressProps; }
export interface ReceiveScannerProps { onResult: (pairingUrl: string) => void; onPasteInstead: () => void; onCancel: () => void; }
export interface PairingCodeProps { digits: string; role: "show" | "enter"; error?: string; onChange?: (v: string) => void; }
export interface TransferProgressProps { title: string; bytesDone: number; bytesTotal: number; fileIndex: number; fileCount: number; direction: "send" | "receive"; onCancel: () => void; }
