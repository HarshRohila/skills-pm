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
  test("creates a symlink at the target path", async () => {
    const sourceDir = join(tempDir, "source-skill");
    const targetBase = join(tempDir, "target/.agents/skills");
    const metaPath = join(tempDir, "target/.skills-pm.json");

    // Create a fake skill source directory
    await Bun.write(join(sourceDir, "SKILL.md"), "# test");

    await installSkill({
      name: "my-skill",
      sourceDir,
      targetBase,
      metaPath,
      source: "owner/repo",
      ref: "main",
    });

    const symlinkPath = join(targetBase, "my-skill");
    const stats = await lstat(symlinkPath);
    expect(stats.isSymbolicLink()).toBe(true);

    const linkTarget = await readlink(symlinkPath);
    expect(linkTarget).toBe(sourceDir);
  });

  test("writes metadata entry", async () => {
    const sourceDir = join(tempDir, "source-skill");
    const targetBase = join(tempDir, "target/.agents/skills");
    const metaPath = join(tempDir, "target/.skills-pm.json");

    await Bun.write(join(sourceDir, "SKILL.md"), "# test");

    await installSkill({
      name: "my-skill",
      sourceDir,
      targetBase,
      metaPath,
      source: "owner/repo",
      ref: "main",
    });

    const meta = await readMetadata(metaPath);
    expect(meta.skills["my-skill"]).toBeDefined();
    expect(meta.skills["my-skill"]!.source).toBe("owner/repo");
    expect(meta.skills["my-skill"]!.ref).toBe("main");
  });

  test("replaces existing symlink when installing same skill again", async () => {
    const originalSource = join(tempDir, "source-v1");
    const updatedSource = join(tempDir, "source-v2");
    const targetBase = join(tempDir, "target/.agents/skills");
    const metaPath = join(tempDir, "target/.skills-pm.json");

    await Bun.write(join(originalSource, "SKILL.md"), "# v1");
    await Bun.write(join(updatedSource, "SKILL.md"), "# v2");

    await installSkill({
      name: "my-skill",
      sourceDir: originalSource,
      targetBase,
      metaPath,
      source: "owner/repo",
      ref: "main",
    });

    // Install again with a different source dir (simulating re-clone)
    await installSkill({
      name: "my-skill",
      sourceDir: updatedSource,
      targetBase,
      metaPath,
      source: "owner/repo",
      ref: "main",
    });

    const symlinkPath = join(targetBase, "my-skill");
    const stats = await lstat(symlinkPath);
    expect(stats.isSymbolicLink()).toBe(true);

    const linkTarget = await readlink(symlinkPath);
    expect(linkTarget).toBe(updatedSource);
  });

  test("creates parent directories if they don't exist", async () => {
    const sourceDir = join(tempDir, "source-skill");
    const targetBase = join(tempDir, "deep/nested/path/.agents/skills");
    const metaPath = join(tempDir, "deep/nested/path/.skills-pm.json");

    await Bun.write(join(sourceDir, "SKILL.md"), "# test");

    await installSkill({
      name: "my-skill",
      sourceDir,
      targetBase,
      metaPath,
      source: "owner/repo",
      ref: "HEAD",
    });

    const stats = await lstat(join(targetBase, "my-skill"));
    expect(stats.isSymbolicLink()).toBe(true);
  });
});
