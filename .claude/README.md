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

## Agent Philosophy

Agents exist for tasks that need a different mindset or skill set than day-to-day development. They run as subagents with their own tools and instructions, keeping the main conversation focused.

**When to create an agent:**
- The task is recurring and well-defined
- It requires a different "hat" (reviewer, writer, release engineer)
- Loading its context into the main conversation would be wasteful

**Planned agents:**
- **Technical Writer** — reviews feature docs and plans for accuracy against the codebase
- **PR Reviewer** — reviews PRs before merge, checks for consistency, regressions, style
