import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { calls, installAsmr, openAsmr } from "./asmr-fixture.ts";

// The desktop app serves media from http://asmrmedia.localhost on Windows.
test.use({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
});

/** A silent 8 kHz mono WAV, long enough to seek around in. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const length = rate * seconds;
  const wav = Buffer.alloc(44 + length, 128);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(length, 40);
  return wav;
}

const WAV = silentWav(30);

/** Serves synthetic media; the video file is missing to exercise errors. */
async function serveMedia(page: Page) {
  const requested: string[] = [];
  await page.route("http://asmrmedia.localhost/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    requested.push(path);
    if (path === "/1000003-41") return route.fulfill({ status: 404 });
    // Answer like the native protocol: one byte range per request.
    const range = /^bytes=(\d+)-(\d*)$/.exec(
      route.request().headers()["range"] ?? "bytes=0-",
    );
    const start = Number(range?.[1] ?? 0);
    const end = Math.min(
      WAV.length - 1,
      range?.[2] ? Number(range[2]) : WAV.length - 1,
    );
    return route.fulfill({
      status: 206,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Range": `bytes ${start}-${end}/${WAV.length}`,
        "Accept-Ranges": "bytes",
      },
      body: WAV.subarray(start, end + 1),
    });
  });
  return requested;
}

async function openPlayerWork(page: Page) {
  await page
    .getByTestId("asmr-works")
    .getByRole("button", { name: "查看 合成音声作品 3", exact: true })
    .click();
  await expect(page.getByTestId("asmr-detail")).toContainText("合成音声作品 3");
}

const media = (page: Page) => page.getByTestId("asmr-media");
const playButton = (page: Page) => page.getByTestId("asmr-play");

