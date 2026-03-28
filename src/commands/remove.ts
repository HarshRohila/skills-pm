import { rm } from "fs/promises";
import { join } from "path";
import { readMetadata, removeSkillEntry } from "../metadata.ts";

export interface RemoveOptions {
  name: string;
  targetBase: string;
  metaPath: string;
}

export async function removeSkill(options: RemoveOptions): Promise<void> {
  const meta = await readMetadata(options.metaPath);

  if (!meta.skills[options.name]) {
    throw new Error(`Skill "${options.name}" is not installed`);
  }

  const linkPath = join(options.targetBase, options.name);
  await rm(linkPath, { force: true });
  await removeSkillEntry(options.metaPath, options.name);
}
