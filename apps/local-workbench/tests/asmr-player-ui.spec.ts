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

  // Desktop subtitles are on by default: the window opens for a subtitled
  // file and receives each line with the file title.
  await expect(page.getByTestId("asmr-desktop-lyrics")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect((await calls(page, "asmr_lyrics_open")).length).toBeGreaterThan(0);
  await expect
    .poll(async () => (await calls(page, "asmr_lyrics_line")).at(-1)?.args)
    .toEqual({ text: "第二句字幕", title: "01.wav" });

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
  // A file without subtitles hides the desktop window until the next one.
  await expect
    .poll(async () => (await calls(page, "asmr_lyrics_hide")).length)
    .toBe(1);

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

  // Turning desktop subtitles off closes the window and is remembered.
  await page.getByTestId("asmr-desktop-lyrics").click();
  await expect(page.getByTestId("asmr-desktop-lyrics")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect
    .poll(async () => (await calls(page, "asmr_lyrics_close")).length)
    .toBe(1);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("jmpicacomic.asmr.desktopLyrics"),
    ),
  ).toBe("false");

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

test("the small video can be dragged inside the section and a click opens the player", async ({
  page,
}) => {
  await installAsmr(page);
  await serveMedia(page);
  await openAsmr(page);
  await openPlayerWork(page);
  await page
    .getByTestId("asmr-detail")
    .getByRole("button", { name: "播放 PV.mp4" })
    .click();
  // Without the detail panel the box starts at the bottom right.
  await page.getByRole("button", { name: "关闭详情" }).click();
  const screen = page.getByTestId("asmr-screen");
  await expect(screen).toHaveClass(/is-floating/);
  const before = (await screen.boundingBox())!;
  await page.mouse.move(before.x + 100, before.y + 60);
  await page.mouse.down();
  await page.mouse.move(before.x - 200, before.y - 150, { steps: 6 });
  await page.mouse.up();
  const after = (await screen.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(-300);
  expect(Math.round(after.y - before.y)).toBe(-210);
  expect(
    JSON.parse(
      (await page.evaluate(() =>
        localStorage.getItem("jmpicacomic.asmr.videoPosition"),
      ))!,
    ),
  ).toEqual({ right: expect.any(Number), bottom: expect.any(Number) });
  // Dragging never opens the player; a plain click does.
  await expect(page.getByTestId("asmr-player-full")).toBeHidden();
  // Dragging far past an edge keeps the box inside the section.
  await page.mouse.move(after.x + 50, after.y + 50);
  await page.mouse.down();
  await page.mouse.move(after.x + 5000, after.y + 5000, { steps: 4 });
  await page.mouse.up();
  const workspace = (await page.getByTestId("asmr-workspace").boundingBox())!;
  const clamped = (await screen.boundingBox())!;
  expect(clamped.x + clamped.width).toBeLessThanOrEqual(
    workspace.x + workspace.width + 1,
  );
  expect(clamped.y + clamped.height).toBeLessThanOrEqual(
    (await page.getByTestId("asmr-bar").boundingBox())!.y + 1,
  );
  await screen.click({ position: { x: 40, y: 40 } });
  await expect(page.getByTestId("asmr-player-full")).toBeVisible();
});

test("the desktop subtitle window shows the latest line on a transparent page", async ({
  page,
}) => {
  await installAsmr(page);
  await page.goto("/#asmr-lyrics");
  // A hash change alone does not reload the entry.
  await page.reload();
  const lyrics = page.getByTestId("asmr-lyrics");
  await expect(lyrics).toContainText("桌面字幕测试");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    ),
  ).toBe("rgba(0, 0, 0, 0)");
  const text = lyrics.locator(".asmr-lyrics-text");
  const size = () =>
    text.evaluate((element) => getComputedStyle(element).fontSize);
  expect(await size()).toBe("30px");
  await lyrics.hover();
  await page.getByRole("button", { name: "放大字幕" }).click();
  expect(await size()).toBe("36px");
  await page.reload();
  await expect(lyrics).toContainText("桌面字幕测试");
  expect(await size()).toBe("36px");
  await lyrics.hover();
  await page.getByRole("button", { name: "关闭桌面字幕" }).click();
  await expect
    .poll(async () => (await calls(page, "asmr_lyrics_close")).length)
    .toBe(1);
  // The window never asks for the catalog or media.
  expect(
    (await calls(page)).every((call) =>
      call.command.startsWith("asmr_lyrics_"),
    ),
  ).toBe(true);
});
