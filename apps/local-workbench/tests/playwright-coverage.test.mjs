import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Playwright only runs the files listed in `testMatch`. A spec that is added
// without a list entry passes CI silently because it never runs.
test("every browser spec is listed in the Playwright configuration", () => {
  const config = readFileSync(
    new URL("../playwright.config.ts", import.meta.url),
    "utf8",
  );
  const listed = new Set(
    [...config.matchAll(/"\*\*\/([\w.-]+\.spec\.ts)"/g)].map(
      (match) => match[1],
    ),
  );
  const specs = readdirSync(new URL(".", import.meta.url)).filter((name) =>
    name.endsWith(".spec.ts"),
  );
  assert.ok(specs.length > 0);
  assert.deepEqual(
    specs.filter((name) => !listed.has(name)),
    [],
    "add these specs to testMatch in playwright.config.ts",
  );
});
