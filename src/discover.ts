import { join } from "path";
import { readdir, stat } from "fs/promises";

const SEARCH_DIRS = [
  "skills",
  "skills/.curated",
  "skills/.experimental",
  "skills/.system",
  ".agents/skills",
  ".augment/skills",
  ".claude/skills",
  ".codebuddy/skills",
  ".commandcode/skills",
  ".continue/skills",
  ".cortex/skills",
  ".crush/skills",
  ".factory/skills",
  ".goose/skills",
  ".junie/skills",
  ".iflow/skills",
  ".kilocode/skills",
  ".kiro/skills",
  ".kode/skills",
  ".mcpjam/skills",
  ".vibe/skills",
  ".mux/skills",
  ".openhands/skills",
  ".pi/skills",
  ".qoder/skills",
  ".qwen/skills",
  ".roo/skills",
  ".trae/skills",
  ".windsurf/skills",
  ".zencoder/skills",
  ".neovate/skills",
  ".pochi/skills",
  ".adal/skills",
];

export async function discoverSkillPaths(repoDir: string): Promise<string[]> {
  const found: string[] = [];

  // Check root SKILL.md
  const rootSkill = join(repoDir, "SKILL.md");
  if (await fileExists(rootSkill)) {
    found.push(rootSkill);
  }

  // Check each known search directory for subdirectories containing SKILL.md
  for (const dir of SEARCH_DIRS) {
    const fullDir = join(repoDir, dir);
    if (!(await dirExists(fullDir))) continue;

    const entries = await readdir(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(fullDir, entry.name, "SKILL.md");
      if (await fileExists(skillMd)) {
        found.push(skillMd);
      }
    }
  }

  if (found.length > 0) return found;

  // Fallback: recursive search
  return recursiveFind(repoDir);
}

async function recursiveFind(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      results.push(...(await recursiveFind(fullPath)));
    } else if (entry.name === "SKILL.md") {
      results.push(fullPath);
    }
  }

  return results;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
