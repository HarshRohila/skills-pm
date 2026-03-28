import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

export interface SkillEntry {
  source: string;
  ref: string;
  skillDir: string;
  installedAt: string;
}

export interface Metadata {
  skills: Record<string, SkillEntry>;
}

export async function readMetadata(metaPath: string): Promise<Metadata> {
  try {
    const content = await readFile(metaPath, "utf-8");
    return JSON.parse(content) as Metadata;
  } catch {
    return { skills: {} };
  }
}

export async function writeSkillEntry(
  metaPath: string,
  name: string,
  entry: SkillEntry
): Promise<void> {
  const meta = await readMetadata(metaPath);
  meta.skills[name] = entry;
  await mkdir(dirname(metaPath), { recursive: true });
  await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n");
}

export async function removeSkillEntry(
  metaPath: string,
  name: string
): Promise<void> {
  const meta = await readMetadata(metaPath);
  delete meta.skills[name];
  await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n");
}
