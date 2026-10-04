import test from "node:test";
import assert from "node:assert/strict";
import { getInitials, splitGraphemes } from "../src/utils/text";

test("splitGraphemes keeps emoji sequences intact", () => {
  assert.deepEqual(splitGraphemes("👩‍💻A"), ["👩‍💻", "A"]);
});

test("getInitials handles Latin, RTL, emoji, and multi-word names", () => {
  assert.equal(getInitials("Telegram"), "TE");
  assert.equal(getInitials("@канал"), "КА");
  assert.equal(getInitials("علي رضا"), "عر");
  assert.equal(getInitials("👩‍💻 News"), "👩‍💻N");
  assert.equal(getInitials(""), "TG");
});
