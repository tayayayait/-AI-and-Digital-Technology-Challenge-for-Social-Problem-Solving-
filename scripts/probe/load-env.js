import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

dotenv.config({ path: path.join(projectRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

export const readRequiredEnv = (...names) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  throw new Error(`Set ${names.join(" or ")} in .env.local or .env before running this probe.`);
};
