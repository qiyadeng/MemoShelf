# Quick Reference

## Keyboard Shortcuts

### Navigation

- **Arrow Up / Arrow Down** Navigate through memories
- **Tab** Cycle between search, filter, settings, help, and the list
- **Enter** (in search) Select the first memory
- **Cmd+F** (Mac) / **Ctrl+F** (Windows/Linux) Focus search from anywhere
- **Escape** Close modals, close dropdowns, deselect, blur, or clear search

### Actions

- **C** Copy selected memory and fill variables if needed
- **Shift+C** Copy raw template with variables intact
- **N** Add new memory
- **E** Edit selected memory
- **Backspace** Delete selected memory
- **Cmd+Space** (Mac) / **Ctrl+Space** (Windows/Linux) Show or hide MemoShelf

All shortcuts can be remapped in **Settings > Shortcuts**.

## Search

Type in the search box to fuzzy-search across titles, tags, descriptions, and bodies. Results are ranked by relevance.

Click the **filter icon** to narrow by tags first. Tag filtering and text search work together.

## Variables

Use `{{variable name}}` in a body to create a template. When you copy it, MemoShelf prompts you to fill in each variable before copying the result.

Go templates (`{{.Name}}`), Handlebars (`{{#if}}`), and similar syntaxes are left untouched. Only plain names trigger substitution.

## Libraries

Libraries are local working copies of saved items on disk. Some are local-only, and some are linked to a GitHub origin.

To add a GitHub-backed library, paste a repo URL in Settings > Libraries. If the repo contains multiple libraries, you will be asked to pick one. You can also open a local folder as a library to load JSON files on disk.

Sync refreshes a library's local working copy and index, manually or automatically. Items can show their library source in the list, while library-level sync, export, and origin workflows live in Settings > Libraries.

## Export & Import

Export your memories as a JSON file for backup or sharing. Use the tag filter to export a subset. Import loads a JSON file, detects duplicates, and lets you choose whether to keep or replace.

## More

For detailed documentation, visit [MemoShelf Docs](https://github.com/qiyadeng/MemoShelf/tree/main/docs).
