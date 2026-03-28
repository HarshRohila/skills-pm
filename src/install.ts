import { symlink, mkdir } from "fs/promises";
import { join } from "path";
import { writeSkillEntry } from "./metadata.ts";

export interface InstallOptions {
  name: string;
  sourceDir: string;
  targetBase: string;
  metaPath: string;
  source: string;
  ref: string;
}

export async function installSkill(options: InstallOptions): Promise<void> {
  const linkPath = join(options.targetBase, options.name);

  await mkdir(options.targetBase, { recursive: true });
  await symlink(options.sourceDir, linkPath);

  await writeSkillEntry(options.metaPath, options.name, {
    source: options.source,
    ref: options.ref,
    skillDir: options.sourceDir,
    installedAt: new Date().toISOString(),
  });
}
