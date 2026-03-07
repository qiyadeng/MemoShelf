# SnipForge

A desktop app for saving, searching, and managing command snippets. Built for engineers who want a searchable, hotkey-triggered command palette with variable substitution — think "runbooks that live on your desktop."

Teams use SnipForge to share command libraries via GitHub repos. New members see the app, subscribe to the team library, and have every command at their fingertips.

## Features

### Editors
- **Plain Text** — simple text input
- **Rich Text** — WYSIWYG with formatting, lists, task lists, and links (TipTap)
- **Markdown** — syntax-highlighted editor with toolbar (CodeMirror 6)
- **Code** — syntax highlighting for 15+ languages (JavaScript, TypeScript, Python, Go, Rust, Java, HTML, CSS, YAML, JSON, SQL, Bash, PHP, XML, and more)

### Core
- **Global Hotkey** — `Cmd+Shift+Space` (macOS) / `Ctrl+Shift+Space` (Windows/Linux) opens SnipForge from anywhere
- **Fuzzy Search** — real-time weighted search across title, tags, description, and body
- **Variables** — `{{variable name}}` template syntax with user prompts on copy
- **Tag System** — organize with tags, filter with tag selectors, autocomplete with Tab
- **Clipboard** — one-click copy with multi-format support (plain text + HTML for rich text and code)
- **Keyboard-Driven** — full navigation without touching the mouse

### Team Sharing
- **Remote Libraries** — subscribe to GitHub repos containing shared command snippets
- **One-Way Sync** — curators publish, members pull. No merge conflicts
- **Multi-Repo** — subscribe to multiple libraries simultaneously (e.g., `k8s-team`, `support-tools`)
- **Local Commands Stay Private** — remote commands are tagged with their source, never mixed

### Data Management
- **Export/Import** — JSON format with tag filtering and duplicate detection
- **SQLite Storage** — local database, no cloud dependency
- **System Tray** — runs in the background, always accessible

## Installation

### From Release (Recommended)
Download the latest installer from [Releases](../../releases):
- **macOS**: `.dmg`
- **Windows**: `.exe`
- **Linux**: `.AppImage`, `.deb`, `.rpm`

**macOS Security Note**: Since this app isn't code signed, macOS will show a warning. To run it:
- **Method 1**: Right-click the app > "Open" > "Open" (bypasses Gatekeeper)
- **Method 2**: Run in Terminal:
  ```bash
  xattr -cr /Applications/SnipForge.app
  ```

### Build from Source

```bash
git clone https://github.com/ArtluxDM/SnipForge.git
cd SnipForge
pnpm install
pnpm dev       # development
pnpm build     # production build
```

## Usage

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Type | Search commands |
| `Arrow Keys` | Navigate list |
| `C` or `Enter` | Copy command |
| `Shift+C` | Copy with variables intact |
| `N` | New command |
| `E` | Edit selected |
| `Backspace` | Delete selected |
| `Escape` | Clear search |
| `H` | Help |
| `S` | Settings |

### Variables
Use `{{variable name}}` in commands for dynamic values:
```bash
ssh {{username}}@{{server}}
kubectl get pods -n {{namespace}}
docker exec -it {{container name}} bash
```
When copied, you'll be prompted to fill in each variable.

### Remote Libraries
Subscribe to shared command libraries hosted on GitHub. See [docs/remote-libraries.md](docs/remote-libraries.md) for setup details.

1. Open Settings > **Libraries** tab
2. Sign in with GitHub
3. Enter a repo URL (e.g., `org/repo-name`)
4. Click Subscribe — commands appear in your main list

## Tech Stack
- **Desktop**: Electron + Vue 3 + Vite + TypeScript
- **Database**: SQLite via better-sqlite3
- **Editors**: CodeMirror 6 (code/markdown), TipTap (rich text)
- **Search**: Fuse.js (fuzzy search with weighted scoring)
- **UI**: Lucide icons, virtual scrolling (Virtua), DOMPurify, highlight.js

## Documentation
- [Codebase Map](docs/codebase-map.md) — file reference, architecture, IPC channels
- [Remote Libraries](docs/remote-libraries.md) — GitHub OAuth setup, repo structure, sync algorithm

## Support

SnipForge is built and maintained independently. Development costs include code signing certificates, hosting, and the many hours that go into building and improving the app.

If you or your company uses SnipForge, please consider sponsoring the project. Sponsorships help keep development active and the project sustainable.

[Sponsor SnipForge on GitHub](https://github.com/sponsors/ArtluxDM)

**For companies**: If your team uses SnipForge, a sponsorship is a small investment that directly supports the tool your people rely on.

## License

SnipForge is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

You are free to use, modify, and distribute this software under the terms of the AGPL. Any modifications or derivative works must also be released under the AGPL with full source code.

For commercial licensing inquiries, please reach out via [GitHub](https://github.com/ArtluxDM/SnipForge).
