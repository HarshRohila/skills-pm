import { describe, expect, test } from "bun:test";
import { parseSkill } from "./parse-skill.ts";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dir, "../tests/fixtures");

describe("parseSkill", () => {
  test("parses valid SKILL.md with name and description", async () => {
    const skill = await parseSkill(
      resolve(fixturesDir, "sample-repo/skills/my-skill/SKILL.md")
    );
    expect(skill).toEqual({
      name: "my-skill",
      description: "A sample skill for testing",
      dir: resolve(fixturesDir, "sample-repo/skills/my-skill"),
    });
  });

  test("parses SKILL.md at repo root", async () => {
    const skill = await parseSkill(
      resolve(fixturesDir, "root-skill-repo/SKILL.md")
    );
    expect(skill.name).toBe("root-skill");
    expect(skill.description).toBe("A skill at repo root");
    expect(skill.dir).toBe(resolve(fixturesDir, "root-skill-repo"));
  });

  test("throws when name is missing", async () => {
    expect(
      parseSkill(resolve(fixturesDir, "invalid-skill-no-name/SKILL.md"))
    ).rejects.toThrow("missing required field: name");
  });

  test("throws when description is missing", async () => {
    expect(
      parseSkill(resolve(fixturesDir, "invalid-skill-no-desc/SKILL.md"))
    ).rejects.toThrow("missing required field: description");
  });

  test("throws when file has no frontmatter", async () => {
    expect(
      parseSkill(resolve(fixturesDir, "no-frontmatter/SKILL.md"))
    ).rejects.toThrow("missing required field: name");
  });
});
