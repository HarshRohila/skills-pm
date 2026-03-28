# Development Guide

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Node.js](https://nodejs.org) >= 18 (for verifying the built output)
- Git

## Project Structure

```
skills-pm/
  src/
    cli.ts                  Entry point, arg parsing, command dispatch
    source-parser.ts        Parses "owner/repo" and GitHub URLs
    git.ts                  Shallow-clones repos into the cache directory
    discover.ts             Scans known search paths for SKILL.md files
    parse-skill.ts          Parses YAML frontmatter from SKILL.md
    install.ts              Creates symlinks and writes metadata
    metadata.ts             Reads/writes .skills-pm.json
    paths.ts                Project and global path helpers
    commands/
      add.ts                Orchestrates clone → discover → filter → install
      list.ts               Reads metadata and returns installed skills
      remove.ts             Removes symlinks and metadata entries
    *.test.ts               Co-located test files (bun:test)
  tests/
    fixtures/               Sample directory trees with SKILL.md files for tests
  dist/                     Built output (git-ignored, created by `bun run build`)
```

## Running Tests

```bash
# Run the full test suite
bun test

# Run a specific test file
bun test src/source-parser.test.ts

# Run tests matching a pattern
bun test --grep "cloneRepo"
```

The git tests clone from GitHub and take ~8 seconds. All other tests use local fixtures and complete in milliseconds.

## Testing the CLI Locally

There are three ways to test the CLI in another project before publishing.

### Method 1: Run directly from source

The simplest approach. From the skills-pm directory:

```bash
# Run any command directly
bun run src/cli.ts add vercel-labs/agent-skills -s find-skills

# Or use the npm script shortcut
bun start add vercel-labs/agent-skills -s find-skills
```

To test against a different project directory, `cd` into that project first and use an absolute path:

```bash
cd ~/projects/my-other-repo
bun run /path/to/skills-pm/src/cli.ts add owner/repo -s my-skill
```

### Method 2: `bun link` (globally available as `skills-pm`)

This makes the `skills-pm` command available system-wide, pointing to your local source:

```bash
# In the skills-pm directory
bun link

# Now from any other project directory
cd ~/projects/my-other-repo
skills-pm add owner/repo -s my-skill
skills-pm list
skills-pm remove my-skill
```

To unlink when done:

```bash
bun unlink skills-pm
```

### Method 3: `npm pack` (simulate a real npm install)

This is the closest to what users will experience. It builds the package, creates a tarball, and installs it in another project:

```bash
# In the skills-pm directory: build and pack
bun run build
npm pack
# This creates skills-pm-0.1.0.tgz

# In another project directory
cd ~/projects/my-other-repo
npm install /path/to/skills-pm/skills-pm-0.1.0.tgz

# Now run it via npx (uses the locally installed version)
npx skills-pm add owner/repo -s my-skill
npx skills-pm list
```

Clean up:

```bash
# In the other project
npm uninstall skills-pm

# In skills-pm directory
rm skills-pm-*.tgz
```

## Building

The build step bundles all TypeScript source into a single JS file that runs on Node:

```bash
bun run build
```

This produces `dist/cli.js`. Verify it works:

```bash
node dist/cli.js --help
node dist/cli.js list
```

The build uses `--target node --packages external` so that `gray-matter` (the only runtime dependency) is imported from `node_modules` at runtime rather than bundled.

## Publishing to npm

A single script handles testing, building, version bumping, and publishing:

```bash
bun run release          # bump patch, test, build, publish
bun run release minor    # bump minor
bun run release major    # bump major
```

This runs the following steps in order (aborting on any failure):

1. `bun test`
2. `bun run build`
3. `node dist/cli.js --help` (verify the build)
4. `npm version <patch|minor|major> --no-git-tag-version`
5. `npm publish`

After publishing, verify it works:

```bash
npx @rohilaharsh/skills-pm@latest --help
```

Note: The `"files": ["dist"]` field in `package.json` ensures only the built output, `package.json`, `README.md`, and `LICENSE` are included in the published package. Source code and test fixtures are not shipped.

## Debugging

### Cache location

Cloned repos are cached at:

```
~/.cache/skills-pm/<owner>/<repo>/<ref>/
```

To force a re-clone, delete the relevant cache directory:

```bash
rm -rf ~/.cache/skills-pm/owner/repo/HEAD
```

### Metadata files

| Scope | File |
|-------|------|
| Project | `.skills-pm.json` in the project root |
| Global | `~/.cache/skills-pm/global.json` |

These are plain JSON files. You can inspect them directly:

```bash
# Project metadata
cat .skills-pm.json

# Global metadata
cat ~/.cache/skills-pm/global.json
```

### Symlink verification

Check that symlinks were created correctly:

```bash
# Project skills
ls -la .agents/skills/

# Global skills
ls -la ~/.cursor/skills/
```
