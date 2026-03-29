---
name: save-to-snipforge
description: >-
  Save commands to SnipForge library. Use when the user says "save to snipforge",
  "add to snipforge", "remember this command", "snipforge save", or asks to persist
  a command/snippet they used or discussed. Also use when searching snipforge for
  commands ("search snipforge for", "do we have a snipforge command for", "check
  snipforge"). Do NOT use for general file operations or non-command content.
argument-hint: "[command description or search query]"
---

# Save to SnipForge

Save and search command snippets in SnipForge's file-based library format.

## Arguments
$ARGUMENTS — (Optional) Description of the command to save, or a search query.

## Setup — Finding the Library

Before saving or searching, locate the library:

1. Run `Glob` for `**/.snipforge.json` in the current working directory (max depth ~3 levels)
2. If found: use that library folder. If multiple found, ask the user which one.
3. If not found: ask the user —
   - "Where should I create the SnipForge library? Default: `./snipforge-commands/`"
   - Get a name for the library (default: project folder name + " Commands")
   - Run: `bash ~/.claude/skills/save-to-snipforge/scripts/init-library.sh "<path>" "<name>" "<description>"`

## Saving a Command

Extract these fields from context:

| Field | Required | Notes |
|-------|----------|-------|
| `title` | Yes | Short, descriptive. Pattern: "Tool: Action" (e.g., "OpenSSL: Create Random Token") |
| `body` | Yes | The actual command. Use `{{variable}}` for parameterized parts |
| `description` | Yes | One-line explanation of what the command does |
| `tags` | Yes | Array of lowercase tags. Always include the tool name. Include project name if project-specific. |
| `language` | No | Default: `bash`. Use `powershell`, `sql`, `python`, etc. when appropriate |

Write the command file using the `Write` tool:

- **Path:** `<library_folder>/<slugified-title>.json`
- **Slug:** lowercase title, non-alphanumeric → hyphens, collapse consecutive hyphens, trim
  - "OpenSSL: Create Token" → `openssl-create-token.json`
  - "K8s: Get Pod Logs" → `k8s-get-pod-logs.json`
- **Timestamps:** ISO 8601, current time for both `created_at` and `updated_at`
- **Check for duplicates:** Before writing, check if a file with the same slug already exists. If so, ask before overwriting.

### File format

```json
{
  "snipforge": "command",
  "title": "<title>",
  "body": "<command body>",
  "description": "<description>",
  "tags": ["<tag1>", "<tag2>"],
  "language": "<language>",
  "created_at": "<ISO 8601>",
  "updated_at": "<ISO 8601>"
}
```

### Variables

Use `{{variable name}}` syntax for parameterized parts of commands:
- `curl -u {{username}}:{{password}} {{url}}`
- `kubectl logs -f {{pod}} -n {{namespace}}`

If the original command has hardcoded values that should be parameterized, replace them with variables.

### After saving

Confirm with: "Saved **<title>** to `<library_name>`" and show the file path.

## Searching Commands

When the user asks to search or find a command:

1. Locate libraries (same as setup step)
2. Use `Grep` to search across all `.json` files in the library folder(s):
   - By tag: pattern `"<tag>"` in files
   - By title/description: pattern across files
   - By body content: pattern in `"body"` values
3. Read matching files and present results as a list:
   - Title — Description — Tags
4. If the user picks one, read and show the full command body

## Important

- Always use the `"snipforge": "command"` identifier field — the app uses this for validation
- Tags are always lowercase
- The `format_version` in manifests is always `"1.0"`
- Do NOT write to the SQLite database directly — the Electron app owns it
- The library folder must contain a `.snipforge.json` manifest to be recognized by the app
