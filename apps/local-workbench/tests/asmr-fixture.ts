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
            work: work(id - 1_000_000),
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
        case "asmr_cover":
          return Promise.resolve({ id: args.id, dataUrl: null });
        case "asmr_subtitle":
          return args.workId === PLAYER_WORK && args.fileId === 22
            ? Promise.resolve(
                "WEBVTT\n\n00:00.000 --> 00:02.000\n第一句字幕\n\n00:09.000 --> 00:25.000\n<v 合成>第二句字幕\n",
              )
            : Promise.reject({ code: "ASMR_NOT_FOUND" });
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
