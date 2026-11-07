import test from "node:test";
import assert from "node:assert/strict";
import {
  asmrErrorMessage,
  chineseLabel,
  formatDuration,
  formatSize,
  parseWorkInput,
  validateCover,
  validateDetail,
  validateIndex,
  validatePage,
  validateWork,
  workCodeFor,
} from "../src/asmr/asmr-types.ts";

const work = (overrides = {}) => ({
  id: 1683351,
  code: "RJ01683351",
  title: "合成作品",
  circle: { id: 7, name: "合成社团" },
  voiceActors: [
    { id: "2072e5eb-e1e1-5fbc-8af5-d118ef8c1d20", name: "合成声优" },
  ],
  tags: [{ id: 4, name: "亲热/甜蜜" }],
  release: "2026-10-02",
  added: "2026-11-01",
  downloads: 10,
  rating: 4.5,
  ratingCount: 3,
  reviewCount: 0,
  price: 330,
  durationSeconds: 2717,
  hasSubtitle: true,
  editions: [
    { code: "RJ01671143", lang: "JPN", label: "日本語" },
    { code: "RJ01683351", lang: "CHI_HANS", label: "简体中文" },
  ],
  ...overrides,
});

test("works and pages accept only the native contract", () => {
  assert.deepEqual(validateWork(work()), work());
  const page = validatePage({
    works: [work()],
    page: 1,
    pageSize: 24,
    total: 1,
  });
  assert.equal(page.works.length, 1);
  for (const bad of [
    { id: 0 },
    { code: "../x" },
    { title: "" },
    { voiceActors: [{ id: "a/b", name: "x" }] },
    { release: "2026/10/02" },
    { rating: 7 },
    { downloads: -1 },
    { editions: [{ code: "x", lang: "JPN", label: "" }] },
  ])
    assert.throws(() => validateWork(work(bad)), {
      code: "ASMR_RESPONSE_INVALID",
    });
  assert.throws(() =>
    validatePage({
      works: Array(101).fill(work()),
      page: 1,
      pageSize: 24,
      total: 1,
    }),
  );
});

test("indexes, track trees and covers are validated", () => {
  assert.deepEqual(validateIndex([{ id: "509", name: "3D作品", count: 37 }]), [
    { id: "509", name: "3D作品", count: 37 },
  ]);
  assert.throws(() => validateIndex([{ id: "../x", name: "x", count: 1 }]));
  const detail = validateDetail({
    work: work(),
    tracks: [
      {
        type: "folder",
        title: "WAV",
        children: [
          {
            type: "file",
            kind: "audio",
            title: "01.wav",
            size: 10,
            durationSeconds: 61.5,
          },
        ],
      },
    ],
  });
  assert.equal(detail.tracks[0].children[0].durationSeconds, 61.5);
  assert.throws(() =>
    validateDetail({
      work: work(),
      tracks: [{ type: "file", kind: "exe", title: "x" }],
    }),
  );
  let deep = { type: "file", kind: "audio", title: "a" };
  for (let i = 0; i < 20; i++)
    deep = { type: "folder", title: "f", children: [deep] };
  assert.throws(() => validateDetail({ work: work(), tracks: [deep] }));
  assert.equal(validateCover({ id: 5, dataUrl: null }, 5), null);
  assert.equal(
    validateCover({ id: 5, dataUrl: "data:image/jpeg;base64,/9j/" }, 5),
    "data:image/jpeg;base64,/9j/",
  );
  assert.throws(() => validateCover({ id: 6, dataUrl: null }, 5));
  assert.throws(() =>
    validateCover({ id: 5, dataUrl: "https://example.invalid/a.jpg" }, 5),
  );
});

test("work inputs, codes and display helpers", () => {
  assert.equal(parseWorkInput("RJ01683351"), 1683351);
  assert.equal(parseWorkInput(" rj1683351 "), 1683351);
  assert.equal(parseWorkInput("https://www.asmr.one/work/RJ01683351"), 1683351);
  assert.equal(
    parseWorkInput("https://www.asmr.one/work/1683351?x=1"),
    1683351,
  );
  assert.equal(parseWorkInput("1683351"), null);
  assert.equal(parseWorkInput("耳舐め"), null);
  assert.equal(workCodeFor(1683351), "RJ01683351");
  assert.equal(workCodeFor(123456), "RJ123456");
  assert.equal(formatDuration(2717), "45:17");
  assert.equal(formatDuration(3725), "1:02:05");
  assert.equal(formatDuration(null), null);
  assert.equal(formatSize(1536), "2 KB");
  assert.equal(formatSize(5 * 1024 * 1024), "5.0 MB");
  assert.equal(chineseLabel(work()), "简中");
  assert.equal(chineseLabel(work({ editions: [], hasSubtitle: true })), "字幕");
  assert.equal(chineseLabel(work({ editions: [], hasSubtitle: false })), null);
  assert.match(
    asmrErrorMessage({ code: "ASMR_NETWORK" }),
    /连接 asmr\.one 失败/,
  );
  assert.equal(
    asmrErrorMessage(new Error("C:/private")),
    "读取失败，请稍后重试。",
  );
});
