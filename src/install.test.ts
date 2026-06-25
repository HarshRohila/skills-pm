import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { installSkill } from "./install.ts";
import { readMetadata } from "./metadata.ts";
import { join } from "path";
import { mkdtemp, rm, readlink, lstat } from "fs/promises";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-install-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("installSkill", () => {
  test("creates a symlink at every target base", async () => {
    const sourceDir = join(tempDir, "source-skill");
    const cursorBase = join(tempDir, "target/.agents/skills");
    const claudeBase = join(tempDir, "target/.claude/skills");
    const metaPath = join(tempDir, "target/.skills-pm.json");

    await Bun.write(join(sourceDir, "SKILL.md"), "# test");

    await installSkill({
      name: "my-skill",
      sourceDir,
      targetBases: [cursorBase, claudeBase],
      metaPath,
      source: "owner/repo",
      ref: "main",
    });

    for (const base of [cursorBase, claudeBase]) {
      const symlinkPath = join(base, "my-skill");
      const stats = await lstat(symlinkPath);
      expect(stats.isSymbolicLink()).toBe(true);
      expect(await readlink(symlinkPath)).toBe(sourceDir);
    }
  });

  test("writes metadata entry with targets", async () => {
    const sourceDir = join(tempDir, "source-skill");
    const bases = [
      join(tempDir, "target/.agents/skills"),
      join(tempDir, "target/.claude/skills"),
    ];
    const metaPath = join(tempDir, "target/.skills-pm.json");

    await Bun.write(join(sourceDir, "SKILL.md"), "# test");

    await installSkill({
      name: "my-skill",
      sourceDir,
      targetBases: bases,
      metaPath,
      source: "owner/repo",
      ref: "main",
    });

    const meta = await readMetadata(metaPath);
    expect(meta.skills["my-skill"]).toBeDefined();
    expect(meta.skills["my-skill"]!.source).toBe("owner/repo");
    expect(meta.skills["my-skill"]!.ref).toBe("main");
    expect(meta.skills["my-skill"]!.targets).toEqual(bases);
  });

  test("replaces existing symlink when installing same skill again", async () => {
    const originalSource = join(tempDir, "source-v1");
    const updatedSource = join(tempDir, "source-v2");
    const bases = [join(tempDir, "target/.agents/skills")];
    const metaPath = join(tempDir, "target/.skills-pm.json");

    await Bun.write(join(originalSource, "SKILL.md"), "# v1");
    await Bun.write(join(updatedSource, "SKILL.md"), "# v2");

    await installSkill({
      name: "my-skill",
      sourceDir: originalSource,
      targetBases: bases,
      metaPath,
      source: "owner/repo",
      ref: "main",
    });

    await installSkill({
      name: "my-skill",
      sourceDir: updatedSource,
      targetBases: bases,
      metaPath,
      source: "owner/repo",
      ref: "main",
    });

    const symlinkPath = join(bases[0]!, "my-skill");
    const stats = await lstat(symlinkPath);
    expect(stats.isSymbolicLink()).toBe(true);
    expect(await readlink(symlinkPath)).toBe(updatedSource);
  });

  test("creates parent directories if they don't exist", async () => {
    const sourceDir = join(tempDir, "source-skill");
    const bases = [
      join(tempDir, "deep/nested/path/.agents/skills"),
      join(tempDir, "deep/nested/path/.claude/skills"),
    ];
    const metaPath = join(tempDir, "deep/nested/path/.skills-pm.json");

    await Bun.write(join(sourceDir, "SKILL.md"), "# test");

    await installSkill({
      name: "my-skill",
      sourceDir,
      targetBases: bases,
      metaPath,
      source: "owner/repo",
      ref: "HEAD",
    });

    for (const base of bases) {
      const stats = await lstat(join(base, "my-skill"));
      expect(stats.isSymbolicLink()).toBe(true);
    }
  });
});
