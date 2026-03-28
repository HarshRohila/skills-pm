import { describe, expect, test } from "bun:test";
import { discoverSkillPaths } from "./discover.ts";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dir, "../tests/fixtures");

describe("discoverSkillPaths", () => {
  test("finds SKILL.md in known search paths", async () => {
    const paths = await discoverSkillPaths(resolve(fixturesDir, "sample-repo"));
    expect(paths.length).toBe(3);

    const normalized = paths.map((p) => p.replace(fixturesDir + "/sample-repo/", "")).sort();
    expect(normalized).toEqual([
      ".claude/skills/claude-skill/SKILL.md",
      "skills/.curated/curated-skill/SKILL.md",
      "skills/my-skill/SKILL.md",
    ]);
  });

  test("finds SKILL.md at repo root", async () => {
    const paths = await discoverSkillPaths(resolve(fixturesDir, "root-skill-repo"));
    expect(paths.length).toBe(1);
    expect(paths[0]).toEndWith("SKILL.md");
  });

  test("returns empty array for repo with no skills", async () => {
    const paths = await discoverSkillPaths(resolve(fixturesDir, "empty-repo"));
    expect(paths).toEqual([]);
  });

  test("falls back to recursive search when no standard paths match", async () => {
    const paths = await discoverSkillPaths(resolve(fixturesDir, "nested-only-repo"));
    expect(paths.length).toBe(1);
    expect(paths[0]).toEndWith("deep/nested/skill-dir/SKILL.md");
  });
});
