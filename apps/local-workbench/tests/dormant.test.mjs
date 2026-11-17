import test from "node:test";
import assert from "node:assert/strict";
import { onlyCallbacksChanged } from "../src/dormant.ts";

test("a hidden page skips renders only when nothing but callbacks changed", () => {
  const accounts = [{ source: "JM", sessionId: "a" }];
  const base = { active: false, accounts, density: 7, onOpen: () => {} };
  assert.equal(onlyCallbacksChanged(base, { ...base, onOpen: () => {} }), true);
  // A changed account must reach the hidden page so it can drop pending work.
  assert.equal(
    onlyCallbacksChanged(base, {
      ...base,
      accounts: [{ source: "JM", sessionId: "b" }],
    }),
    false,
  );
  assert.equal(onlyCallbacksChanged(base, { ...base, density: 9 }), false);
  assert.equal(onlyCallbacksChanged(base, { ...base, extra: null }), false);
  assert.equal(
    onlyCallbacksChanged({ ...base, onOpen: undefined }, base),
    false,
  );
});
