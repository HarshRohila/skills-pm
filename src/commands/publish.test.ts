import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { publishSkills } from "./publish.ts";
import { join } from "path";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

interface SkillFixture {
  description: string;
  content: string;
  extraFiles?: Record<string, string>;
}

async function createBareRemote(bareDir: string, repoDir: string): Promise<void> {
  await git(["init", "--bare"], bareDir);
  await git(["remote", "add", "origin", bareDir], repoDir);
  await git(["push", "origin", "HEAD"], repoDir);
}

async function createTestRepo(
  dir: string,
  skills: Record<string, SkillFixture>
): Promise<string> {
  const bareDir = dir + "-bare";
  await mkdir(bareDir, { recursive: true });

  await git(["init"], dir);
  await git(["config", "user.email", "test@test.com"], dir);
  await git(["config", "user.name", "Test"], dir);

  for (const [name, skill] of Object.entries(skills)) {
    const skillDir = join(dir, "skills", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${skill.description}\n---\n\n${skill.content}\n`
    );
    if (skill.extraFiles) {
      for (const [filename, fileContent] of Object.entries(skill.extraFiles)) {
        await writeFile(join(skillDir, filename), fileContent);
      }
    }
  }

  await writeFile(join(dir, "README.md"), "# Test Repo");
  await git(["add", "."], dir);
  await git(["commit", "-m", "initial commit"], dir);
  await createBareRemote(bareDir, dir);

  return bareDir;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-publish-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("publishSkills", () => {
  test("publishes all discovered skills to a new branch", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    await createTestRepo(repoDir, {
      "skill-a": { description: "Skill A", content: "# Skill A" },
      "skill-b": { description: "Skill B", content: "# Skill B" },
    });

    const result = await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
    });

    expect(result.branch).toBe("published-skills");
    expect(result.skills.sort()).toEqual(["skill-a", "skill-b"]);
    expect(result.commitSha).toBeTruthy();

    const skillA = await git(
      ["show", "published-skills:skills/skill-a/SKILL.md"],
      repoDir
    );
    expect(skillA).toContain("name: skill-a");

    const skillB = await git(
      ["show", "published-skills:skills/skill-b/SKILL.md"],
      repoDir
    );
    expect(skillB).toContain("name: skill-b");
  });

  test("publishes only the specified skill when skillName is provided", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    await createTestRepo(repoDir, {
      "skill-a": { description: "Skill A", content: "# Skill A" },
      "skill-b": { description: "Skill B", content: "# Skill B" },
    });

    const result = await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
      skillName: "skill-a",
    });

    expect(result.skills).toEqual(["skill-a"]);

    const content = await git(
      ["show", "published-skills:skills/skill-a/SKILL.md"],
      repoDir
    );
    expect(content).toContain("name: skill-a");

    expect(
      git(["show", "published-skills:skills/skill-b/SKILL.md"], repoDir)
    ).rejects.toThrow();
  });

  test("updates existing branch with a new commit", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    await createTestRepo(repoDir, {
      "my-skill": { description: "Original", content: "# Original" },
    });

    await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
    });

    await writeFile(
      join(repoDir, "skills/my-skill/SKILL.md"),
      "---\nname: my-skill\ndescription: Updated\n---\n\n# Updated Content\n"
    );

    const result = await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
    });

    const content = await git(
      ["show", "published-skills:skills/my-skill/SKILL.md"],
      repoDir
    );
    expect(content).toContain("Updated Content");

    const log = await git(
      ["log", "--oneline", "published-skills"],
      repoDir
    );
    const commits = log.split("\n").filter(Boolean);
    expect(commits.length).toBe(2);
  });

  test("preserves file content and nested files in published branch", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    await createTestRepo(repoDir, {
      "my-skill": {
        description: "Complex skill",
        content: "# My Skill\n\nDetailed instructions.",
        extraFiles: {
          "helper.py": 'print("hello")',
          "config.json": '{"key": "value"}',
        },
      },
    });

    await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
    });

    const skillMd = await git(
      ["show", "published-skills:skills/my-skill/SKILL.md"],
      repoDir
    );
    expect(skillMd).toContain("Detailed instructions");

    const helper = await git(
      ["show", "published-skills:skills/my-skill/helper.py"],
      repoDir
    );
    expect(helper).toContain('print("hello")');

    const config = await git(
      ["show", "published-skills:skills/my-skill/config.json"],
      repoDir
    );
    expect(config).toContain('"key": "value"');
  });

  test("throws when no skills are found", async () => {
    const repoDir = join(tempDir, "repo");
    const bareDir = join(tempDir, "repo-bare");
    await mkdir(repoDir);
    await mkdir(bareDir);
    await git(["init"], repoDir);
    await git(["config", "user.email", "test@test.com"], repoDir);
    await git(["config", "user.name", "Test"], repoDir);
    await writeFile(join(repoDir, "README.md"), "# Empty");
    await git(["add", "."], repoDir);
    await git(["commit", "-m", "initial"], repoDir);
    await createBareRemote(bareDir, repoDir);

    expect(
      publishSkills({ projectDir: repoDir, branch: "published-skills" })
    ).rejects.toThrow("No skills found");
  });

  test("throws when specified skill is not found", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    await createTestRepo(repoDir, {
      "skill-a": { description: "Skill A", content: "# Skill A" },
    });

    expect(
      publishSkills({
        projectDir: repoDir,
        branch: "published-skills",
        skillName: "nonexistent",
      })
    ).rejects.toThrow('Skill "nonexistent" not found');
  });

  test("uses custom commit message when provided", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    await createTestRepo(repoDir, {
      "my-skill": { description: "Test", content: "# Test" },
    });

    await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
      message: "Custom publish message",
    });

    const log = await git(
      ["log", "--format=%s", "published-skills", "-1"],
      repoDir
    );
    expect(log).toBe("Custom publish message");
  });

  test("pushes the published branch to the remote", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    const bareDir = await createTestRepo(repoDir, {
      "my-skill": { description: "Test", content: "# Test" },
    });

    const result = await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
    });

    const remoteCommit = await git(
      ["rev-parse", "published-skills"],
      bareDir
    );
    expect(remoteCommit).toBe(result.commitSha);

    const content = await git(
      ["show", "published-skills:skills/my-skill/SKILL.md"],
      bareDir
    );
    expect(content).toContain("name: my-skill");
  });

  test("force-pushes updated branch to the remote", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    const bareDir = await createTestRepo(repoDir, {
      "my-skill": { description: "Original", content: "# Original" },
    });

    await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
    });

    await writeFile(
      join(repoDir, "skills/my-skill/SKILL.md"),
      "---\nname: my-skill\ndescription: Updated\n---\n\n# Updated\n"
    );

    const result = await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
    });

    const remoteCommit = await git(
      ["rev-parse", "published-skills"],
      bareDir
    );
    expect(remoteCommit).toBe(result.commitSha);
  });

  test("does not affect the current working branch", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    await createTestRepo(repoDir, {
      "my-skill": { description: "Test", content: "# Test" },
    });

    const branchBefore = await git(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      repoDir
    );

    await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
    });

    const branchAfter = await git(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      repoDir
    );
    expect(branchAfter).toBe(branchBefore);

    const status = await git(["status", "--porcelain"], repoDir);
    expect(status).toBe("");
  });
});
