import { symlink, mkdir, rm, lstat } from "fs/promises";
import { join } from "path";
import { writeSkillEntry } from "./metadata.ts";

export interface InstallOptions {
  name: string;
  sourceDir: string;
  targetBases: string[];
  metaPath: string;
  source: string;
  ref: string;
}

export async function installSkill(options: InstallOptions): Promise<void> {
  for (const base of options.targetBases) {
    await linkInto(base, options.name, options.sourceDir);
  }

  await writeSkillEntry(options.metaPath, options.name, {
    source: options.source,
    ref: options.ref,
    skillDir: options.sourceDir,
    installedAt: new Date().toISOString(),
    targets: options.targetBases,
  });
}

export async function linkInto(
  base: string,
  name: string,
  sourceDir: string
): Promise<boolean> {
  const linkPath = join(base, name);
  await mkdir(base, { recursive: true });

  try {
    const stats = await lstat(linkPath);
    if (stats.isSymbolicLink()) {
      await rm(linkPath);
    } else {
      return false;
    }
  } catch {}

  await symlink(sourceDir, linkPath);
  return true;
}