test("a work plays its chosen version with subtitles, keys, a queue and remembered places", async ({
  page,
}) => {
  const errors = await installAsmr(page);
  const requested = await serveMedia(page);
  await openAsmr(page);
  await openPlayerWork(page);
  const detail = page.getByTestId("asmr-detail");

  // Two equally good versions differ only by sound effects: the listener picks.
  await detail.getByTestId("asmr-play-work").click();
  const choice = detail.getByTestId("asmr-version-choice");
  await expect(choice.getByRole("button")).toHaveText([
    /中文字幕版 \/ SEあり/,
    /中文字幕版 \/ SEなし/,
  ]);
  await choice.getByRole("button", { name: /SEなし/ }).click();
  await expect(choice).toBeHidden();
  await expect(page.getByTestId("asmr-now-title")).toHaveText("01.wav");
  await expect(media(page)).toHaveAttribute(
    "src",
    "http://asmrmedia.localhost/1000003-21",
  );
  await expect(playButton(page)).toHaveAttribute("aria-label", "暂停");
  expect((await calls(page, "asmr_subtitle")).map((call) => call.args)).toEqual(
    [{ workId: 1000003, fileId: 22 }],
  );
  // The playing file's folder opens and marks it.
  await expect(detail.locator('[aria-current="true"]')).toHaveAttribute(
    "aria-label",
    "播放 01.wav",
  );
  await expect(detail.getByRole("button", { name: "播放 01.wav" })).toHaveCount(
    1,
  );

  // Space pauses; arrow keys seek and the matching subtitle line follows.
  await page.keyboard.press("Space");
  await expect(playButton(page)).toHaveAttribute("aria-label", "播放");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("asmr-time")).toHaveText(/^0:1[01]$/);
  await expect(page.getByTestId("asmr-bar-cue")).toHaveText("第二句字幕");

  // Moving on saves the place in the file being left.
  await page.keyboard.press("Shift+N");
  await expect(page.getByTestId("asmr-now-title")).toHaveText("02.wav");
  await expect(media(page)).toHaveAttribute(
    "src",
    "http://asmrmedia.localhost/1000003-23",
  );
  await expect(page.getByTestId("asmr-bar-cue")).toHaveText(
    "RJ01000003 · 合成音声作品 3",
  );

  // The full player lists the queue and the subtitles, and seeks from them.
  await page.getByTestId("asmr-expand").click();
  const full = page.getByTestId("asmr-player-full");
  await expect(full).toBeVisible();
  const queue = full.getByTestId("asmr-queue");
  await expect(queue.getByRole("button")).toHaveCount(2);
  await expect(queue.locator("[aria-current]")).toContainText("02.wav");
  await queue.getByRole("button", { name: /01\.wav/ }).click();
  await expect(page.getByTestId("asmr-now-title")).toHaveText("01.wav");
  await expect(page.getByTestId("asmr-time")).toHaveText(/^0:1\d$/);
  await full.getByRole("tab", { name: "字幕" }).click();
  const cues = full.getByTestId("asmr-cues");
  await expect(cues.getByRole("button")).toHaveCount(2);
  await cues.getByRole("button", { name: /第一句字幕/ }).click();
  await expect(full.getByTestId("asmr-current-cue")).toHaveText("第一句字幕");
  await page.keyboard.press("Escape");
  await expect(full).toBeHidden();

  // The sleep timer counts down and can be turned off.
  await page.getByTestId("asmr-sleep").selectOption("15");
  await expect(page.getByTestId("asmr-sleep-left")).toHaveText(/^1[45]:\d\d$/);
  await page.getByTestId("asmr-sleep").selectOption("off");
  await expect(page.getByTestId("asmr-sleep-left")).toBeHidden();

  // A file the media element cannot load reports why and offers a retry.
  await detail.getByRole("button", { name: "播放 PV.mp4" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "无法在线播放这个文件（MP4）",
  );
  await expect(page.getByRole("alert").getByRole("button")).toHaveText("重试");
  await page.getByRole("button", { name: "停止并关闭播放器" }).click();
  await expect(page.getByTestId("asmr-bar")).toBeHidden();

  // Files without an address are listed but cannot be played.
  await expect(
    detail.getByRole("button", { name: "播放 missing.wav" }),
  ).toHaveCount(0);
  await expect(detail).toContainText("missing.wav");

  // The remembered sound-effect choice decides next time, and the saved
  // place in 02.wav is offered.
  await page.reload();
  await openAsmr(page);
  await openPlayerWork(page);
  await expect(detail.getByTestId("asmr-resume")).toHaveText("继续：PV.mp4");
  await detail.getByTestId("asmr-play-work").click();
  await expect(detail.getByTestId("asmr-version-choice")).toBeHidden();
  await expect(media(page)).toHaveAttribute(
    "src",
    "http://asmrmedia.localhost/1000003-21",
  );
  // Only file ids ever reach the media protocol.
  expect(requested.every((path) => /^\/1000003-\d+$/.test(path))).toBeTruthy();
  expect(errors).toEqual([]);
});

test("playback continues in the comic section and the bar returns with ASMR", async ({
  page,
}) => {
  await installAsmr(page);
  await serveMedia(page);
  await openAsmr(page);
  await openPlayerWork(page);
  await page
    .getByTestId("asmr-detail")
    .getByRole("button", { name: "播放 bonus.mp3" })
    .click();
  await expect(playButton(page)).toHaveAttribute("aria-label", "暂停");
  await page.getByTestId("section-comic").click();
  await expect(page.getByTestId("asmr-workspace")).toBeHidden();
  // Hidden but still playing; Space belongs to the comic pages again.
  await expect
    .poll(() =>
      media(page).evaluate((element: HTMLMediaElement) => element.paused),
    )
    .toBe(false);
  await page.keyboard.press("Space");
  expect(
    await media(page).evaluate((element: HTMLMediaElement) => element.paused),
  ).toBe(false);
  await page.getByTestId("section-asmr").click();
  await expect(page.getByTestId("asmr-now-title")).toHaveText("bonus.mp3");
  await page.keyboard.press("Space");
  await expect(playButton(page)).toHaveAttribute("aria-label", "播放");
});
