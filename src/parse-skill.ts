import matter from "gray-matter";
import { readFile } from "fs/promises";
import { dirname } from "path";

export interface Skill {
  name: string;
  description: string;
  dir: string;
}

export async function parseSkill(skillMdPath: string): Promise<Skill> {
  const content = await readFile(skillMdPath, "utf-8");
  const { data } = matter(content);

  if (!data.name) {
    throw new Error(`SKILL.md at ${skillMdPath} missing required field: name`);
  }
  if (!data.description) {
    throw new Error(
      `SKILL.md at ${skillMdPath} missing required field: description`
    );
  }

  return {
    name: data.name,
    description: data.description,
    dir: dirname(skillMdPath),
  };
}
