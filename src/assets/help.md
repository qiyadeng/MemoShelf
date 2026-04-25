# Quick Reference

## Keyboard Shortcuts

### Navigation

- **↑↓** Navigate through commands
- **Tab** Cycle between searchbar, filter, settings, help, and command list
- **Enter** (in searchbar) Select first command
- **⌘F** (Mac) / **Ctrl+F** (Windows/Linux) Focus searchbar from anywhere
- **Escape** Close modals → close dropdown → deselect → blur → clear search

### Actions

- **C** Copy selected command (prompts for variables if any)
- **Shift+C** Copy raw template (variables stay as `{{placeholders}}`)
- **N** Add new command
- **E** Edit selected command
- **Backspace** Delete selected command
- **⌘⇧Space** (Mac) / **Ctrl⇧Space** (Windows/Linux) Show/hide SnipForge

All shortcuts can be remapped in **Settings → Shortcuts**.

## Search

Type in the search box to fuzzy-search across titles, tags, descriptions, and command bodies. Results are ranked by relevance.

Click the **filter icon** to narrow by tags first — tag filtering and text search work together.

## Variables

Use `{{variable name}}` in a command body to create a template. When you copy the command, SnipForge prompts you to fill in each variable before copying the result.

Go templates (`{{.Name}}`), Handlebars (`{{#if}}`), and similar syntaxes are left untouched — only plain names trigger substitution.

## Libraries

Libraries are local working copies of commands on disk. Some are local-only, and some are linked to a GitHub origin.

To add a GitHub-backed library, paste a repo URL in Settings → Libraries. If the repo contains multiple libraries, you'll be asked to pick one. You can also open a local folder as a library to load commands from `.json` files on disk.

Sync refreshes a library's local working copy and index — manually or automatically (toggle per-library in Settings). Commands can show their library source in the list, but row actions stay limited to copy, edit, and delete. Library-level sync, export, and origin workflows live in Settings → Libraries.

## Export & Import

Export your commands as a JSON file for backup or sharing — use the tag filter to export a subset. Import loads commands from a JSON file, detects duplicates, and lets you choose whether to keep or replace.

## More

For detailed documentation, visit [SnipForge Docs](https://github.com/ArtluxDM/SnipForge/tree/main/docs).
