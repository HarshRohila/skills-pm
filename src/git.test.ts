import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { cloneRepo, type CloneOptions } from "./git.ts";
import { join } from "path";
import { mkdtemp, rm, readdir, stat } from "fs/promises";
import { tmpdir } from "os";

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
