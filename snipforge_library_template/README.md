# SnipForge Library Template

Use this folder as a starting point for creating your own shared command library.

## How to create a library

1. Create a new GitHub repo (public or private)
2. Copy the contents of this folder into it
3. Edit `.snipforge.json` with your library name and description
4. Add your command files to `commands/` (or anywhere in the repo)
5. Push to GitHub

## File structure

```
your-library/
├── .snipforge.json              # Required — library manifest
└── commands/                    # Optional — organize however you like
    ├── ssh-connect.json
    ├── docker-list-containers.json
    └── ...
```

## Manifest (`.snipforge.json`)

Required at the repo root. Tells SnipForge this repo is a command library.

```json
{
  "name": "Your Library Name",
  "description": "What this library contains",
  "format_version": "1.0"
}
```

## Command file format

Each command is a single JSON file with these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Command name shown in the list |
| `body` | string | Yes | The actual command/snippet |
| `description` | string | No | Markdown description (shown on hover) |
| `tags` | string[] | No | Tags for filtering and search |
| `language` | string | No | Syntax highlighting (`bash`, `python`, `javascript`, etc.) |
| `created_at` | ISO 8601 | No | Creation timestamp |
| `updated_at` | ISO 8601 | No | Last modified timestamp |

### Variables

Use `{{variable name}}` in the `body` field. SnipForge will prompt users to fill them in when copying.

```json
{
  "title": "SSH: Connect to server",
  "body": "ssh {{username}}@{{server}}",
  "description": "Connect to a remote server via SSH.",
  "tags": ["ssh", "connect"],
  "language": "bash"
}
```

## How team members subscribe

1. Open SnipForge > Settings > Libraries
2. Sign in with GitHub
3. Enter the repo URL (e.g., `your-org/your-library`)
4. Click Subscribe

Commands sync automatically. When you push updates to the repo, team members click "Sync" to pull the latest.
