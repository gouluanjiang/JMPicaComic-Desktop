import test from "node:test";
import assert from "node:assert/strict";
import { sameDownloadInventory } from "../src/download-types.ts";
import { normalizedWorkDate } from "../src/work-dates.ts";

const inventory = () => ({
  revision: 4,
  libraryRevision: 9,
  rootId: "root",
  items: [
    { source: "JM", workId: "1", libraryEntryId: "a", localFiles: "present" },
    { source: "Pica", workId: "2", libraryEntryId: "b", localFiles: "missing" },
  ],
});

test("a re-read inventory with the same content counts as unchanged", () => {
  assert.equal(sameDownloadInventory(inventory(), inventory()), true);
});

test("any changed inventory field counts as a change", () => {
  const changes = [
    (value) => (value.revision = 5),
    (value) => (value.libraryRevision = 10),
    (value) => (value.rootId = "other"),
    (value) => value.items.pop(),
    (value) => (value.items[1].source = "JM"),
    (value) => (value.items[1].workId = "3"),
    (value) => (value.items[1].libraryEntryId = "c"),
    (value) => (value.items[1].localFiles = "present"),
  ];
  for (const change of changes) {
    const read = inventory();
    change(read);
    assert.equal(sameDownloadInventory(inventory(), read), false);
  }
});

test("repeated date checks give the same answers as the first", () => {
  const values = [
    "2026-11-17",
    "2026-11-17T08:30:00Z",
    "2026-02-30",
    "1970-01-01",
    "2026-11-17T24:00:00Z",
    "2026-11-17 08:30",
    "x".repeat(60),
  ];
  const first = values.map(normalizedWorkDate);
  assert.deepEqual(first, [
    "2026-11-17",
    "2026-11-17T08:30:00Z",
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(values.map(normalizedWorkDate), first);
});
