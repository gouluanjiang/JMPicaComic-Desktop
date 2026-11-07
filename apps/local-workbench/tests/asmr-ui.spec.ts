import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { installWorkflow } from "./workflow-fixture.ts";

declare global {
  interface Window {
    asmrCalls: { command: string; args: Record<string, unknown> }[];
    asmrFailures: Record<string, number>;
  }
}

// Synthetic catalog only: no real titles, people or covers.
async function installAsmr(page: Page) {
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
      }
      return Promise.reject(new Error("unexpected " + command));
    };
  });
  await page.reload();
  return errors;
}

const calls = (page: Page, command?: string) =>
  page.evaluate(
    (name) => window.asmrCalls.filter((call) => !name || call.command === name),
    command,
  );

async function openAsmr(page: Page) {
  await page.getByTestId("section-asmr").click();
  await expect(page.getByTestId("asmr-workspace")).toBeVisible();
}

test("the ASMR section opens beside the comic pages and keeps both in place", async ({
  page,
}) => {
  const errors = await installAsmr(page);
  await expect(page.getByTestId("section-comic")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await openAsmr(page);
  await expect(page.getByTestId("asmr-popular-strip")).toContainText(
    "合成音声作品 100",
  );
  const works = page.getByTestId("asmr-works");
  await expect(works.locator("article")).toHaveCount(48);
  await expect(page.getByTestId("asmr-work-1000001")).toContainText(
    "RJ01000001",
  );
  await expect(page.locator(".main-shell")).toHaveAttribute("inert", "");
  // The sidebar now offers the ASMR entries.
  await expect(page.getByTestId("nav-asmr-circles")).toBeVisible();
  await expect(page.getByTestId("nav-library")).toBeHidden();
  // Scrolling near the end loads the next batch without a page click.
  await page.getByTestId("asmr-list-end").scrollIntoViewIfNeeded();
  await expect(works.locator("article")).toHaveCount(60);
  await expect(page.getByTestId("asmr-list-end")).toContainText(
    "已显示全部 60 部",
  );
  // Development builds run effects twice, so compare the pages requested.
  const pages = (await calls(page, "asmr_works")).map(
    (call) => (call.args.query as { page: number }).page,
  );
  expect([...new Set(pages)]).toEqual([1, 2]);
  await page.getByTestId("section-comic").click();
  await expect(page.getByTestId("asmr-workspace")).toBeHidden();
  await expect(page.getByTestId("nav-library")).toBeVisible();
  await expect(page.locator(".main-shell")).not.toHaveAttribute("inert", "");
  // Coming back keeps everything that was loaded.
  await openAsmr(page);
  await expect(works.locator("article")).toHaveCount(60);
  // The choice survives a restart.
  await page.reload();
  await expect(page.getByTestId("asmr-workspace")).toBeVisible();
  expect(
    await page.evaluate(() => window.workflowTest.unexpectedCommands),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("sorting, subtitles and view modes request exactly what is shown", async ({
  page,
}) => {
  await installAsmr(page);
  await openAsmr(page);
  await expect(page.getByTestId("asmr-works").locator("article")).toHaveCount(
    48,
  );
  await page.getByTestId("asmr-order").selectOption("downloads");
  await page.getByTestId("asmr-subtitle-only").check();
  await expect
    .poll(async () => (await calls(page, "asmr_works")).at(-1)?.args)
    .toEqual({
      query: {
        order: "downloads",
        ascending: false,
        page: 1,
        pageSize: 48,
        subtitleOnly: true,
      },
    });
  // The popular strip follows the subtitle filter too.
  await expect
    .poll(async () => (await calls(page, "asmr_popular")).at(-1)?.args)
    .toEqual({ page: 1, subtitleOnly: true });
  const card = page.getByTestId("asmr-work-1000001");
  await expect(card).not.toContainText("下载");
  await page.getByRole("button", { name: "详细卡片" }).click();
  await expect(card).toContainText("下载 999");
  await expect(card).toContainText("合成声优 1");
  await page.reload();
  await expect(page.getByRole("button", { name: "详细卡片" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("asmr-subtitle-only")).toBeChecked();
});

test("a work opens in the side panel with its files, people, tags and editions", async ({
  page,
}) => {
  const errors = await installAsmr(page);
  await openAsmr(page);
  await page
    .getByTestId("asmr-works")
    .getByRole("button", { name: "查看 合成音声作品 1", exact: true })
    .click();
  const detail = page.getByTestId("asmr-detail");
  await expect(detail).toContainText("合成音声作品 1");
  await expect(detail).toContainText("文件 · 3 个");
  await expect(detail.getByRole("treeitem").first()).toContainText("WAV");
  await expect(detail).toContainText("01.wav");
  await expect(detail).toContainText("1:02");
  await detail.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect
    .poll(async () => (await calls(page, "asmr_work")).at(-1)?.args)
    .toEqual({ id: 1000002 });
  await detail.getByRole("button", { name: "合成声优 2", exact: true }).click();
  await expect(page.locator(".asmr-title")).toHaveText("声优：合成声优 2");
  expect((await calls(page, "asmr_related")).at(-1)?.args).toEqual({
    relation: "voiceActor",
    id: "00000000-0000-0000-0000-000000000002",
    query: {
      order: "added",
      ascending: false,
      page: 1,
      pageSize: 48,
      subtitleOnly: false,
    },
  });
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page.locator(".asmr-title")).toHaveText("作品");
  await page.getByRole("button", { name: "关闭详情" }).click();
  await expect(detail).toBeHidden();
  expect(errors).toEqual([]);
});

test("index pages sort by count, filter locally and open a circle", async ({
  page,
}) => {
  await installAsmr(page);
  await openAsmr(page);
  await page.getByTestId("nav-asmr-circles").click();
  const index = page.getByTestId("asmr-index");
  await expect(index.locator("button").first()).toContainText("合成社团 8");
  await page.getByRole("searchbox", { name: "筛选社团" }).fill("另一个");
  await expect(index.locator("button")).toHaveCount(1);
  await index.getByRole("button", { name: /另一个社团/ }).click();
  await expect(page.locator(".asmr-title")).toHaveText("社团：另一个社团");
  expect((await calls(page, "asmr_related")).at(-1)?.args).toMatchObject({
    relation: "circle",
    id: "9",
  });
  // The index list was read once and reused.
  await page.getByTestId("nav-asmr-circles").click();
  await expect(index.locator("button").first()).toContainText("合成社团 8");
  expect(await calls(page, "asmr_index")).toHaveLength(1);
});

test("searching a work code opens it and failures can be retried", async ({
  page,
}) => {
  await installAsmr(page);
  await page.evaluate(() =>
    localStorage.setItem(
      "synthetic-asmr-failures",
      JSON.stringify({ asmr_works: 1 }),
    ),
  );
  await page.reload();
  await openAsmr(page);
  await expect(page.getByRole("alert")).toContainText("连接 asmr.one 失败");
  await page.getByRole("button", { name: "重试" }).click();
  await expect(page.getByTestId("asmr-works").locator("article")).toHaveCount(
    48,
  );
  await page.getByTestId("asmr-search").fill("rj01000005");
  await page.getByTestId("asmr-search").press("Enter");
  await expect(page.getByTestId("asmr-detail")).toContainText("合成音声作品 5");
  expect((await calls(page, "asmr_search")).at(-1)?.args).toMatchObject({
    keyword: "rj01000005",
  });
  await expect(page.locator(".asmr-title")).toHaveText("搜索：rj01000005");
});

test("the ASMR theme switches between light and dark, and the sidebar follows it", async ({
  page,
}) => {
  await installAsmr(page);
  const shell = page.locator(".app-shell");
  const workspace = page.getByTestId("asmr-workspace");
  await openAsmr(page);
  await expect(workspace).toHaveAttribute("data-theme", "light");
  await expect(shell).toHaveAttribute("data-section", "asmr");
  const sidebarBackground = () =>
    page
      .locator(".ui-sidebar")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await sidebarBackground()).toBe("rgb(255, 255, 255)");
  // Fields use the ASMR palette, not the comic theme's dark inputs.
  const searchBackground = await page
    .getByTestId("asmr-search")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(searchBackground).toBe("rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "切换到暗色主题" }).click();
  await expect(workspace).toHaveAttribute("data-theme", "dark");
  await expect(shell).toHaveAttribute("data-asmr-theme", "dark");
  expect(await sidebarBackground()).toBe("rgb(22, 24, 28)");
  await page.reload();
  await expect(workspace).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "切换到浅色主题" }),
  ).toBeVisible();
  // The comic section keeps its own sidebar.
  await page.getByTestId("section-comic").click();
  expect(await sidebarBackground()).not.toBe("rgb(22, 24, 28)");
  // A collapsed sidebar stacks the section switch inside its width.
  await page.getByTestId("sidebar-toggle").click();
  const sidebar = (await page.locator(".ui-sidebar").boundingBox())!;
  for (const id of ["section-comic", "section-asmr"]) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(sidebar.x);
    expect(box.x + box.width).toBeLessThanOrEqual(sidebar.x + sidebar.width);
  }
});
