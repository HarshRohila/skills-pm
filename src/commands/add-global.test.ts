import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { addSkill } from "./add.ts";
import { readMetadata } from "../metadata.ts";
import { join, resolve } from "path";
import { mkdtemp, rm, lstat } from "fs/promises";
import { tmpdir } from "os";

const fixturesDir = resolve(import.meta.dir, "../../tests/fixtures");

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-global-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("addSkill with global paths", () => {
  test("-g flag installs into both cursor and claude global bases", async () => {
    const bases = [
      join(tempDir, ".cursor/skills"),
      join(tempDir, ".claude/skills"),
    ];
    const globalMeta = join(tempDir, ".cache/skills-pm/global.json");

    const result = await addSkill({
      repoDir: resolve(fixturesDir, "sample-repo"),
      skillName: "my-skill",
      targetBases: bases,
      metaPath: globalMeta,
      source: "test/sample-repo",
      ref: "HEAD",
    });

    expect(result.installedTo).toEqual(bases);

    for (const base of bases) {
      const stats = await lstat(join(base, "my-skill"));
      expect(stats.isSymbolicLink()).toBe(true);
    }

    const meta = await readMetadata(globalMeta);
    expect(meta.skills["my-skill"]).toBeDefined();
  });

  test("global install does not affect project metadata", async () => {
    const globalBases = [join(tempDir, ".cursor/skills")];
    const globalMeta = join(tempDir, ".cache/skills-pm/global.json");
    const projectMeta = join(tempDir, "project/.skills-pm.json");

    await addSkill({
      repoDir: resolve(fixturesDir, "sample-repo"),
      skillName: "my-skill",
      targetBases: globalBases,
      metaPath: globalMeta,
      source: "test/sample-repo",
      ref: "HEAD",
    });

    const projectData = await readMetadata(projectMeta);
    expect(Object.keys(projectData.skills)).toHaveLength(0);
  });
});
