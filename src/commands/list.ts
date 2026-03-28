import { readMetadata } from "../metadata.ts";

export interface ListOptions {
  projectMetaPath: string;
  globalMetaPath: string;
  globalOnly?: boolean;
}

export interface SkillInfo {
  name: string;
  source: string;
  ref: string;
  installedAt: string;
}

export interface ListResult {
  project: SkillInfo[];
  global: SkillInfo[];
}

export async function listSkills(options: ListOptions): Promise<ListResult> {
  const result: ListResult = { project: [], global: [] };

  if (!options.globalOnly) {
    const projectMeta = await readMetadata(options.projectMetaPath);
    result.project = Object.entries(projectMeta.skills).map(
      ([name, entry]) => ({
        name,
        source: entry.source,
        ref: entry.ref,
        installedAt: entry.installedAt,
      })
    );
  }

  const globalMeta = await readMetadata(options.globalMetaPath);
  result.global = Object.entries(globalMeta.skills).map(([name, entry]) => ({
    name,
    source: entry.source,
    ref: entry.ref,
    installedAt: entry.installedAt,
  }));

  return result;
}
