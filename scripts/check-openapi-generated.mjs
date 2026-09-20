import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";

const temporary = "src/api/schema.check.d.ts";
execFileSync(process.execPath, ["node_modules/openapi-typescript/bin/cli.js", "openapi/meet-me.openapi.json", "-o", temporary], { stdio: "inherit" });
const [expected, actual] = await Promise.all([readFile("src/api/schema.d.ts", "utf8"), readFile(temporary, "utf8")]);
await rm(temporary);
if (expected !== actual) throw new Error("Generated API types are stale. Run pnpm api:generate.");
console.log("Generated API types match the checked-in OpenAPI snapshot.");
