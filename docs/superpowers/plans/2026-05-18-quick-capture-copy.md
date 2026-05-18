# Quick Capture Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toolbar quick-capture input that copies entered text to the clipboard when closed.

**Architecture:** Keep saved command entry unchanged. Add a separate modal for transient text capture and route close events through `App.vue`, where the existing clipboard API and notification toast already live.

**Tech Stack:** Vue 3, TypeScript, Electron preload clipboard IPC, Vitest.

---

### Task 1: Testable Quick Capture Normalization

**Files:**
- Create: `src/utils/quickCapture.ts`
- Create: `tests/quick-capture.test.ts`

- [ ] Add tests for trimming entered text and ignoring whitespace-only input.
- [ ] Run the focused test and confirm it fails because the utility does not exist.
- [ ] Implement `getQuickCaptureClipboardText(input: string): string | null`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Quick Capture Modal

**Files:**
- Create: `src/components/QuickCaptureModal.vue`

- [ ] Add a modal with a large focused textarea.
- [ ] Emit `close` with the current text when the overlay, close button, or Copy button is used.
- [ ] Keep the component local and stateless outside its transient text value.

### Task 3: App Integration

**Files:**
- Modify: `src/App.vue`

- [ ] Import the modal, helper, and a lucide icon.
- [ ] Add `showQuickCaptureModal` state and `handleQuickCaptureClose`.
- [ ] Write non-empty normalized text to `window.electronAPI.clipboard.writeText`.
- [ ] Add the new button after the Add Command button.
- [ ] Include the modal in Escape handling and hotkey blocking.

### Task 4: Verification

**Files:**
- No additional file changes expected.

- [ ] Run `pnpm exec vitest run tests/quick-capture.test.ts`.
- [ ] Run `pnpm exec vue-tsc --noEmit`.
- [ ] Review `git diff --check`.
