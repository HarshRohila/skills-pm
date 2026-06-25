import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { reconcileFromMetadata } from "./reconcile.ts";
import { readMetadata, writeSkillEntry } from "./metadata.ts";
import { join } from "path";
import {
  mkdtemp,
  rm,
  mkdir,
  symlink,
  lstat,
  readlink,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-reconcile-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function makeSkillDir(name: string): Promise<string> {
  const dir = join(tempDir, "cache", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), "# test\n");
  return dir;
}

describe("reconcileFromMetadata", () => {
  test("creates missing symlinks into bases that were never written", async () => {
    const cursorBase = join(tempDir, ".cursor/skills");
    const claudeBase = join(tempDir, ".claude/skills");
    const metaPath = join(tempDir, "global.json");

    const skillDir = await makeSkillDir("my-skill");

    // Legacy entry: written before claude support, no targets recorded, only cursor symlink exists.
    await mkdir(cursorBase, { recursive: true });
    await symlink(skillDir, join(cursorBase, "my-skill"));
    await writeSkillEntry(metaPath, "my-skill", {
      source: "owner/repo",
      ref: "main",
      skillDir,
      installedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await reconcileFromMetadata(metaPath, [
      cursorBase,
      claudeBase,
    ]);

    const claudeLink = join(claudeBase, "my-skill");
    expect((await lstat(claudeLink)).isSymbolicLink()).toBe(true);
    expect(await readlink(claudeLink)).toBe(skillDir);

    expect(result.created).toEqual([{ name: "my-skill", base: claudeBase }]);

    const meta = await readMetadata(metaPath);
    expect(meta.skills["my-skill"]!.targets).toEqual([cursorBase, claudeBase]);
  });

  test("is a no-op when symlinks already point to skillDir", async () => {
    const bases = [
      join(tempDir, ".cursor/skills"),
      join(tempDir, ".claude/skills"),
    ];
    const metaPath = join(tempDir, "global.json");

    const skillDir = await makeSkillDir("my-skill");

    for (const base of bases) {
      await mkdir(base, { recursive: true });
      await symlink(skillDir, join(base, "my-skill"));
    }

    await writeSkillEntry(metaPath, "my-skill", {
      source: "owner/repo",
      ref: "main",
      skillDir,
      installedAt: "2026-01-01T00:00:00.000Z",
      targets: bases,
    });

    const result = await reconcileFromMetadata(metaPath, bases);
    expect(result.created).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  test("replaces a wrong symlink target", async () => {
    const cursorBase = join(tempDir, ".cursor/skills");
    const metaPath = join(tempDir, "global.json");

    const oldDir = await makeSkillDir("old");
    const newDir = await makeSkillDir("new");

    await mkdir(cursorBase, { recursive: true });
    await symlink(oldDir, join(cursorBase, "my-skill"));

    await writeSkillEntry(metaPath, "my-skill", {
      source: "owner/repo",
      ref: "main",
      skillDir: newDir,
      installedAt: "2026-01-01T00:00:00.000Z",
    });

    await reconcileFromMetadata(metaPath, [cursorBase]);

    expect(await readlink(join(cursorBase, "my-skill"))).toBe(newDir);
  });

  test("skips entries whose skillDir no longer exists", async () => {
    const cursorBase = join(tempDir, ".cursor/skills");
    const metaPath = join(tempDir, "global.json");

    await writeSkillEntry(metaPath, "ghost", {
      source: "owner/repo",
      ref: "main",
      skillDir: join(tempDir, "does-not-exist"),
      installedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await reconcileFromMetadata(metaPath, [cursorBase]);

    expect(result.created).toEqual([]);
    expect(result.skipped[0]!.name).toBe("ghost");
    expect(lstat(join(cursorBase, "ghost"))).rejects.toThrow();
  });

  test("does not stomp a non-symlink at the link path", async () => {
    const cursorBase = join(tempDir, ".cursor/skills");
    const metaPath = join(tempDir, "global.json");

    const skillDir = await makeSkillDir("my-skill");

    await mkdir(join(cursorBase, "my-skill"), { recursive: true });
    await writeFile(join(cursorBase, "my-skill", "USER-FILE"), "keep me");

    await writeSkillEntry(metaPath, "my-skill", {
      source: "owner/repo",
      ref: "main",
      skillDir,
      installedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await reconcileFromMetadata(metaPath, [cursorBase]);

    expect(result.created).toEqual([]);
    expect(result.skipped.some((s) => s.name === "my-skill")).toBe(true);

    const userFile = Bun.file(join(cursorBase, "my-skill", "USER-FILE"));
    expect(await userFile.exists()).toBe(true);
  });
});
