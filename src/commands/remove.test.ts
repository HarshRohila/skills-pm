import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { removeSkill } from "./remove.ts";
import { writeSkillEntry, readMetadata } from "../metadata.ts";
import { join } from "path";
import { mkdtemp, rm, symlink, mkdir, lstat } from "fs/promises";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-remove-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function setupInstalledSkill(
  name: string,
  targetBase: string,
  metaPath: string
) {
  const sourceDir = join(tempDir, `source-${name}`);
  await mkdir(sourceDir, { recursive: true });
  await Bun.write(join(sourceDir, "SKILL.md"), "# test");

  await mkdir(targetBase, { recursive: true });
  await symlink(sourceDir, join(targetBase, name));

  await writeSkillEntry(metaPath, name, {
    source: "owner/repo",
    ref: "main",
    skillDir: sourceDir,
    installedAt: new Date().toISOString(),
  });
}

describe("removeSkill", () => {
  test("removes symlink from target path", async () => {
    const targetBase = join(tempDir, "project/.agents/skills");
    const metaPath = join(tempDir, "project/.skills-pm.json");

    await setupInstalledSkill("my-skill", targetBase, metaPath);

    // Verify symlink exists before removal
    const before = await lstat(join(targetBase, "my-skill"));
    expect(before.isSymbolicLink()).toBe(true);

    await removeSkill({
      name: "my-skill",
      targetBase,
      metaPath,
    });

    // Symlink should be gone
    expect(lstat(join(targetBase, "my-skill"))).rejects.toThrow();
  });

  test("removes entry from metadata", async () => {
    const targetBase = join(tempDir, "project/.agents/skills");
    const metaPath = join(tempDir, "project/.skills-pm.json");

    await setupInstalledSkill("my-skill", targetBase, metaPath);

    await removeSkill({
      name: "my-skill",
      targetBase,
      metaPath,
    });

    const meta = await readMetadata(metaPath);
    expect(meta.skills["my-skill"]).toBeUndefined();
  });

  test("preserves other skills in metadata", async () => {
    const targetBase = join(tempDir, "project/.agents/skills");
    const metaPath = join(tempDir, "project/.skills-pm.json");

    await setupInstalledSkill("skill-a", targetBase, metaPath);
    await setupInstalledSkill("skill-b", targetBase, metaPath);

    await removeSkill({
      name: "skill-a",
      targetBase,
      metaPath,
    });

    const meta = await readMetadata(metaPath);
    expect(meta.skills["skill-a"]).toBeUndefined();
    expect(meta.skills["skill-b"]).toBeDefined();
  });

  test("throws when skill is not found in metadata", async () => {
    const targetBase = join(tempDir, "project/.agents/skills");
    const metaPath = join(tempDir, "project/.skills-pm.json");

    expect(
      removeSkill({
        name: "nonexistent",
        targetBase,
        metaPath,
      })
    ).rejects.toThrow('Skill "nonexistent" is not installed');
  });

  test("works with -g global paths", async () => {
    const globalTarget = join(tempDir, ".cursor/skills");
    const globalMeta = join(tempDir, ".cache/skills-pm/global.json");

    await setupInstalledSkill("global-skill", globalTarget, globalMeta);

    await removeSkill({
      name: "global-skill",
      targetBase: globalTarget,
      metaPath: globalMeta,
    });

    const meta = await readMetadata(globalMeta);
    expect(meta.skills["global-skill"]).toBeUndefined();
    expect(lstat(join(globalTarget, "global-skill"))).rejects.toThrow();
  });
});
