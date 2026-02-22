## Keyboard Shortcuts

## Navigation

- **↑↓** - Navigate through commands
- **Tab** - Navigate between focusable elements (searchbar → filter → settings → help → commands)
- **Enter** (in searchbar) - Select first command
- **⌘F** (Mac) / **Ctrl+F** (Windows/Linux) - Focus searchbar from anywhere
- **Escape** - Cancel/deselect/close (priority: modals → dropdown → selection → blur → clear search)

## Actions

- **C** - Copy selected command (with variable substitution)
- **Shift+C** - Copy command template (with variables intact)
- **N** - Add new command
- **E** - Edit selected command
- **Backspace** - Delete selected command

## Search

SnipForge uses fuzzy search to help you quickly find the right command.

### Basic Search
Type in the search box to search across command titles, tags, descriptions, and bodies. Results are ranked by relevance.

### Tag Filtering
Click the filter icon next to the search box to open the tag selector. Select one or more tags to narrow results before searching. Tag filtering and text search work together — tags filter first, then fuzzy search runs within the filtered set.

## Autocomplete

When editing a command's tags in the add/edit modal:

- **Tab** - Accept inline tag suggestion
- **Escape** - Dismiss tag suggestion

## Global

- **⌘⇧Space** (Mac) / **Ctrl⇧Space** (Windows/Linux) - Show/hide SnipForge

## Export & Import

### Export Commands
Export your commands to a JSON file for backup or sharing.

- **Filter by tags**: Use the tag selector to choose which commands to export
- **Command counter**: Shows how many commands will be exported
- **Export all**: Leave filter empty to export all commands

### Import Commands
Import commands from a previously exported JSON file.

- Validates file format before importing
- Detects duplicates and lets you choose to keep existing or replace with new
- Shows success/failure count after import

## Variables

Use `{{variable name}}` syntax in commands for dynamic substitution.

**Example:** `docker exec -it {{container}} {{command}}`

When you copy a command with variables, you'll be prompted to enter values for each variable before the final command is copied to your clipboard.
