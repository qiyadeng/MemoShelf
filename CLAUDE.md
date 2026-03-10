# CLAUDE.md

This file is the behavioral guide and knowledge map for Claude Code working on this project. Keep it lean — point to docs, don't duplicate them. Update it when how we work changes, not by appending but by editing.

## What This Is

SnipForge is a desktop app (Electron + Vue 3 + TypeScript) for saving, searching, and managing command snippets. Global hotkey opens a palette, you search, you copy. The user is an engineer/human/ai_agent who needs commands/snippets fast — every UX decision serves that.

## How We Work

**We are co-developers.** Challenge bad ideas, propose better approaches, make architectural decisions together. No hand-holding, no unnecessary explanations — but when we're in new territory, think out loud so we both learn.

**Doc-first workflow:**
1. Update the feature doc with the plan before writing code
2. Implement, referencing the GitHub issue in commits (`ref #N` or `fixes #N`)
3. Update the feature doc with final notes and mark deliverables complete
4. The feature doc is the source of truth — for the plan, the roadmap, and the dev log

**GitHub Issues** are the work tracking system. Each session starts with an issue, ends with a commit that references it. Issues have acceptance criteria and point to the relevant feature doc.

**User-first mindset.** We're not building code for code's sake. Every feature exists because a person needs it. Think about how functional it is for the end user — that's the driver, not how fancy the implementation is.

**Context-aware workflow split.** The main agent handles backend (Electron main process, SQLite, IPC, GitHub API), architecture, ideation, releases, and doc updates. The **frontend-dev agent** handles all renderer/UI work autonomously — it receives a spec (what to build, which IPC channels to use, expected behavior) and executes the full loop: implement → screenshot → iterate → report back. This split exists to manage context — heavy backend work fills the window, and frontend work (Vue components, CSS, visual verification) needs its own clean context to avoid hallucinations. See `.claude/README.md` for all available agents.

**This file is part of the workflow.** When how we work changes, CLAUDE.md gets updated in the same commit. Don't append endlessly — edit to keep it current.

## Tech Stack

- Desktop: Electron + Vue 3 + Vite + TypeScript
- Database: SQLite via better-sqlite3 (synchronous, local storage)
- Editors: CodeMirror 6 (code/markdown), TipTap (rich text)
- Search: Fuse.js (fuzzy search with weighted scoring)
- UI: Lucide icons, Marked + highlight.js, DOMPurify for sanitization
- Performance: Virtua for virtual scrolling
- OS Integration: Electron globalShortcut, clipboard, system tray
- Remote: GitHub API (Device Flow auth, repo sync for remote libraries)

## Architecture

- **Main Process:** Global hotkeys, SQLite, IPC, GitHub API operations
- **Renderer Process:** Single palette window — search, editor, settings
- **Process boundary:** Long operations in Main, keep Renderer responsive
- **IPC:** Small, typed channels — not overloaded RPC events

## Feature Docs

Feature documentation lives in `docs/`. These are living documents — plan, implementation notes, and dev log in one place.

| Doc | What | Status |
|-----|------|--------|
| `docs/schema.md` | Database schema — tables, columns, migrations, TypeScript types | Living reference |
| `docs/remote-libraries.md` | Remote Libraries — GitHub sync, publishing, unified library model | Phases 1-4 complete, Phase 5 planned |
| `docs/settings.md` | Settings — infrastructure, General tab, connectors, auto-sync, shortcuts | Phase 1 planned |
| `docs/variable-substitution.md` | Variable substitution — `{{variable}}` templates, copy flow, highlighting | Current state documented, #11 planned |

## Development

```bash
pnpm install      # install dependencies
pnpm dev          # starts Electron + Vite dev server
pnpm dev:debug    # starts with Chrome DevTools Protocol on port 9222 (for frontend-dev agent)
pnpm build        # production build
```

### Guidelines

- Strict TypeScript (`"strict": true`)
- Clipboard-only operations (no keystroke simulation, no auto-execution)
- Variable substitution with `{{variable name}}` prompts user before copy
- Store SQLite database in user data directory

### Commit Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Short, focused messages — what changed and why, not a paragraph
- Reference GitHub issues: `feat: detach remote commands on edit (fixes #1)`

### Release Process

Use the Release Manager Agent for automated releases:

```
"Use the release manager agent to create an auto release"
"Check release status using the release manager"
```

The agent analyzes commits, determines version bump, generates changelog, tags, pushes, and monitors the build. See `.claude/README.md` for details.

**Manual release:** bump `package.json` version, commit, `git tag vX.Y.Z`, push with `--tags`. GitHub Actions builds all platforms and creates a draft release.

**Build config:** `electron-builder.json5` (not package.json). Always do clean builds when switching dev → production.

## Safety

- Clipboard-only — never executes commands automatically
- Variable substitution prompts prevent accidental execution
- GitHub tokens encrypted via Electron `safeStorage` before SQLite storage
- DOMPurify sanitizes all rendered HTML
