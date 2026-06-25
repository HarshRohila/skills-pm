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
  bases: string[],
  metaPath: string
) {
  const sourceDir = join(tempDir, `source-${name}`);
  await mkdir(sourceDir, { recursive: true });
  await Bun.write(join(sourceDir, "SKILL.md"), "# test");

  for (const base of bases) {
    await mkdir(base, { recursive: true });
    await symlink(sourceDir, join(base, name));
  }

  await writeSkillEntry(metaPath, name, {
    source: "owner/repo",
    ref: "main",
    skillDir: sourceDir,
    installedAt: new Date().toISOString(),
    targets: bases,
  });
}

describe("removeSkill", () => {
  test("removes symlinks from every target base", async () => {
    const bases = [
      join(tempDir, "project/.agents/skills"),
      join(tempDir, "project/.claude/skills"),
    ];
    const metaPath = join(tempDir, "project/.skills-pm.json");

    await setupInstalledSkill("my-skill", bases, metaPath);

    for (const base of bases) {
      const before = await lstat(join(base, "my-skill"));
      expect(before.isSymbolicLink()).toBe(true);
    }

    await removeSkill({ name: "my-skill", targetBases: bases, metaPath });

    for (const base of bases) {
      expect(lstat(join(base, "my-skill"))).rejects.toThrow();
    }
  });

  test("removes entry from metadata", async () => {
    const bases = [join(tempDir, "project/.agents/skills")];
    const metaPath = join(tempDir, "project/.skills-pm.json");

    await setupInstalledSkill("my-skill", bases, metaPath);

    await removeSkill({ name: "my-skill", targetBases: bases, metaPath });

    const meta = await readMetadata(metaPath);
    expect(meta.skills["my-skill"]).toBeUndefined();
  });

  test("preserves other skills in metadata", async () => {
    const bases = [join(tempDir, "project/.agents/skills")];
    const metaPath = join(tempDir, "project/.skills-pm.json");

    await setupInstalledSkill("skill-a", bases, metaPath);
    await setupInstalledSkill("skill-b", bases, metaPath);

    await removeSkill({ name: "skill-a", targetBases: bases, metaPath });

    const meta = await readMetadata(metaPath);
    expect(meta.skills["skill-a"]).toBeUndefined();
    expect(meta.skills["skill-b"]).toBeDefined();
  });

  test("throws when skill is not found in metadata", async () => {
    const bases = [join(tempDir, "project/.agents/skills")];
    const metaPath = join(tempDir, "project/.skills-pm.json");

    expect(
      removeSkill({ name: "nonexistent", targetBases: bases, metaPath })
    ).rejects.toThrow('Skill "nonexistent" is not installed');
  });

  test("tolerates a base where the symlink never existed", async () => {
    const bases = [
      join(tempDir, "project/.agents/skills"),
      join(tempDir, "project/.claude/skills"),
    ];
    const metaPath = join(tempDir, "project/.skills-pm.json");

    await setupInstalledSkill("my-skill", [bases[0]!], metaPath);

    await removeSkill({ name: "my-skill", targetBases: bases, metaPath });

    const meta = await readMetadata(metaPath);
    expect(meta.skills["my-skill"]).toBeUndefined();
  });

  test("works with global paths", async () => {
    const bases = [
      join(tempDir, ".cursor/skills"),
      join(tempDir, ".claude/skills"),
    ];
    const metaPath = join(tempDir, ".cache/skills-pm/global.json");

    await setupInstalledSkill("global-skill", bases, metaPath);

    await removeSkill({ name: "global-skill", targetBases: bases, metaPath });

    const meta = await readMetadata(metaPath);
    expect(meta.skills["global-skill"]).toBeUndefined();
    for (const base of bases) {
      expect(lstat(join(base, "global-skill"))).rejects.toThrow();
    }
  });
});
