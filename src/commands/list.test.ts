import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { listSkills, type ListResult } from "./list.ts";
import { writeSkillEntry } from "../metadata.ts";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-list-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("listSkills", () => {
  test("lists project-level skills", async () => {
    const projectMeta = join(tempDir, "project/.skills-pm.json");

    await writeSkillEntry(projectMeta, "my-skill", {
      source: "owner/repo",
      ref: "main",
      skillDir: "/cache/skills/my-skill",
      installedAt: "2026-03-28T00:00:00.000Z",
    });

    const result = await listSkills({
      projectMetaPath: projectMeta,
      globalMetaPath: join(tempDir, "global.json"),
    });

    expect(result.project).toHaveLength(1);
    expect(result.project[0]!.name).toBe("my-skill");
    expect(result.project[0]!.source).toBe("owner/repo");
  });

  test("lists global skills", async () => {
    const globalMeta = join(tempDir, "global.json");

    await writeSkillEntry(globalMeta, "global-skill", {
      source: "owner/repo",
      ref: "HEAD",
      skillDir: "/cache/skills/global-skill",
      installedAt: "2026-03-28T00:00:00.000Z",
    });

    const result = await listSkills({
      projectMetaPath: join(tempDir, "project/.skills-pm.json"),
      globalMetaPath: globalMeta,
    });

    expect(result.global).toHaveLength(1);
    expect(result.global[0]!.name).toBe("global-skill");
  });

  test("shows both project and global skills by default", async () => {
    const projectMeta = join(tempDir, "project/.skills-pm.json");
    const globalMeta = join(tempDir, "global.json");

    await writeSkillEntry(projectMeta, "proj-skill", {
      source: "owner/repo",
      ref: "main",
      skillDir: "/cache/skills/proj-skill",
      installedAt: "2026-03-28T00:00:00.000Z",
    });
    await writeSkillEntry(globalMeta, "glob-skill", {
      source: "owner/repo2",
      ref: "HEAD",
      skillDir: "/cache/skills/glob-skill",
      installedAt: "2026-03-28T00:00:00.000Z",
    });

    const result = await listSkills({
      projectMetaPath: projectMeta,
      globalMetaPath: globalMeta,
    });

    expect(result.project).toHaveLength(1);
    expect(result.global).toHaveLength(1);
  });

  test("returns empty arrays when no skills installed", async () => {
    const result = await listSkills({
      projectMetaPath: join(tempDir, "nonexistent-project.json"),
      globalMetaPath: join(tempDir, "nonexistent-global.json"),
    });

    expect(result.project).toHaveLength(0);
    expect(result.global).toHaveLength(0);
  });

  test("globalOnly option returns only global skills", async () => {
    const projectMeta = join(tempDir, "project/.skills-pm.json");
    const globalMeta = join(tempDir, "global.json");

    await writeSkillEntry(projectMeta, "proj-skill", {
      source: "owner/repo",
      ref: "main",
      skillDir: "/cache/skills/proj-skill",
      installedAt: "2026-03-28T00:00:00.000Z",
    });
    await writeSkillEntry(globalMeta, "glob-skill", {
      source: "owner/repo2",
      ref: "HEAD",
      skillDir: "/cache/skills/glob-skill",
      installedAt: "2026-03-28T00:00:00.000Z",
    });

    const result = await listSkills({
      projectMetaPath: projectMeta,
      globalMetaPath: globalMeta,
      globalOnly: true,
    });

    expect(result.project).toHaveLength(0);
    expect(result.global).toHaveLength(1);
  });
});
