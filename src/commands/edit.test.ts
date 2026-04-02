import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { editSkill } from "./edit.ts";
import { writeSkillEntry } from "../metadata.ts";
import { join } from "path";
import { mkdtemp, rm, mkdir, readFile, stat } from "fs/promises";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-edit-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function setupCachedSkill(
  name: string,
  metaPath: string
): Promise<string> {
  const cacheDir = join(tempDir, "cache", name);
  await mkdir(cacheDir, { recursive: true });
  await Bun.write(
    join(cacheDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: A test skill\n---\n\n# ${name}\n`
  );
  await Bun.write(join(cacheDir, "helper.ts"), "export const x = 1;");

  await writeSkillEntry(metaPath, name, {
    source: "owner/repo",
    ref: "main",
    skillDir: cacheDir,
    installedAt: new Date().toISOString(),
  });

  return cacheDir;
}

describe("editSkill", () => {
  test("copies skill files to ./skills/<name>/", async () => {
    const metaPath = join(tempDir, "project/.skills-pm.json");
    await setupCachedSkill("my-skill", metaPath);

    const destBase = join(tempDir, "project/skills");
    const result = await editSkill({
      skillName: "my-skill",
      metaPath,
      destBase,
    });

    expect(result.name).toBe("my-skill");
    expect(result.copiedTo).toBe(join(destBase, "my-skill"));

    const skillMd = await readFile(join(destBase, "my-skill/SKILL.md"), "utf-8");
    expect(skillMd).toContain("name: my-skill");

    const helper = await readFile(join(destBase, "my-skill/helper.ts"), "utf-8");
    expect(helper).toBe("export const x = 1;");
  });

  test("copies nested subdirectories", async () => {
    const metaPath = join(tempDir, "project/.skills-pm.json");
    const cacheDir = await setupCachedSkill("nested-skill", metaPath);

    await mkdir(join(cacheDir, "lib/utils"), { recursive: true });
    await Bun.write(join(cacheDir, "lib/utils/deep.ts"), "export const deep = true;");

    const destBase = join(tempDir, "project/skills");
    await editSkill({
      skillName: "nested-skill",
      metaPath,
      destBase,
    });

    const deep = await readFile(
      join(destBase, "nested-skill/lib/utils/deep.ts"),
      "utf-8"
    );
    expect(deep).toBe("export const deep = true;");
  });

  test("throws when skill is not installed", async () => {
    const metaPath = join(tempDir, "project/.skills-pm.json");

    expect(
      editSkill({
        skillName: "nonexistent",
        metaPath,
        destBase: join(tempDir, "project/skills"),
      })
    ).rejects.toThrow('Skill "nonexistent" is not installed');
  });

  test("throws when destination already exists", async () => {
    const metaPath = join(tempDir, "project/.skills-pm.json");
    await setupCachedSkill("my-skill", metaPath);

    const destBase = join(tempDir, "project/skills");
    await mkdir(join(destBase, "my-skill"), { recursive: true });
    await Bun.write(join(destBase, "my-skill/SKILL.md"), "existing");

    expect(
      editSkill({
        skillName: "my-skill",
        metaPath,
        destBase,
      })
    ).rejects.toThrow("already exists");
  });

  test("throws when cached source directory is missing", async () => {
    const metaPath = join(tempDir, "project/.skills-pm.json");

    await writeSkillEntry(metaPath, "gone-skill", {
      source: "owner/repo",
      ref: "main",
      skillDir: join(tempDir, "cache/does-not-exist"),
      installedAt: new Date().toISOString(),
    });

    expect(
      editSkill({
        skillName: "gone-skill",
        metaPath,
        destBase: join(tempDir, "project/skills"),
      })
    ).rejects.toThrow("no longer exists");
  });

  test("creates destBase directory if it does not exist", async () => {
    const metaPath = join(tempDir, "project/.skills-pm.json");
    await setupCachedSkill("my-skill", metaPath);

    const destBase = join(tempDir, "project/brand-new/skills");
    await editSkill({
      skillName: "my-skill",
      metaPath,
      destBase,
    });

    const s = await stat(join(destBase, "my-skill"));
    expect(s.isDirectory()).toBe(true);
  });
});
