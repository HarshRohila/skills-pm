import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { addSkill, addAllSkills, type AddOptions } from "./add.ts";
import { readMetadata } from "../metadata.ts";
import { join } from "path";
import { mkdtemp, rm, lstat } from "fs/promises";
import { tmpdir } from "os";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dir, "../../tests/fixtures");

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-add-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("addSkill (integration with fixtures)", () => {
  test("installs a named skill into every target base", async () => {
    const projectDir = join(tempDir, "project");
    const bases = [
      join(projectDir, ".agents/skills"),
      join(projectDir, ".claude/skills"),
    ];
    const result = await addSkill({
      repoDir: resolve(fixturesDir, "sample-repo"),
      skillName: "my-skill",
      targetBases: bases,
      metaPath: join(projectDir, ".skills-pm.json"),
      source: "test/sample-repo",
      ref: "HEAD",
    });

    expect(result.name).toBe("my-skill");

    for (const base of bases) {
      const stats = await lstat(join(base, "my-skill"));
      expect(stats.isSymbolicLink()).toBe(true);
    }

    const meta = await readMetadata(join(projectDir, ".skills-pm.json"));
    expect(meta.skills["my-skill"]).toBeDefined();
    expect(meta.skills["my-skill"]!.source).toBe("test/sample-repo");
    expect(meta.skills["my-skill"]!.targets).toEqual(bases);
  });

  test("succeeds when run again for an already-installed skill", async () => {
    const projectDir = join(tempDir, "project");
    const bases = [join(projectDir, ".agents/skills")];
    const opts: AddOptions = {
      repoDir: resolve(fixturesDir, "sample-repo"),
      skillName: "my-skill",
      targetBases: bases,
      metaPath: join(projectDir, ".skills-pm.json"),
      source: "test/sample-repo",
      ref: "HEAD",
    };

    await addSkill(opts);
    const result = await addSkill(opts);

    expect(result.name).toBe("my-skill");

    const linkPath = join(bases[0]!, "my-skill");
    const stats = await lstat(linkPath);
    expect(stats.isSymbolicLink()).toBe(true);

    const meta = await readMetadata(join(projectDir, ".skills-pm.json"));
    expect(meta.skills["my-skill"]).toBeDefined();
  });

  test("throws when skill name is not found", async () => {
    const projectDir = join(tempDir, "project");
    expect(
      addSkill({
        repoDir: resolve(fixturesDir, "sample-repo"),
        skillName: "nonexistent-skill",
        targetBases: [join(projectDir, ".agents/skills")],
        metaPath: join(projectDir, ".skills-pm.json"),
        source: "test/sample-repo",
        ref: "HEAD",
      })
    ).rejects.toThrow('Skill "nonexistent-skill" not found');
  });

  test("throws when no skills found in repo", async () => {
    const projectDir = join(tempDir, "project");
    expect(
      addSkill({
        repoDir: resolve(fixturesDir, "empty-repo"),
        skillName: "anything",
        targetBases: [join(projectDir, ".agents/skills")],
        metaPath: join(projectDir, ".skills-pm.json"),
        source: "test/empty-repo",
        ref: "HEAD",
      })
    ).rejects.toThrow("No skills found");
  });
});

describe("addAllSkills", () => {
  test("installs all discovered skills into every target base", async () => {
    const projectDir = join(tempDir, "project");
    const bases = [
      join(projectDir, ".agents/skills"),
      join(projectDir, ".claude/skills"),
    ];
    const results = await addAllSkills({
      repoDir: resolve(fixturesDir, "sample-repo"),
      targetBases: bases,
      metaPath: join(projectDir, ".skills-pm.json"),
      source: "test/sample-repo",
      ref: "HEAD",
    });

    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["claude-skill", "curated-skill", "my-skill"]);

    for (const result of results) {
      for (const base of bases) {
        const stats = await lstat(join(base, result.name));
        expect(stats.isSymbolicLink()).toBe(true);
      }
    }

    const meta = await readMetadata(join(projectDir, ".skills-pm.json"));
    expect(Object.keys(meta.skills).sort()).toEqual([
      "claude-skill",
      "curated-skill",
      "my-skill",
    ]);
  });

  test("throws when no skills found in repo", async () => {
    const projectDir = join(tempDir, "project");
    expect(
      addAllSkills({
        repoDir: resolve(fixturesDir, "empty-repo"),
        targetBases: [join(projectDir, ".agents/skills")],
        metaPath: join(projectDir, ".skills-pm.json"),
        source: "test/empty-repo",
        ref: "HEAD",
      })
    ).rejects.toThrow("No skills found");
  });
});
