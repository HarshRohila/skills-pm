import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { cloneRepo, getOriginSource, type CloneOptions } from "./git.ts";
import { join } from "path";
import { mkdtemp, rm, readdir, stat } from "fs/promises";
import { tmpdir } from "os";
import { execFileSync } from "child_process";

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
