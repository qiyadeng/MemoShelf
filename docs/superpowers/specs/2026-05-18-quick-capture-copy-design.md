# Quick Capture Copy Design

Status: Approved for implementation
Date: 2026-05-18

## Context

SnipForge already has an Add Command button that opens `CommandModal.vue` and saves a command into the configured writable library. The requested new button should sit beside that existing add button, open a command-like input area, and support paste or speech-to-text capture without creating a saved command.

## Product Behavior

Add a second toolbar button after the existing Add Command button. The button opens a focused quick-capture modal with one large text field.

When the quick-capture modal closes by pressing Escape, clicking the overlay, clicking the close button, clicking the done button, or when the app window is hidden/loses the current palette session, SnipForge copies the trimmed text content to the system clipboard if it is non-empty. Empty or whitespace-only content closes without changing the clipboard.

The feature does not create, update, or index commands. It does not ask for title, tags, description, language, or variable substitution. It uses the existing clipboard IPC bridge and notification toast.

## Affected Areas

- `src/App.vue`: toolbar button, modal state, copy-on-close handler, Escape handling, modal mount.
- `src/components/QuickCaptureModal.vue`: focused text input modal that emits captured text on close.
- `src/utils/quickCapture.ts`: small normalization helper for testable clipboard text extraction.
- `tests/quick-capture.test.ts`: unit tests for clipboard text normalization.

## Error Handling

Clipboard write failures should be logged and shown through the existing notification toast. Closing empty content should be silent.

## Verification

- Unit test the quick-capture text normalization.
- Run TypeScript checking.
- Run the focused unit test.
- Optionally run the full Vitest suite if the focused checks are clean.
