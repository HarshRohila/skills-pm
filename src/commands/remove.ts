import { rm, lstat } from "fs/promises";
import { join } from "path";
import { readMetadata, removeSkillEntry } from "../metadata.ts";

export interface RemoveOptions {
  name: string;
  targetBases: string[];
  metaPath: string;
}

export async function removeSkill(options: RemoveOptions): Promise<void> {
  const meta = await readMetadata(options.metaPath);

  if (!meta.skills[options.name]) {
    throw new Error(`Skill "${options.name}" is not installed`);
  }

  for (const base of options.targetBases) {
    const linkPath = join(base, options.name);
    try {
      const stats = await lstat(linkPath);
      if (stats.isSymbolicLink()) {
        await rm(linkPath);
      }
    } catch {}
  }

  await removeSkillEntry(options.metaPath, options.name);
}
