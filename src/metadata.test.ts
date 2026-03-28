import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readMetadata, writeSkillEntry, removeSkillEntry, type SkillEntry } from "./metadata.ts";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-meta-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("metadata", () => {
  test("readMetadata returns empty skills for nonexistent file", async () => {
    const meta = await readMetadata(join(tempDir, "nonexistent.json"));
    expect(meta).toEqual({ skills: {} });
  });

  test("writeSkillEntry adds a skill and persists it", async () => {
    const metaPath = join(tempDir, ".skills-pm.json");
    const entry: SkillEntry = {
      source: "owner/repo",
      ref: "main",
      skillDir: "/cache/owner/repo/main/skills/my-skill",
      installedAt: new Date().toISOString(),
    };

    await writeSkillEntry(metaPath, "my-skill", entry);
    const meta = await readMetadata(metaPath);
    expect(meta.skills["my-skill"]).toEqual(entry);
  });

  test("writeSkillEntry preserves existing entries", async () => {
    const metaPath = join(tempDir, ".skills-pm.json");
    const entry1: SkillEntry = {
      source: "owner/repo",
      ref: "main",
      skillDir: "/cache/skills/skill-a",
      installedAt: new Date().toISOString(),
    };
    const entry2: SkillEntry = {
      source: "owner/repo",
      ref: "main",
      skillDir: "/cache/skills/skill-b",
      installedAt: new Date().toISOString(),
    };

    await writeSkillEntry(metaPath, "skill-a", entry1);
    await writeSkillEntry(metaPath, "skill-b", entry2);

    const meta = await readMetadata(metaPath);
    expect(Object.keys(meta.skills)).toEqual(["skill-a", "skill-b"]);
  });

  test("removeSkillEntry removes a skill entry", async () => {
    const metaPath = join(tempDir, ".skills-pm.json");
    const entry: SkillEntry = {
      source: "owner/repo",
      ref: "main",
      skillDir: "/cache/skills/my-skill",
      installedAt: new Date().toISOString(),
    };

    await writeSkillEntry(metaPath, "my-skill", entry);
    await removeSkillEntry(metaPath, "my-skill");

    const meta = await readMetadata(metaPath);
    expect(meta.skills["my-skill"]).toBeUndefined();
  });
});
