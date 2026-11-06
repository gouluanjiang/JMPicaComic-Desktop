import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_ON_STARTUP_KEY,
  formatPublishedAt,
  readCheckOnStartup,
  updateErrorMessage,
  validateUpdateCheck,
  writeCheckOnStartup,
} from "../src/updater.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

test("update responses keep only validated versions, notes and dates", () => {
  assert.deepEqual(
    validateUpdateCheck({ available: false, currentVersion: "1.1.0" }),
    { available: false, currentVersion: "1.1.0" },
  );
  assert.deepEqual(
    validateUpdateCheck({
      available: true,
      currentVersion: "1.1.0",
      version: "1.2.0",
      notes: "  ",
      publishedAt: 1793950922,
      extra: "ignored",
    }),
    {
      available: true,
      currentVersion: "1.1.0",
      version: "1.2.0",
      notes: null,
      publishedAt: 1793950922,
    },
  );
  const long = validateUpdateCheck({
    available: true,
    currentVersion: "1.1.0",
    version: "1.2.0-rc.1",
    notes: "说".repeat(9000),
    publishedAt: null,
  });
  assert.equal(long.notes.length, 8000);
  for (const bad of [
    null,
    "1.2.0",
    { available: true, currentVersion: "1.1.0" },
    { available: true, currentVersion: "1.1.0", version: "../latest" },
    { available: false, currentVersion: "latest" },
    { available: "yes", currentVersion: "1.1.0", version: "1.2.0" },
    {
      available: true,
      currentVersion: "1.1.0",
      version: "1.2.0",
      notes: 5,
    },
    {
      available: true,
      currentVersion: "1.1.0",
      version: "1.2.0",
      publishedAt: 1.5,
    },
  ])
    assert.throws(() => validateUpdateCheck(bad), {
      code: "UPDATE_RESPONSE_INVALID",
    });
});

test("startup checks default on and remember an explicit opt-out", () => {
  const storage = memoryStorage();
  assert.equal(readCheckOnStartup(storage), true);
  assert.equal(writeCheckOnStartup(false, storage), true);
  assert.equal(storage.values.get(CHECK_ON_STARTUP_KEY), "false");
  assert.equal(readCheckOnStartup(storage), false);
  writeCheckOnStartup(true, storage);
  assert.equal(readCheckOnStartup(storage), true);
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readCheckOnStartup(broken), true);
  assert.equal(writeCheckOnStartup(false, broken), false);
});

test("update errors map closed codes to guidance and hide everything else", () => {
  assert.match(
    updateErrorMessage({ code: "UPDATE_DOWNLOADS_ACTIVE" }),
    /下载队列正在运行/,
  );
  assert.match(
    updateErrorMessage({ code: "UPDATE_SIGNATURE_INVALID" }),
    /签名校验/,
  );
  for (const other of [
    { code: "C:/private/path" },
    new Error("https://example.invalid/secret"),
    "raw",
    null,
  ])
    assert.equal(updateErrorMessage(other), "更新失败，请稍后重试。");
});

test("publication dates show the local calendar day", () => {
  assert.equal(formatPublishedAt(null), null);
  const seconds = Math.floor(new Date(2026, 10, 6, 12).getTime() / 1000);
  assert.equal(formatPublishedAt(seconds), "2026-11-06");
});
