import { discoverSkillPaths } from "../discover.ts";
import { parseSkill, type Skill } from "../parse-skill.ts";
import { installSkill } from "../install.ts";

export interface AddOptions {
  repoDir: string;
  skillName: string;
  targetBase: string;
  metaPath: string;
  source: string;
  ref: string;
}

export interface AddResult {
  name: string;
  description: string;
  installedTo: string;
}

export async function addSkill(options: AddOptions): Promise<AddResult> {
  const skillPaths = await discoverSkillPaths(options.repoDir);

  if (skillPaths.length === 0) {
    throw new Error(`No skills found in ${options.repoDir}`);
  }

  const skills: Skill[] = [];
  for (const path of skillPaths) {
    try {
      skills.push(await parseSkill(path));
    } catch {
      // Skip invalid SKILL.md files
    }
  }

  const match = skills.find(
    (s) => s.name.toLowerCase() === options.skillName.toLowerCase()
  );

  if (!match) {
    const available = skills.map((s) => s.name).join(", ");
    throw new Error(
      `Skill "${options.skillName}" not found. Available: ${available}`
    );
  }

  await installSkill({
    name: match.name,
    sourceDir: match.dir,
    targetBase: options.targetBase,
    metaPath: options.metaPath,
    source: options.source,
    ref: options.ref,
  });

  return {
    name: match.name,
    description: match.description,
    installedTo: options.targetBase,
  };
}
