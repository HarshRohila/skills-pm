# skills-pm

A package manager for [Cursor](https://cursor.com) agent skills. Install skills from public or private GitHub repositories with a single command.

## Prerequisites

- [Node.js](https://nodejs.org) >= 18 or [Bun](https://bun.sh)
- Git (for cloning repositories)

## Installation

```bash
# Run without installing
npx @rohilaharsh/skills-pm <command>
bunx @rohilaharsh/skills-pm <command>

# Or install globally
npm install -g @rohilaharsh/skills-pm
```

## Usage

### Install a skill

```bash
# From a public repo (owner/repo shorthand)
skills-pm add vercel-labs/agent-skills -s frontend-design

# From a full GitHub URL
skills-pm add https://github.com/vercel-labs/agent-skills -s frontend-design

# From a specific branch
skills-pm add owner/repo -s my-skill --ref develop

# From a specific tag
skills-pm add owner/repo -s my-skill --ref v1.2.0

# From a specific commit SHA
skills-pm add owner/repo -s my-skill --ref abc123f

# Install globally (available across all projects)
skills-pm add owner/repo -s my-skill -g
```

The `-s` (or `--skill`) flag is required. You must specify the skill name to install.

### Private repositories

Private repos work automatically if you have git credentials configured (SSH keys, HTTPS credentials, or a git credential helper). No extra setup needed.

```bash
skills-pm add my-org/private-skills-repo -s internal-skill
```

### List installed skills

```bash
# Show all installed skills (project + global)
skills-pm list

# Show only global skills
skills-pm list -g

# Alias
skills-pm ls
```

### Remove a skill

```bash
# Remove from project
skills-pm remove my-skill

# Remove from global
skills-pm remove my-skill -g

# Alias
skills-pm rm my-skill
```

### Publish skills to a branch

Share your project's skills by publishing them to a dedicated branch. Others can then install them with `skills-pm add`.

```bash
# Publish all discovered skills to a branch
skills-pm publish -b skills

# Publish a single skill
skills-pm publish -b skills -s my-skill

# With a custom commit message
skills-pm publish -b skills -m "Release v1.0 skills"
```

This creates (or updates) the target branch with your skills organized under `skills/<name>/`. The branch has its own independent history and your working directory is never modified.

Once published, others can install directly from that branch:

```bash
skills-pm add owner/repo -s my-skill --ref skills
```

## How it works

1. **Clone** — The repository is shallow-cloned into `~/.cache/skills-pm/<owner>/<repo>/<ref>/`
2. **Discover** — SKILL.md files are found by scanning [standard search paths](https://github.com/vercel-labs/skills#skill-discovery) used by the agent skills ecosystem
3. **Filter** — The skill matching the `-s` name is selected
4. **Symlink** — The skill directory is symlinked into the target location
5. **Record** — Metadata is written to track installed skills

### Installation paths

| Scope | Skills directory | Metadata file |
|-------|-----------------|---------------|
| Project (default) | `.agents/skills/<name>/` | `.skills-pm.json` |
| Global (`-g`) | `~/.cursor/skills/<name>/` | `~/.cache/skills-pm/global.json` |

### Skill discovery

The tool searches repositories using the same paths as [vercel-labs/skills](https://github.com/vercel-labs/skills):

- Root `SKILL.md`
- `skills/`, `skills/.curated/`, `skills/.experimental/`, `skills/.system/`
- Agent-specific directories (`.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, etc.)
- Recursive fallback if no skills found in standard locations

A valid `SKILL.md` file must have YAML frontmatter with `name` and `description`:

```markdown
---
name: my-skill
description: What this skill does
---

# My Skill

Instructions for the agent...
```

## Options reference

| Option | Description |
|--------|-------------|
| `-s, --skill <name>` | Skill name to install or publish (required for `add`) |
| `-b, --branch <name>` | Target branch (required for `publish`) |
| `-m, --message <msg>` | Commit message (for `publish`) |
| `--ref <ref>` | Git branch, tag, or commit SHA (default: default branch) |
| `-g, --global` | Use global scope instead of project |
| `-h, --help` | Show help message |

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build for distribution
bun run build

# Run from source
bun run src/cli.ts add owner/repo -s skill-name

# Run the built version
node dist/cli.js add owner/repo -s skill-name
```

## License

MIT
