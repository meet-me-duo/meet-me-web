import { mkdir, writeFile } from "node:fs/promises";

const source = process.env.OPENAPI_URL ?? "https://api.meet-me.co.kr/v3/api-docs";
const response = await fetch(source, { headers: { accept: "application/json" } });
if (!response.ok) throw new Error(`OpenAPI snapshot failed: ${response.status} ${response.statusText}`);
const document = await response.json();
await mkdir("openapi", { recursive: true });
await writeFile("openapi/meet-me.openapi.json", `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Saved OpenAPI snapshot from ${source}`);
