# Variable Substitution

Variable substitution lets users create reusable command templates with placeholders. When copying a command, SnipForge detects `{{variable}}` placeholders, prompts the user to fill them in, and copies the completed command to the clipboard.

## How It Works

### Creating Variables

Use `{{name}}` syntax anywhere in a command body:

```bash
docker exec -it {{container name}} /bin/bash
kubectl get pods -n {{namespace}} -o wide
ssh {{user}}@{{host}} -p {{port}}
```

Variable names support letters, numbers, spaces, hyphens, and underscores. Names are case-sensitive and trimmed of leading/trailing whitespace.

### Copy Flow

1. User presses **Enter** or clicks the **Copy** button on a command
2. If the body contains variables → the **Variable Input Modal** opens
3. Modal shows one text field per unique variable, in order of appearance
4. User fills in values → clicks **Copy Command** (all fields required)
5. Variables are replaced with values → result copied to clipboard → window hides

**Skip substitution:** Press **Shift+C** to copy the raw template with `{{variables}}` intact (no modal).

### Visual Indicators

Variables are highlighted in the command preview (gold/amber color, `#e8a948`) so users can spot templates at a glance. The highlighting is applied after HTML-escaping to prevent XSS.

---

## Known Issue: Template Syntax Collision

**Status:** Open — [issue #11](https://github.com/ArtluxDM/SnipForge/issues/11)

The current regex (`/\{\{([^}]+)\}\}/g`) matches **anything** inside `{{ }}`, which means Go template and Mustache/Handlebars syntax collides with SnipForge variables:

- `docker ps --format '{{.Names}}'` → `.Names` detected as a variable
- `kubectl get pods -o jsonpath='{{.metadata.name}}'` → `.metadata.name` detected
- Helm: `{{- include "chart.name" . }}`, Handlebars: `{{#if}}`, `{{> partial}}`

**Planned fix:** Restrict the variable regex to only match plain names (letters, numbers, spaces, hyphens, underscores). Content starting with `.`, `#`, `/`, `>`, or containing pipes, quotes, or parens is treated as literal template syntax and left alone.

---

## Developer Reference

### Key Files

| File | Purpose |
|------|---------|
| `src/utils/variables.ts` | Core logic: extraction, substitution, detection, highlighting |
| `src/components/VariableInputModal.vue` | Dynamic form modal — one input field per variable |
| `src/App.vue` | Copy flow orchestration, keyboard shortcuts, preview rendering |

### `src/utils/variables.ts`

Four functions, all using the same regex pattern:

| Function | Purpose |
|----------|---------|
| `extractVariables(text)` | Returns unique variable names in order of appearance |
| `substituteVariables(text, values)` | Replaces `{{name}}` with provided values; unmatched variables kept as-is |
| `hasVariables(text)` | Quick boolean check — used to decide whether to show the modal |
| `highlightVariables(escapedHtml)` | Wraps `{{name}}` in `<span class="variable-highlight">` for preview display |

**Current regex:** `/\{\{([^}]+)\}\}/g` — matches any non-empty content between `{{ }}`.

### `src/components/VariableInputModal.vue`

- Receives `variables: string[]` as a prop (from `extractVariables()`)
- Creates a reactive `values` object keyed by variable name
- Auto-focuses the first input field on open
- Validates all fields are filled before emitting `submit` with the values map
- `cancel` emitted on close button, overlay click, or ESC

### Copy Flow in `App.vue`

```
copyCommand(command)
  ├── hasVariables(command.body)?
  │   ├── YES → extractVariables() → show VariableInputModal
  │   │         └── on submit → substituteVariables(body, values) → copyToClipboard()
  │   └── NO  → copyToClipboard() directly
  │
copyCommandTemplate(body, language)  [Shift+C]
  └── copyToClipboard() directly (no substitution)
```

### Preview Rendering

`getCommandPreview()` in `App.vue`:
1. HTML-escapes the command body (`&`, `<`, `>`, `"`)
2. Passes through `highlightVariables()` to wrap `{{variables}}` in highlight spans
3. Sanitizes with DOMPurify before rendering via `v-html`

### Styling

```css
.variable-highlight {
  color: #e8a948;
  font-weight: 500;
}
```

Defined in `App.vue` (not scoped — applies to `v-html` rendered content).

### Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Syntax | `{{name}}` double braces | Familiar (Mustache/Handlebars), visually distinct, unlikely in shell commands (except Go templates — see #11) |
| Variable names | Spaces allowed | Descriptive names like `{{container name}}` read better than `{{container_name}}` |
| Substitution | All-or-nothing | Every variable must have a value before copy — prevents accidentally copying partial templates |
| Raw copy | Shift+C | Power users need to copy templates as-is for sharing or editing elsewhere |
| Highlighting | Gold/amber on dark background | High contrast, visually distinct from code syntax highlighting |
| No execution | Clipboard only | Variables are a convenience for copy — SnipForge never executes commands |
