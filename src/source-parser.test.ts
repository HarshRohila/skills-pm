import { describe, expect, test } from "bun:test";
import { parseSource } from "./source-parser.ts";

describe("parseSource", () => {
  test("parses owner/repo shorthand", () => {
    expect(parseSource("vercel-labs/agent-skills")).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
    });
  });

  test("parses full GitHub HTTPS URL", () => {
    expect(
      parseSource("https://github.com/vercel-labs/agent-skills")
    ).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
    });
  });

  test("parses GitHub URL with trailing slash", () => {
    expect(
      parseSource("https://github.com/vercel-labs/agent-skills/")
    ).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
    });
  });

  test("parses GitHub URL with .git suffix", () => {
    expect(
      parseSource("https://github.com/vercel-labs/agent-skills.git")
    ).toEqual({
      owner: "vercel-labs",
      repo: "agent-skills",
    });
  });

  test("throws on empty string", () => {
    expect(() => parseSource("")).toThrow();
  });

  test("throws on single word (no slash)", () => {
    expect(() => parseSource("just-a-name")).toThrow();
  });

  test("throws on too many segments", () => {
    expect(() => parseSource("a/b/c")).toThrow();
  });
});
