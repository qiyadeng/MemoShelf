# Body-First Command Entry Design

Status: Approved for implementation planning
Date: 2026-05-13

## Context

SnipForge currently treats a command title as a required user-entered field. The database, shared command-file format, IPC validation, import/export validation, and add/edit modal all assume a non-empty `title`.

The desired product model is different: the command/snippet body is the primary artifact. A user should be able to paste or write any useful text first, then let SnipForge create a usable title and tags automatically. The generated values should be editable and should support search, list display, and library file naming without forcing the user to think about naming before capture.

## Product Decision

Use the current storage model for now, but change the creation/editing experience so `title` is not user-required.

The UI should ask for these primary fields:

- `body`: required, first and most important input.
- `title`: auto-filled from `body`, editable by the user.
- `tags`: auto-filled from `body` and `language`, editable by the user.

`description` should be hidden from the primary entry flow for this iteration. Existing descriptions remain preserved when editing, but users should not have to deal with description while quickly capturing a command/snippet.

## Scope

### In Scope

- Rework the add/edit command modal so `body` is the first focused field.
- Allow saving when `body` is present even if the user did not type a title.
- Generate a deterministic title when the title field is blank.
- Generate deterministic tag suggestions from the body and language.
- Let users edit generated title and tags before saving.
- Preserve existing storage compatibility by saving a non-empty `title`.
- Keep existing search behavior working through `title`, `tags`, `description`, and `body`.
- Update import and library parsing only as needed so titleless inputs can be normalized safely.

### Out of Scope

- AI-based summarization.
- AI-based tagging.
- Schema migration to nullable `commands.title`.
- New metadata such as `title_source` or `tags_source`.
- Full redesign of the settings, library management, or import/export flows.
- Removing the `description` field from persisted data.

## UX Behavior

### Add Flow

When the user opens the add modal:

1. Focus starts in the body editor.
2. The user enters or pastes the snippet body.
3. If title is blank, SnipForge generates a title preview from the body.
4. If tags are blank, SnipForge generates tag suggestions from the body and selected language.
5. The user may edit title and tags.
6. Save requires only a non-empty body.

### Manual Override

Generated title and tags should behave as editable defaults.

If the user manually changes title or tags, SnipForge should not silently overwrite those fields while the modal remains open. This prevents a later body edit from destroying user intent.

For the first implementation, this can be tracked only in component state. No persisted `manual` or `generated` marker is required.

### Edit Flow

When editing an existing command:

- Existing title and tags load as-is.
- Existing description stays preserved in the background.
- The app does not regenerate title or tags unless those fields are empty.
- Saving an edited command still writes a non-empty title.

## Generation Rules

### Title

Title generation must be deterministic and local.

Suggested algorithm:

1. Trim the body.
2. Prefer the first non-empty line.
3. Remove common Markdown/code-wrapper noise, such as heading markers and code fences.
4. Collapse whitespace.
5. Strip or normalize characters that make poor list titles.
6. Truncate to a display-friendly length, around 80 characters.
7. Fall back to `Untitled snippet` only if a non-empty body still cannot produce text.

Examples:

```text
git reset --soft HEAD~1
```

Title:

```text
git reset --soft HEAD~1
```

```markdown
# Deploy checklist

- build
- test
- publish
```

Title:

```text
Deploy checklist
```

### Tags

Tag generation must be deterministic and local.

Suggested sources:

- Selected language, when it is meaningful and not just `plaintext`.
- Known tool keywords in the body, such as `git`, `docker`, `kubectl`, `ssh`, `curl`, `npm`, `pnpm`, `python`, `sql`, `postgres`, `nginx`, `terraform`, `aws`, `node`.
- Obvious content categories from syntax or keywords, such as `api`, `database`, `deploy`, `logs`, `test`, `network`.

Rules:

- Normalize tags to lowercase.
- De-duplicate tags.
- Reuse the existing 12-tag cap.
- Do not generate vague filler tags.
- Do not overwrite tags after the user edits the tag field.

## Data Compatibility

The stored command model should remain compatible with the current schema:

- `commands.title` remains `TEXT NOT NULL`.
- Library command files still include `title`.
- Exported command bundles still include `title`.
- Search indexes still include `title`.

The app should normalize missing or blank titles at the boundary where commands are created, imported, or parsed from files. That keeps downstream code stable while removing the title requirement from the user experience.

## Affected Areas

Likely implementation areas:

- `src/components/CommandModal.vue`
- `src/utils/importExport.ts`
- `shared/library-command.ts`
- `electron/main/index.ts`
- `electron/main/local-library.ts`
- `electron/main/database.ts`
- relevant tests under `tests/`
- `docs/schema.md` or feature docs, if behavior notes need updating

## Error Handling

- Empty body remains invalid.
- Blank title is not invalid if body is present.
- If generation fails unexpectedly, save should use a safe fallback title instead of blocking.
- Invalid tags should be normalized through existing tag utilities.

## Testing

Add or update tests for:

- Title generation from command-style bodies.
- Title generation from Markdown-style bodies.
- Tag generation from language and known body keywords.
- Command creation with blank title and non-empty body.
- Command update with blank title and non-empty body.
- Import/parsing of titleless command data, if supported in implementation.
- Existing titled command behavior remains unchanged.

Manual verification:

- Add a command by pasting only body text.
- Confirm title and tags appear automatically.
- Edit generated title/tags and confirm they are not overwritten.
- Save and confirm the command appears in search/list results.
- Edit an existing command and confirm existing title/tags are preserved.

