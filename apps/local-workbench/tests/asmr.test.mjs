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

import {
  chooseGroup,
  cueAt,
  mediaUrl,
  parseSubtitle,
  playGroups,
  seKind,
} from "../src/asmr/asmr-media.ts";

const file = (fileId, kind, title, durationSeconds = null) => ({
  type: "file",
  fileId,
  kind,
  title,
  size: 1,
  durationSeconds,
});
const folder = (title, children) => ({ type: "folder", title, children });

test("track files carry ids and video kinds, and bad ids are refused", () => {
  const detail = (track) => ({ work: work(), tracks: [track] });
  assert.deepEqual(validateDetail(detail(file(7, "video", "PV.mp4"))).tracks, [
    file(7, "video", "PV.mp4"),
  ]);
  const unopenable = file(null, "audio", "a.wav");
  assert.equal(validateDetail(detail(unopenable)).tracks[0].fileId, null);
  for (const bad of [0, -1, 1.5, "7"])
    assert.throws(() => validateDetail(detail(file(bad, "audio", "a.wav"))));
});

test("files group by folder and find their subtitles next to them first", () => {
  const groups = playGroups([
    folder("字幕", [file(9, "text", "01.lrc")]),
    folder("WAV", [
      file(1, "audio", "01.wav", 60),
      file(2, "text", "01.wav.vtt"),
      file(3, "audio", "02.wav"),
      file(null, "audio", "03.wav"),
      file(4, "image", "cover.png"),
    ]),
    file(5, "video", "PV.mp4"),
  ]);
  assert.deepEqual(
    groups.map((group) => [group.path, group.items.map((item) => item.fileId)]),
    [
      [["WAV"], [1, 3]],
      [[], [5]],
    ],
  );
  assert.equal(groups[0].items[0].subtitleFileId, 2);
  assert.equal(groups[0].items[1].subtitleFileId, null);
  // Elsewhere in the work, by name, when nothing sits next to the file.
  const elsewhere = playGroups([
    folder("字幕", [file(9, "text", "01.lrc")]),
    folder("MP3", [file(1, "audio", "01.mp3")]),
  ]);
  assert.equal(elsewhere[0].items[0].subtitleFileId, 9);
});

test("version folders prefer Chinese, subtitles and originals, and ask on ties", () => {
  const version = (path, extension, subtitled) => ({
    path,
    items: [
      {
        fileId: 1,
        title: `01.${extension}`,
        kind: "audio",
        durationSeconds: null,
        subtitleFileId: subtitled ? 2 : null,
      },
    ],
  });
  const japanese = version(["日本語", "WAV"], "wav", false);
  const chineseMp3 = version(["中文", "MP3"], "mp3", true);
  const chineseWav = version(["中文", "WAV"], "wav", true);
  const bonus = version(["中文", "特典"], "wav", true);
  assert.equal(
    chooseGroup([japanese, chineseMp3, chineseWav, bonus], null).group,
    chineseWav,
  );
  const withSe = version(["SEあり"], "wav", false);
  const withoutSe = version(["SEなし"], "wav", false);
  assert.equal(seKind(withSe), "with");
  assert.equal(seKind(withoutSe), "without");
  assert.equal(seKind(japanese), null);
  assert.deepEqual(chooseGroup([withSe, withoutSe], null).choices, [
    withSe,
    withoutSe,
  ]);
  assert.equal(chooseGroup([withSe, withoutSe], "without").group, withoutSe);
  assert.equal(chooseGroup([withSe], "without").group, withSe);
  assert.equal(chooseGroup([], null).group, null);
});

test("VTT, SRT and LRC subtitles parse into ordered cues", () => {
  const vtt = parseSubtitle(
    "﻿WEBVTT\r\n\r\n1\r\n00:00:01.500 --> 00:00:03.000 align:start\r\n<v 甲>你好&amp;欢迎\r\n第二行\r\n\r\nNOTE skip\r\n\r\n00:04.000 --> 00:05.000\r\n再见\r\n",
    "vtt",
  );
  assert.deepEqual(vtt, [
    { start: 1.5, end: 3, text: "你好&欢迎\n第二行" },
    { start: 4, end: 5, text: "再见" },
  ]);
  assert.deepEqual(
    parseSubtitle("1\n00:00:02,000 --> 00:00:04,500\n{\\an8}上方\n", "srt"),
    [{ start: 2, end: 4.5, text: "上方" }],
  );
  assert.deepEqual(
    parseSubtitle(
      "[ar:合成]\n[00:05.00]第二句\n[00:01.50][00:09.00]重复句\n[00:12:50]冒号分隔\n",
      "lrc",
    ),
    [
      { start: 1.5, end: 5, text: "重复句" },
      { start: 5, end: 9, text: "第二句" },
      { start: 9, end: 12.5, text: "重复句" },
      { start: 12.5, end: 20.5, text: "冒号分隔" },
    ],
  );
  assert.deepEqual(parseSubtitle("not a subtitle", "vtt"), []);
  const cues = [
    { start: 1, end: 2, text: "a" },
    { start: 5, end: 9, text: "b" },
  ];
  assert.equal(cueAt(cues, 0.5), -1);
  assert.equal(cueAt(cues, 1), 0);
  assert.equal(cueAt(cues, 3), -1);
  assert.equal(cueAt(cues, 8.9), 1);
  assert.equal(cueAt([], 1), -1);
});

test("media addresses carry only work and file ids", () => {
  assert.match(
    mediaUrl(1683351, 1965843),
    /^(http:\/\/asmrmedia\.localhost|asmrmedia:\/\/localhost)\/1683351-1965843$/,
  );
});
