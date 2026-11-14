// Synthetic asmr.one bridge shared by the ASMR specs.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { installWorkflow } from "./workflow-fixture.ts";

declare global {
  interface Window {
    asmrCalls: { command: string; args: Record<string, unknown> }[];
    asmrFailures: Record<string, number>;
  }
}

// Synthetic catalog only: no real titles, people or covers.
export async function installAsmr(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installWorkflow(page);
  await page.addInitScript(() => {
    const bridge = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke(
            command: string,
            args?: Record<string, unknown>,
          ): Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    const invoke = bridge.invoke;
    window.asmrCalls = [];
    window.asmrFailures = JSON.parse(
      localStorage.getItem("synthetic-asmr-failures") ?? "{}",
    );
    const work = (n: number) => ({
      id: 1_000_000 + n,
      code: `RJ0${1_000_000 + n}`,
      title: `合成音声作品 ${n}`,
      circle: { id: 7 + (n % 2), name: `合成社团 ${7 + (n % 2)}` },
      voiceActors: [
        {
          id: "00000000-0000-0000-0000-00000000000" + (n % 3),
          name: `合成声优 ${n % 3}`,
        },
      ],
      tags: [
        { id: 4, name: "合成标签甲" },
        { id: 9, name: "合成标签乙" },
      ],
      release: "2026-10-02",
      added: "2026-11-01",
      downloads: 1000 - n,
      rating: n % 4 === 0 ? null : 4.5,
      ratingCount: n % 4 === 0 ? 0 : 12,
      reviewCount: 1,
      price: 330,
      durationSeconds: 2717,
      hasSubtitle: n % 2 === 0,
      editions:
        n === 1
          ? [
              { code: "RJ01000001", lang: "JPN", label: "日本語" },
              { code: "RJ01000002", lang: "CHI_HANS", label: "简体中文" },
            ]
          : [],
    });
    const PLAYER_WORK = 1_000_003;
    const file = (
      fileId: number | null,
      kind: string,
      title: string,
      durationSeconds: number | null = null,
    ) => ({ type: "file", fileId, kind, title, size: 1000, durationSeconds });
    const version = (title: string, base: number) => ({
      type: "folder",
      title,
      children: [
        file(base + 1, "audio", "01.wav", 30),
        file(base + 2, "text", "01.wav.vtt"),
        file(base + 3, "audio", "02.wav", 30),
      ],
    });
    const playerTracks = [
      {
        type: "folder",
        title: "中文字幕版",
        children: [version("SEあり", 10), version("SEなし", 20)],
      },
      {
        type: "folder",
        title: "特典",
        children: [file(31, "audio", "bonus.mp3", 30)],
      },
      file(41, "video", "PV.mp4", 30),
      file(null, "audio", "missing.wav", 30),
    ];
    const page = (start: number, total: number, pageNumber = 1) => ({
      works: Array.from(
        { length: Math.min(48, Math.max(0, total - (pageNumber - 1) * 48)) },
        (_, i) => work(start + (pageNumber - 1) * 48 + i),
      ),
      page: pageNumber,
      pageSize: 48,
      total,
    });
    // A synthetic account: the session survives reloads like a stored token.
    const SESSION_KEY = "synthetic-asmr-session";
    const signedIn = () => localStorage.getItem(SESSION_KEY) !== null;
    const account = () => ({
      signedIn: signedIn(),
      name: localStorage.getItem(SESSION_KEY),
      remembered: true,
    });
    const marks = ["marked", "listening", "listened", "replay", "postponed"];
    const reviewed = (n: number, progress: string | null) => ({
      ...work(n),
      progress: progress ?? marks[n % marks.length],
      userRating: n % 2 === 0 ? 5 : null,
      marked: "2026-11-13",
    });
    bridge.invoke = (command, args = {}) => {
      if (!command.startsWith("asmr_")) return invoke(command, args);
      window.asmrCalls.push({ command, args: structuredClone(args) });
      if (window.asmrFailures[command] > 0) {
        window.asmrFailures[command]--;
        return Promise.reject({ code: "ASMR_NETWORK" });
      }
      const query = args.query as { page: number } | undefined;
      switch (command) {
        case "asmr_popular":
          return Promise.resolve(page(100, 30, args.page as number));
        case "asmr_works":
          return Promise.resolve(page(1, 60, query!.page));
        case "asmr_search":
          return Promise.resolve(page(1, 1));
        case "asmr_related":
          return Promise.resolve(page(40, 3));
        case "asmr_index":
          return Promise.resolve([
            { id: "7", name: "合成社团 7", count: 3 },
            { id: "8", name: "合成社团 8", count: 30 },
            { id: "9", name: "另一个社团", count: 1 },
          ]);
        case "asmr_work": {
          const id = args.id as number;
          if (id === PLAYER_WORK)
            return Promise.resolve({
              work: work(id - 1_000_000),
              tracks: playerTracks,
            });
          return Promise.resolve({
            // Signed in, a work's details carry the listener's mark.
            work: signedIn()
              ? reviewed(id - 1_000_000, "replay")
              : work(id - 1_000_000),
            tracks: [
              {
                type: "folder",
                title: "WAV",
                children: [
                  {
                    type: "file",
                    kind: "audio",
                    title: "01.wav",
                    size: 1000,
                    durationSeconds: 61.5,
                  },
                  {
                    type: "file",
                    kind: "text",
                    title: "01.wav.vtt",
                    size: 10,
                    durationSeconds: null,
                  },
                ],
              },
              {
                type: "file",
                kind: "image",
                title: "cover.png",
                size: 2048,
                durationSeconds: null,
              },
            ],
          });
        }
        case "asmr_account":
          return Promise.resolve(account());
        case "asmr_login":
          if (args.name !== "synthetic" || args.password !== "secret")
            return Promise.reject({ code: "ASMR_LOGIN_FAILED" });
          localStorage.setItem(SESSION_KEY, "synthetic");
          return Promise.resolve(account());
        case "asmr_logout":
          localStorage.removeItem(SESSION_KEY);
          return Promise.resolve(account());
        case "asmr_reviews": {
          if (!signedIn()) return Promise.reject({ code: "ASMR_SIGNED_OUT" });
          // The site pages this list by 20.
          const total = args.progress ? 2 : 25;
          const pageNumber = args.page as number;
          const length = Math.min(
            20,
            Math.max(0, total - (pageNumber - 1) * 20),
          );
          return Promise.resolve({
            works: Array.from({ length }, (_, i) =>
              reviewed(
                300 + (pageNumber - 1) * 20 + i,
                (args.progress as string | null) ?? null,
              ),
            ),
            page: pageNumber,
            pageSize: 20,
            total,
          });
        }
        case "asmr_playlists":
          if (!signedIn()) return Promise.reject({ code: "ASMR_SIGNED_OUT" });
          return Promise.resolve({
            playlists: [
              {
                id: "00000000-0000-4000-8000-000000000001",
                name: "__SYS_PLAYLIST_MARKED",
                description: "",
                works: 25,
                coverWork: 1000301,
                updated: "2026-11-13",
              },
              {
                id: "00000000-0000-4000-8000-000000000002",
                name: "合成播放列表",
                description: "合成说明",
                works: 3,
                coverWork: null,
                updated: null,
              },
            ],
            page: 1,
            pageSize: 20,
            total: 2,
          });
        case "asmr_playlist_works":
          if (!signedIn()) return Promise.reject({ code: "ASMR_SIGNED_OUT" });
          return Promise.resolve(page(500, 3, args.page as number));
        case "asmr_cover":
          return Promise.resolve({ id: args.id, dataUrl: null });
        case "asmr_subtitle":
          return args.workId === PLAYER_WORK && args.fileId === 22
            ? Promise.resolve(
                "WEBVTT\n\n00:00.000 --> 00:02.000\n第一句字幕\n\n00:09.000 --> 00:25.000\n<v 合成>第二句字幕\n",
              )
            : Promise.reject({ code: "ASMR_NOT_FOUND" });
        case "asmr_lyrics_open":
        case "asmr_lyrics_hide":
        case "asmr_lyrics_close":
        case "asmr_lyrics_line":
          return Promise.resolve(null);
        case "asmr_lyrics_current":
          return Promise.resolve({ text: "桌面字幕测试", title: "01.wav" });
      }
      return Promise.reject(new Error("unexpected " + command));
    };
  });
  await page.reload();
  return errors;
}

export const calls = (page: Page, command?: string) =>
  page.evaluate(
    (name) => window.asmrCalls.filter((call) => !name || call.command === name),
    command,
  );

export async function openAsmr(page: Page) {
  await page.getByTestId("section-asmr").click();
  await expect(page.getByTestId("asmr-workspace")).toBeVisible();
}
