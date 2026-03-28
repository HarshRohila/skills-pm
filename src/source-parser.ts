export interface ParsedSource {
  owner: string;
  repo: string;
}

export function parseSource(input: string): ParsedSource {
  if (!input) {
    throw new Error("Source cannot be empty");
  }

  // Handle full GitHub URLs
  if (input.startsWith("https://github.com/")) {
    const path = input
      .replace("https://github.com/", "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "");
    return parseShorthand(path);
  }

  return parseShorthand(input);
}

function parseShorthand(path: string): ParsedSource {
  const parts = path.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid source "${path}". Expected format: owner/repo or https://github.com/owner/repo`
    );
  }
  return { owner: parts[0], repo: parts[1] };
}
