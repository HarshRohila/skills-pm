import { stat, readlink } from "fs/promises";
import { join } from "path";
import { readMetadata, writeSkillEntry } from "./metadata.ts";
import { linkInto } from "./install.ts";

export interface ReconcileResult {
  created: { name: string; base: string }[];
  skipped: { name: string; reason: string }[];
}

export async function reconcileFromMetadata(
  metaPath: string,
  bases: string[]
): Promise<ReconcileResult> {
  const result: ReconcileResult = { created: [], skipped: [] };
  const meta = await readMetadata(metaPath);

  for (const [name, entry] of Object.entries(meta.skills)) {
    if (!(await dirExists(entry.skillDir))) {
      result.skipped.push({ name, reason: "skillDir missing" });
      continue;
    }

    let changed = false;
    for (const base of bases) {
      const linkPath = join(base, name);
      if (await pointsTo(linkPath, entry.skillDir)) continue;

      const ok = await linkInto(base, name, entry.skillDir);
      if (ok) {
        result.created.push({ name, base });
        changed = true;
      } else {
        result.skipped.push({ name, reason: `non-symlink at ${linkPath}` });
      }
    }

    const targetsChanged =
      !entry.targets ||
      entry.targets.length !== bases.length ||
      bases.some((b) => !entry.targets!.includes(b));
    if (changed || targetsChanged) {
      await writeSkillEntry(metaPath, name, { ...entry, targets: bases });
    }
  }

  return result;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function pointsTo(linkPath: string, expected: string): Promise<boolean> {
  try {
    const target = await readlink(linkPath);
    return target === expected;
  } catch {
    return false;
  }
}
