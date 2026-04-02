import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { cloneRepo, getOriginSource, type CloneOptions } from "./git.ts";
import { join } from "path";
import { mkdtemp, rm, readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-pm-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("cloneRepo", () => {
  test("clones a public repo to cache dir (default branch)", async () => {
    const cacheDir = join(tempDir, "cache");
    const result = await cloneRepo(
      { owner: "vercel-labs", repo: "skills" },
      { cacheBase: cacheDir }
    );

    expect(result).toStartWith(cacheDir);
    const entries = await readdir(result);
    expect(entries).toContain("README.md");
  }, 30_000);

  test("includes ref in cache path when specified", async () => {
    const cacheDir = join(tempDir, "cache");
    const result = await cloneRepo(
      { owner: "vercel-labs", repo: "skills" },
      { cacheBase: cacheDir, ref: "main" }
    );

    expect(result).toContain("/main");
    const entries = await readdir(result);
    expect(entries).toContain("README.md");
  }, 30_000);

  test("skips clone if cache directory already exists", async () => {
    const cacheDir = join(tempDir, "cache");

    const first = await cloneRepo(
      { owner: "vercel-labs", repo: "skills" },
      { cacheBase: cacheDir }
    );
    const s1 = await stat(first);

    const second = await cloneRepo(
      { owner: "vercel-labs", repo: "skills" },
      { cacheBase: cacheDir }
    );

    expect(first).toBe(second);
    const s2 = await stat(second);
    // Same directory, not re-cloned
    expect(s1.birthtimeMs).toBe(s2.birthtimeMs);
  }, 30_000);

  test("throws on nonexistent repo", async () => {
    const cacheDir = join(tempDir, "cache");
    expect(
      cloneRepo(
        { owner: "nonexistent-owner-xyz", repo: "nonexistent-repo-xyz" },
        { cacheBase: cacheDir }
      )
    ).rejects.toThrow();
  }, 30_000);
});

async function gitAsync(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createLocalRemoteWithBranch(
  bareDir: string,
  branch: string,
  fileContent: string
): Promise<void> {
  const workDir = bareDir + "-work";
  await mkdir(bareDir, { recursive: true });
  await mkdir(workDir, { recursive: true });
  await gitAsync(["init", "--bare"], bareDir);
  await gitAsync(["clone", bareDir, workDir], bareDir);
  await gitAsync(["config", "user.email", "test@test.com"], workDir);
  await gitAsync(["config", "user.name", "Test"], workDir);
  await gitAsync(["checkout", "-b", branch], workDir);
  await writeFile(join(workDir, "data.txt"), fileContent);
  await gitAsync(["add", "."], workDir);
  await gitAsync(["commit", "-m", "initial"], workDir);
  await gitAsync(["push", "origin", branch], workDir);
  await rm(workDir, { recursive: true, force: true });
}

async function pushUpdateToBranch(
  bareDir: string,
  branch: string,
  fileContent: string
): Promise<void> {
  const workDir = bareDir + "-work2";
  await mkdir(workDir, { recursive: true });
  await gitAsync(["clone", "-b", branch, bareDir, workDir], bareDir);
  await gitAsync(["config", "user.email", "test@test.com"], workDir);
  await gitAsync(["config", "user.name", "Test"], workDir);
  await writeFile(join(workDir, "data.txt"), fileContent);
  await gitAsync(["add", "."], workDir);
  await gitAsync(["commit", "-m", "update"], workDir);
  await gitAsync(["push", "origin", branch], workDir);
  await rm(workDir, { recursive: true, force: true });
}

describe("cloneRepo cache refresh", () => {
  test("fetches latest when branch has new commits", async () => {
    const bareDir = join(tempDir, "bare-repo");
    const cacheDir = join(tempDir, "cache");

    await createLocalRemoteWithBranch(bareDir, "mybranch", "version-1");

    const source = { owner: "local", repo: "test" };
    const result = await cloneRepo(source, {
      cacheBase: cacheDir,
      ref: "mybranch",
      url: bareDir,
    });

    const content1 = await readFile(join(result, "data.txt"), "utf-8");
    expect(content1).toBe("version-1");

    await pushUpdateToBranch(bareDir, "mybranch", "version-2");

    const result2 = await cloneRepo(source, {
      cacheBase: cacheDir,
      ref: "mybranch",
      url: bareDir,
    });

    expect(result2).toBe(result);
    const content2 = await readFile(join(result2, "data.txt"), "utf-8");
    expect(content2).toBe("version-2");
  });

  test("does not re-fetch for full SHA refs", async () => {
    const bareDir = join(tempDir, "bare-repo");
    const cacheDir = join(tempDir, "cache");

    await createLocalRemoteWithBranch(bareDir, "main", "immutable");

    const source = { owner: "local", repo: "test-sha" };
    const result = await cloneRepo(source, {
      cacheBase: cacheDir,
      ref: "main",
      url: bareDir,
    });

    const sha = await gitAsync(["rev-parse", "HEAD"], result);

    // Manually create a cache dir keyed by the SHA with a marker file
    const shaDir = join(cacheDir, "local", "test-sha", sha);
    await mkdir(shaDir, { recursive: true });
    await gitAsync(["clone", bareDir, shaDir + "-tmp"], bareDir);
    // Use a real git repo at the SHA path
    await rm(shaDir, { recursive: true, force: true });
    await gitAsync(["clone", "-b", "main", bareDir, shaDir], bareDir);
    await writeFile(join(shaDir, "marker.txt"), "original");

    await pushUpdateToBranch(bareDir, "main", "updated-content");

    const result2 = await cloneRepo(source, {
      cacheBase: cacheDir,
      ref: sha,
      url: bareDir,
    });

    expect(result2).toBe(shaDir);
    const marker = await readFile(join(result2, "marker.txt"), "utf-8");
    expect(marker).toBe("original");
  });
});

function initRepoWithOrigin(dir: string, originUrl: string) {
  execFileSync("git", ["init", dir]);
  execFileSync("git", ["remote", "add", "origin", originUrl], { cwd: dir });
}

describe("getOriginSource", () => {
  test("parses HTTPS remote URL", async () => {
    initRepoWithOrigin(
      join(tempDir, "repo"),
      "https://github.com/acme/cool-skills.git"
    );
    const source = await getOriginSource(join(tempDir, "repo"));
    expect(source).toEqual({ owner: "acme", repo: "cool-skills" });
  });

  test("parses HTTPS remote URL without .git suffix", async () => {
    initRepoWithOrigin(
      join(tempDir, "repo"),
      "https://github.com/acme/cool-skills"
    );
    const source = await getOriginSource(join(tempDir, "repo"));
    expect(source).toEqual({ owner: "acme", repo: "cool-skills" });
  });

  test("parses SSH remote URL", async () => {
    initRepoWithOrigin(
      join(tempDir, "repo"),
      "git@github.com:acme/cool-skills.git"
    );
    const source = await getOriginSource(join(tempDir, "repo"));
    expect(source).toEqual({ owner: "acme", repo: "cool-skills" });
  });

  test("throws with helpful message when not in a git repo", async () => {
    const nonGitDir = join(tempDir, "not-a-repo");
    await Bun.write(join(nonGitDir, "file.txt"), "hi");
    expect(getOriginSource(nonGitDir)).rejects.toThrow(
      /No git remote 'origin' found/
    );
  });

  test("throws with helpful message when repo has no origin remote", async () => {
    const dir = join(tempDir, "no-origin");
    execFileSync("git", ["init", dir]);
    expect(getOriginSource(dir)).rejects.toThrow(
      /No git remote 'origin' found/
    );
  });
});
