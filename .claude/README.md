# Claude Agents for SnipForge

Specialized agents for tasks that require focused expertise. Each agent has a narrow scope and its own tools — this keeps the main context clean and avoids loading every skill at once.

## Available Agents

### Release Manager

Handles the complete release lifecycle: version bumping, changelog generation, tagging, pushing, and monitoring builds.

**Invoke by asking:**
```
"Use the release manager agent to create an auto release"
"Use release-manager to bump patch version"
"Check release status using the release manager"
```

**What it does:**
1. Analyzes commits since last release
2. Determines version bump from conventional commits
3. Generates formatted changelog
4. Shows preview, asks for confirmation
5. Updates package.json, creates tag, pushes
6. Updates GitHub draft release with changelog
7. Monitors GitHub Actions build status

**Config:** `.claude/agents/release-manager.md`

### Frontend Developer

Autonomous frontend developer with live access to the running Electron app via Chrome DevTools Protocol. Receives a spec from the main agent and executes the full implementation loop independently — code, screenshot, iterate, report. This separation exists to keep backend context out of frontend work and vice versa.

**Prerequisites:** App must be running with `pnpm dev:debug`

**Invoke by asking:**
```
"Use the frontend-dev agent to implement the settings UI — here's the spec: ..."
"Have the frontend agent build the new modal component"
"Use frontend-dev to fix the layout issue in the command list"
```

**What it does:**
1. Reads the spec and existing code
2. Checks available IPC channels in `src/preload.ts`
3. Implements the changes (Vue components, styles, TypeScript)
4. Screenshots and iterates until it matches the spec
5. Reports back with summary and final screenshot

**Boundary:** The frontend agent does NOT touch main process files. If it needs an IPC channel or type that doesn't exist, it reports back and the main agent creates it.

**Config:** `.claude/agents/frontend-dev.md`

## Agent Philosophy

Agents exist for tasks that need a different mindset or skill set than day-to-day development. They run as subagents with their own tools and instructions, keeping the main conversation focused.

**When to create an agent:**
- The task is recurring and well-defined
- It requires a different "hat" (reviewer, writer, release engineer, frontend dev)
- Loading its context into the main conversation would be wasteful (e.g., screenshots, DOM trees)

**Planned agents:**
- **Technical Writer** — reviews feature docs and plans for accuracy against the codebase
- **PR Reviewer** — reviews PRs before merge, checks for consistency, regressions, style
