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
  await expect(detail.getByTestId("asmr-my-progress")).toHaveText("重听");
  await expect(detail.getByTestId("asmr-my-rating")).toHaveText("5 星");
  await page.getByRole("button", { name: "关闭详情" }).click();

  // Playlists list the site's default list under its display name.
  await page.getByTestId("nav-asmr-playlists").click();
  const playlists = page.getByTestId("asmr-playlists");
  await expect(playlists.getByRole("button")).toHaveText([
    /我标记的.*25 部作品/,
    /合成播放列表.*3 部作品/,
  ]);
  await playlists.getByRole("button", { name: /合成播放列表/ }).click();
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
