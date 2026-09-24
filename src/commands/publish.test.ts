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

async function writeSkill(
  repoDir: string,
  name: string,
  fixture: SkillFixture
): Promise<void> {
  const skillDir = join(repoDir, "skills", name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${fixture.description}\n---\n\n${fixture.content}\n`
  );
  if (fixture.extraFiles) {
    for (const [filename, fileContent] of Object.entries(fixture.extraFiles)) {
      await writeFile(join(skillDir, filename), fileContent);
    }
  }
}

async function cloneWorkingCopy(
  bareDir: string,
  destDir: string
): Promise<void> {
  await git(["clone", bareDir, destDir], tmpdir());
  await git(["config", "user.email", "test@test.com"], destDir);
  await git(["config", "user.name", "Test"], destDir);
}

async function skillNamesOnBranch(
  cwd: string,
  branch: string
): Promise<string[]> {
  const listing = await git(["ls-tree", "--name-only", `${branch}:skills`], cwd);
  return listing.split("\n").filter(Boolean).sort();
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
    await writeSkill(dir, name, skill);
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

  test("updates existing remote branch without --force", async () => {
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

  test("preserves existing skills when publishing a single skill to an existing branch", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    await createTestRepo(repoDir, {
      "skill-a": { description: "Skill A", content: "# Skill A" },
      "skill-b": { description: "Skill B", content: "# Skill B" },
    });

    await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
      skillName: "skill-a",
    });

    await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
      skillName: "skill-b",
    });

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

  test("updates a skill while preserving others on the branch", async () => {
    const repoDir = join(tempDir, "repo");
    await mkdir(repoDir);
    await createTestRepo(repoDir, {
      "skill-a": { description: "Skill A", content: "# Skill A" },
      "skill-b": { description: "Skill B", content: "# Skill B" },
    });

    await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
    });

    await writeFile(
      join(repoDir, "skills/skill-a/SKILL.md"),
      "---\nname: skill-a\ndescription: Skill A Updated\n---\n\n# Skill A Updated\n"
    );

    await publishSkills({
      projectDir: repoDir,
      branch: "published-skills",
      skillName: "skill-a",
    });

    const skillA = await git(
      ["show", "published-skills:skills/skill-a/SKILL.md"],
      repoDir
    );
    expect(skillA).toContain("Skill A Updated");

    const skillB = await git(
      ["show", "published-skills:skills/skill-b/SKILL.md"],
      repoDir
    );
    expect(skillB).toContain("name: skill-b");
  });

  test("stale local branch ref does not drop a skill published from another clone", async () => {
    const repoA = join(tempDir, "clone-a");
    await mkdir(repoA);
    const bareDir = await createTestRepo(repoA, {
      "seed-api-data": { description: "Seed", content: "# Seed" },
      "pr-review": { description: "Review", content: "# Review" },
    });
    const branch = "harsh/skills";

    await publishSkills({
      projectDir: repoA,
      branch,
      skillName: "seed-api-data",
    });
    const seedTip = await git(["rev-parse", branch], repoA);

    const repoB = join(tempDir, "clone-b");
    await cloneWorkingCopy(bareDir, repoB);
    await git(["fetch", "origin", `${branch}:${branch}`], repoB);
    expect(await git(["rev-parse", `refs/heads/${branch}`], repoB)).toBe(
      seedTip
    );

    await writeSkill(repoA, "seed-api-data", {
      description: "Seed",
      content: "# Seed updated",
    });
    await publishSkills({
      projectDir: repoA,
      branch,
      skillName: "pr-review",
    });
    const remoteAfterA = await git(["rev-parse", branch], bareDir);

    await writeSkill(repoB, "pr-review", {
      description: "Review",
      content: "# Review from B",
    });
    const result = await publishSkills({
      projectDir: repoB,
      branch,
      skillName: "pr-review",
    });

    expect(await skillNamesOnBranch(bareDir, branch)).toEqual([
      "pr-review",
      "seed-api-data",
    ]);
    const parent = await git(["rev-parse", `${result.commitSha}^`], repoB);
    expect(parent).toBe(remoteAfterA);
  });

  test("publish from clone with no local branch ref does not orphan the remote", async () => {
    const repoA = join(tempDir, "clone-a");
    await mkdir(repoA);
    const bareDir = await createTestRepo(repoA, {
      "skill-a": { description: "A", content: "# A" },
      "skill-b": { description: "B", content: "# B" },
      "skill-c": { description: "C", content: "# C" },
    });
    const branch = "published-skills";

    await publishSkills({ projectDir: repoA, branch });
    const remoteTip = await git(["rev-parse", branch], bareDir);

    const repoB = join(tempDir, "clone-b");
    await cloneWorkingCopy(bareDir, repoB);
    await expect(
      git(["rev-parse", "--verify", `refs/heads/${branch}`], repoB)
    ).rejects.toThrow();

    await writeSkill(repoB, "foo", { description: "Foo", content: "# Foo" });
    const result = await publishSkills({
      projectDir: repoB,
      branch,
      skillName: "foo",
    });

    expect(await skillNamesOnBranch(bareDir, branch)).toEqual([
      "foo",
      "skill-a",
      "skill-b",
      "skill-c",
    ]);
    const parent = await git(["rev-parse", `${result.commitSha}^`], repoB);
    expect(parent).toBe(remoteTip);
    const parentCount = await git(
      ["rev-list", "--count", result.commitSha],
      repoB
    );
    expect(Number(parentCount)).toBeGreaterThan(1);
  });

  test("publish without -s keeps remote-only skills not in the working copy", async () => {
    const repoA = join(tempDir, "clone-a");
    await mkdir(repoA);
    const bareDir = await createTestRepo(repoA, {
      "skill-a": { description: "A", content: "# A" },
      "remote-only": { description: "Remote", content: "# Remote" },
    });
    const branch = "published-skills";

    await publishSkills({ projectDir: repoA, branch });

    const repoB = join(tempDir, "clone-b");
    await cloneWorkingCopy(bareDir, repoB);
    await rm(join(repoB, "skills/remote-only"), { recursive: true, force: true });
    await writeSkill(repoB, "skill-local", {
      description: "Local",
      content: "# Local",
    });

    await publishSkills({ projectDir: repoB, branch });

    expect(await skillNamesOnBranch(bareDir, branch)).toEqual([
      "remote-only",
      "skill-a",
      "skill-local",
    ]);
  });

  test("push --force-with-lease fails when remote moved after fetch", async () => {
    const repoA = join(tempDir, "clone-a");
    await mkdir(repoA);
    const bareDir = await createTestRepo(repoA, {
      "skill-a": { description: "A", content: "# A" },
      "skill-b": { description: "B", content: "# B" },
    });
    const branch = "published-skills";

    await publishSkills({
      projectDir: repoA,
      branch,
      skillName: "skill-a",
    });
    const remoteBeforeRace = await git(["rev-parse", branch], bareDir);

    const repoB = join(tempDir, "clone-b");
    await cloneWorkingCopy(bareDir, repoB);
    await writeSkill(repoB, "skill-b", { description: "B", content: "# B" });

    await expect(
      publishSkills({
        projectDir: repoB,
        branch,
        skillName: "skill-b",
        onAfterFetch: async () => {
          await publishSkills({
            projectDir: repoA,
            branch,
            skillName: "skill-a",
            message: "Concurrent update from A",
          });
        },
      })
    ).rejects.toThrow(
      `Remote branch ${branch} moved since fetch. Refusing to overwrite. Re-run publish.`
    );

    expect(await git(["rev-parse", branch], bareDir)).not.toBe(
      remoteBeforeRace
    );
    expect(await skillNamesOnBranch(bareDir, branch)).toEqual(["skill-a"]);
    await expect(
      git(["show", `${branch}:skills/skill-b/SKILL.md`], bareDir)
    ).rejects.toThrow();
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
