import { cp, mkdir, stat } from "fs/promises";
import { join } from "path";
import { readMetadata } from "../metadata.ts";

export interface EditOptions {
  skillName: string;
  metaPath: string;
  destBase: string;
}

export interface EditResult {
  name: string;
  copiedTo: string;
}

export async function editSkill(options: EditOptions): Promise<EditResult> {
  const { skillName, metaPath, destBase } = options;

  const meta = await readMetadata(metaPath);
  const entry = meta.skills[skillName];

  if (!entry) {
    throw new Error(`Skill "${skillName}" is not installed`);
  }

  if (!(await dirExists(entry.skillDir))) {
    throw new Error(
      `Source directory for "${skillName}" no longer exists at ${entry.skillDir}. Re-add the skill first: skills-pm add ${entry.source} -s ${skillName}`
    );
  }

  const dest = join(destBase, skillName);

  if (await dirExists(dest)) {
    throw new Error(
      `Destination "${dest}" already exists. Remove it first or choose a different directory.`
    );
  }

  await mkdir(destBase, { recursive: true });
  await cp(entry.skillDir, dest, { recursive: true });

  return { name: skillName, copiedTo: dest };
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
