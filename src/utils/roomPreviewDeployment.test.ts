// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("retains previous versioned assets and uploads the shell after them", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const upload = workflow.split("\n").find(line => line.includes("aws s3 sync dist/"));
  expect(upload).toBeDefined();
  expect(upload).not.toContain("--delete");
  expect(upload).toContain("--exclude index.html");
  expect(workflow.indexOf("aws s3 sync dist/")).toBeLessThan(workflow.indexOf("aws s3 cp dist/index.html"));
});

it("preserves the homepage title and absolute Vite entry paths", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  expect(html).toContain("<title>Meet me — 스마트 일정 조율</title>");
  expect(html).toContain('src="/src/main.tsx"');
  expect(html).not.toContain("og:image");
});
