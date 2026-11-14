import { expect, test } from "@playwright/test";
import { calls, installAsmr, openAsmr } from "./asmr-fixture.ts";

test("signing in shows the listener's marked works and playlists, and signing out hides them", async ({
  page,
}) => {
  const errors = await installAsmr(page);
  await openAsmr(page);
  const account = page.getByTestId("asmr-account");
  await expect(account).toHaveText("登录");

  // Signed out, the account pages ask for a sign-in and request nothing.
  await page.getByTestId("nav-asmr-favourites").click();
  await expect(page.getByTestId("asmr-sign-in")).toContainText(
    "你的收藏和标记",
  );
  expect(await calls(page, "asmr_reviews")).toEqual([]);

  // A wrong password is reported and nothing is kept.
  await page.getByTestId("asmr-sign-in").getByRole("button").click();
  const dialog = page.getByTestId("asmr-login");
  await expect(dialog).toBeVisible();
  const submit = page.getByTestId("asmr-login-submit");
  await expect(submit).toBeDisabled();
  await page.getByTestId("asmr-login-name").fill("synthetic");
  await page.getByTestId("asmr-login-password").fill("wrong");
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("登录失败");
  await page.getByTestId("asmr-login-password").fill("secret");
  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(account).toHaveText("synthetic");
  // The password went to the native command once and is nowhere on the page.
  expect((await calls(page, "asmr_login")).at(-1)?.args).toEqual({
    name: "synthetic",
    password: "secret",
  });
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        (localStorage.getItem(key) ?? "").includes("secret"),
      ),
    ),
  ).toBe(false);

  // The favourites list arrives in the site's pages of 20 and keeps loading.
  const works = page.getByTestId("asmr-works");
  await expect(works.locator("article")).toHaveCount(25);
  expect(
    (await calls(page, "asmr_reviews")).map((call) => call.args.page),
  ).toEqual([1, 2]);
  await expect(page.getByTestId("asmr-list-end")).toContainText(
    "已显示全部 25 部",
  );
  await expect(
    works.locator("article").first().locator(".asmr-badge-progress"),
  ).toHaveText("想听");
  await expect(page.getByTestId("asmr-subtitle-only")).toHaveCount(0);

  // A mark narrows the list; the order switch reloads it.
  const filter = page.getByTestId("asmr-progress-filter");
  await filter.getByRole("button", { name: "搁置" }).click();
  await expect(works.locator("article")).toHaveCount(2);
  await expect(works.locator(".asmr-badge-progress").first()).toHaveText(
    "搁置",
  );
  await page.getByTestId("asmr-review-order").click();
  await expect(page.getByTestId("asmr-review-order")).toHaveText(
    "最早标记在前",
  );
  await expect
    .poll(async () => (await calls(page, "asmr_reviews")).at(-1)?.args)
    .toEqual({ progress: "postponed", ascending: true, page: 1 });

  // A work's details carry the listener's own mark and rating.
  await works
    .getByRole("button", { name: /^查看 / })
    .first()
    .click();
  const detail = page.getByTestId("asmr-detail");
  await expect(
    detail.getByTestId("asmr-my-progress").locator('[aria-pressed="true"]'),
  ).toHaveText("重听");
  await expect(detail.getByTestId("asmr-my-rating")).toHaveAttribute(
    "data-rating",
    "5",
  );
  await page.getByRole("button", { name: "关闭详情" }).click();

  // Playlists list the site's default list under its display name.
  await page.getByTestId("nav-asmr-playlists").click();
  const playlists = page.getByTestId("asmr-playlists");
  await expect(playlists.locator(".asmr-playlist")).toHaveText([
    /我标记的.*25 部作品/,
    /合成播放列表.*3 部作品/,
  ]);
  await playlists
    .locator(".asmr-playlist", { hasText: "合成播放列表" })
    .click();
  await expect(page.getByTestId("asmr-works").locator("article")).toHaveCount(
    3,
  );
  expect((await calls(page, "asmr_playlist_works")).at(-1)?.args).toEqual({
    id: "00000000-0000-4000-8000-000000000002",
    page: 1,
  });
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await expect(playlists).toBeVisible();

  // The session survives a restart.
  await page.reload();
  await openAsmr(page);
  await expect(account).toHaveText("synthetic");

  // Signing out returns the account pages to the prompt.
  await page.getByTestId("nav-asmr-playlists").click();
  await expect(page.getByTestId("asmr-playlists")).toBeVisible();
  await account.click();
  await page.getByTestId("asmr-logout").click();
  await expect(account).toHaveText("登录");
  await expect(page.getByTestId("asmr-sign-in")).toContainText("你的播放列表");
  expect(errors).toEqual([]);
});

test("a session the site no longer accepts shows as signed out", async ({
  page,
}) => {
  await installAsmr(page);
  await openAsmr(page);
  await page.getByTestId("asmr-account").click();
  await page.getByTestId("asmr-login-name").fill("synthetic");
  await page.getByTestId("asmr-login-password").fill("secret");
  await page.getByTestId("asmr-login-submit").click();
  await expect(page.getByTestId("asmr-account")).toHaveText("synthetic");
  // The native side forgets a rejected token before it reports the error.
  await page.evaluate(() => {
    localStorage.removeItem("synthetic-asmr-session");
  });
  await page.getByTestId("nav-asmr-favourites").click();
  await expect(page.getByTestId("asmr-account")).toHaveText("登录");
  await expect(page.getByTestId("asmr-sign-in")).toBeVisible();
});

async function signInSynthetic(page: import("@playwright/test").Page) {
  await page.getByTestId("asmr-account").click();
  await page.getByTestId("asmr-login-name").fill("synthetic");
  await page.getByTestId("asmr-login-password").fill("secret");
  await page.getByTestId("asmr-login-submit").click();
  await expect(page.getByTestId("asmr-account")).toHaveText("synthetic");
}

test("a work's mark, rating and playlists change from its details", async ({
  page,
}) => {
  const errors = await installAsmr(page);
  await openAsmr(page);
  await signInSynthetic(page);
  await page.getByTestId("nav-asmr-favourites").click();
  const works = page.getByTestId("asmr-works");
  const first = works.locator("article").first();
  await expect(first.locator(".asmr-badge-progress")).toHaveText("想听");
  await first.getByRole("button", { name: /^查看 / }).click();
  const detail = page.getByTestId("asmr-detail");
  const marks = detail.getByTestId("asmr-my-progress");
  await expect(marks.locator('[aria-pressed="true"]')).toHaveText("重听");

  // Only the changed field is sent, and the card in the list follows.
  await marks.getByRole("button", { name: "搁置" }).click();
  await expect(marks.locator('[aria-pressed="true"]')).toHaveText("搁置");
  expect((await calls(page, "asmr_review_set")).at(-1)?.args).toEqual({
    work: 1000300,
    rating: null,
    progress: "postponed",
  });
  await expect(first.locator(".asmr-badge-progress")).toHaveText("搁置");
  await detail.getByRole("button", { name: "评 3 星" }).click();
  await expect(detail.getByTestId("asmr-my-rating")).toHaveAttribute(
    "data-rating",
    "3",
  );
  expect((await calls(page, "asmr_review_set")).at(-1)?.args).toEqual({
    work: 1000300,
    rating: 3,
    progress: null,
  });

  // Clearing removes both and the badge with them.
  await detail.getByTestId("asmr-my-clear").click();
  await expect(marks.locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(detail.getByTestId("asmr-my-clear")).toHaveCount(0);
  expect((await calls(page, "asmr_review_delete")).at(-1)?.args).toEqual({
    work: 1000300,
  });
  await expect(first.locator(".asmr-badge-progress")).toHaveCount(0);

  // A failed change is reported and leaves the mark as it was.
  await page.evaluate(() => {
    window.asmrFailures.asmr_review_set = 1;
  });
  await marks.getByRole("button", { name: "在听" }).click();
  await expect(detail.getByTestId("asmr-my-review")).toContainText("连接");
  await expect(marks.locator('[aria-pressed="true"]')).toHaveCount(0);

  // The work goes into a playlist and out again.
  await detail.getByTestId("asmr-add-to-playlist").click();
  const choices = detail.getByTestId("asmr-playlist-choices");
  const custom = choices.getByRole("checkbox", { name: /合成播放列表/ });
  await expect(custom).not.toBeChecked();
  await custom.click();
  await expect(custom).toBeChecked();
  await expect(choices).toContainText("4 部");
  expect((await calls(page, "asmr_playlist_change")).at(-1)?.args).toEqual({
    id: "00000000-0000-4000-8000-000000000002",
    work: 1000300,
    add: true,
  });
  await custom.click();
  await expect(custom).not.toBeChecked();
  expect((await calls(page, "asmr_playlist_change")).at(-1)?.args).toEqual({
    id: "00000000-0000-4000-8000-000000000002",
    work: 1000300,
    add: false,
  });
  expect(errors).toEqual([]);
});

test("playlists are created, edited and deleted, except the site's own", async ({
  page,
}) => {
  const errors = await installAsmr(page);
  await openAsmr(page);
  await signInSynthetic(page);
  await page.getByTestId("nav-asmr-playlists").click();
  const playlists = page.getByTestId("asmr-playlists");
  await expect(playlists.locator(".asmr-playlist")).toHaveCount(2);
  // The site's own list offers neither.
  await expect(playlists.getByRole("button", { name: /^编辑 / })).toHaveCount(
    1,
  );
  await expect(playlists.getByRole("button", { name: /^删除 / })).toHaveCount(
    1,
  );

  await page.getByTestId("asmr-playlist-new").click();
  const dialog = page.getByTestId("asmr-playlist-dialog");
  await expect(page.getByTestId("asmr-playlist-submit")).toBeDisabled();
  await page.getByTestId("asmr-playlist-name").fill(" 新的列表 ");
  await page.getByTestId("asmr-playlist-submit").click();
  await expect(dialog).toBeHidden();
  // New lists are private unless the listener chooses otherwise.
  expect((await calls(page, "asmr_playlist_create")).at(-1)?.args).toEqual({
    name: "新的列表",
    description: "",
    privacy: "private",
  });
  await expect(playlists.locator(".asmr-playlist")).toHaveCount(3);

  await playlists.getByRole("button", { name: "编辑 合成播放列表" }).click();
  await expect(page.getByTestId("asmr-playlist-name")).toHaveValue(
    "合成播放列表",
  );
  await expect(page.getByTestId("asmr-playlist-privacy")).toHaveValue(
    "unlisted",
  );
  await page.getByTestId("asmr-playlist-name").fill("改过名的列表");
  await page.getByTestId("asmr-playlist-submit").click();
  await expect(dialog).toBeHidden();
  expect((await calls(page, "asmr_playlist_edit")).at(-1)?.args).toEqual({
    id: "00000000-0000-4000-8000-000000000002",
    name: "改过名的列表",
    description: "合成说明",
    privacy: "unlisted",
  });
  await expect(playlists).toContainText("改过名的列表");

  // Deleting asks first; cancelling sends nothing.
  await playlists.getByRole("button", { name: "删除 改过名的列表" }).click();
  const confirm = page.getByTestId("asmr-playlist-delete");
  await expect(confirm).toContainText("不能恢复");
  await confirm.getByRole("button", { name: "取消" }).click();
  await expect(confirm).toBeHidden();
  expect(await calls(page, "asmr_playlist_delete")).toEqual([]);
  await playlists.getByRole("button", { name: "删除 改过名的列表" }).click();
  await page.getByTestId("asmr-playlist-delete-confirm").click();
  await expect(confirm).toBeHidden();
  await expect(playlists.locator(".asmr-playlist")).toHaveCount(2);
  await expect(playlists).not.toContainText("改过名的列表");
  expect(errors).toEqual([]);
});

test("playing marks a work as listening unless that is switched off", async ({
  page,
}) => {
  const errors = await installAsmr(page);
  await openAsmr(page);
  await signInSynthetic(page);
  const detail = page.getByTestId("asmr-detail");
  const pressed = detail
    .getByTestId("asmr-my-progress")
    .locator('[aria-pressed="true"]');
  const open = async (progress: string | null) => {
    if (await detail.isVisible())
      await page.getByRole("button", { name: "关闭详情" }).click();
    await page.evaluate((value) => {
      window.asmrPlayerProgress = value;
    }, progress);
    await page
      .getByTestId("asmr-works")
      .getByRole("button", { name: "查看 合成音声作品 3", exact: true })
      .click();
    await expect(detail.getByTestId("asmr-play-work")).toBeVisible();
  };
  const toggleAuto = async (on: boolean) => {
    await page.getByTestId("asmr-account").click();
    await page.getByTestId("asmr-auto-mark").setChecked(on);
    await page.getByTestId("asmr-account").click();
  };
  // A work marked "replay" keeps its mark when it is played.
  await open("replay");
  await expect(pressed).toHaveText("重听");
  await detail.getByTestId("asmr-play-work").click();
  await detail
    .getByTestId("asmr-version-choice")
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByTestId("asmr-queue")).toBeAttached();
  expect(await calls(page, "asmr_review_set")).toEqual([]);

  // Switched off, an unmarked work is left alone too.
  await toggleAuto(false);
  await open(null);
  await expect(pressed).toHaveCount(0);
  await detail.getByTestId("asmr-play-work").click();
  expect(await calls(page, "asmr_review_set")).toEqual([]);

  // Switched on again, starting it marks it once.
  await toggleAuto(true);
  await detail.getByTestId("asmr-play-work").click();
  await expect
    .poll(async () => (await calls(page, "asmr_review_set")).map((c) => c.args))
    .toEqual([{ work: 1000003, rating: null, progress: "listening" }]);
  await expect(pressed).toHaveText("在听");
  expect(errors).toEqual([]);
});
