import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { installWorkflow } from "./workflow-fixture.ts";

type Scenario = {
  check: "available" | "current" | "network";
  install: "downloads-active" | "pending";
};

declare global {
  interface Window {
    updateCalls: { command: string; args: Record<string, unknown> }[];
  }
}

async function installUpdates(page: Page, scenario: Scenario) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installWorkflow(page);
  await page.addInitScript(() => {
    const scenario = JSON.parse(
      localStorage.getItem("synthetic-update-scenario") ?? "null",
    ) as Scenario | null;
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
    window.updateCalls = [];
    bridge.invoke = (command, args = {}) => {
      if (!scenario) return invoke(command, args);
      if (command === "workbench_update_check") {
        window.updateCalls.push({ command, args });
        if (scenario.check === "network")
          return Promise.reject({ code: "UPDATE_NETWORK" });
        return Promise.resolve(
          scenario.check === "available"
            ? {
                available: true,
                currentVersion: "1.1.0",
                version: "1.2.0",
                notes: "## 主要变化\n- 内置更新器",
                publishedAt: Math.floor(
                  new Date(2026, 10, 20, 12).getTime() / 1000,
                ),
              }
            : { available: false, currentVersion: "1.1.0" },
        );
      }
      if (command === "workbench_update_install") {
        window.updateCalls.push({ command, args });
        return scenario.install === "downloads-active"
          ? Promise.reject({ code: "UPDATE_DOWNLOADS_ACTIVE" })
          : new Promise(() => {});
      }
      if (command === "workbench_info")
        return Promise.resolve({
          version: "1.1.0",
          revision: "a".repeat(40),
          platform: "windows",
        });
      if (command === "source_network_health")
        return Promise.resolve({ preferredJmHost: "www.cdnutc.cc", hosts: [] });
      return invoke(command, args);
    };
  });
  await page.evaluate(
    (value) =>
      localStorage.setItem("synthetic-update-scenario", JSON.stringify(value)),
    scenario,
  );
  await page.reload();
  return errors;
}

const updateCalls = (page: Page) => page.evaluate(() => window.updateCalls);

test("a newer release is offered once at startup and installs only the confirmed version", async ({
  page,
}) => {
  const errors = await installUpdates(page, {
    check: "available",
    install: "downloads-active",
  });
  const notice = page.getByTestId("update-notice");
  await expect(notice).toContainText("发现新版本 1.2.0");
  await expect(notice).toContainText("当前版本 1.1.0");
  await notice.getByRole("button", { name: "查看更新" }).click();
  const dialog = page.getByTestId("update-dialog");
  await expect(dialog).toBeVisible();
  await expect(notice).toBeHidden();
  await expect(dialog).toContainText("发布于 2026-11-20");
  await expect(page.getByTestId("update-notes")).toContainText("内置更新器");
  await page.getByTestId("update-install").click();
  await expect(page.getByTestId("update-error")).toContainText(
    "下载队列正在运行",
  );
  await expect(page.getByTestId("update-install")).toBeEnabled();
  await dialog.getByRole("button", { name: "以后再说" }).click();
  await expect(dialog).toBeHidden();
  await notice.getByRole("button", { name: "稍后" }).click();
  await expect(notice).toBeHidden();
  expect(await updateCalls(page)).toEqual([
    { command: "workbench_update_check", args: {} },
    { command: "workbench_update_install", args: { version: "1.2.0" } },
  ]);
  expect(
    await page.evaluate(() => window.workflowTest.unexpectedCommands),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("an install in progress keeps the dialog open until the app closes", async ({
  page,
}) => {
  await installUpdates(page, { check: "available", install: "pending" });
  await page
    .getByTestId("update-notice")
    .getByRole("button", { name: "查看更新" })
    .click();
  await page.getByTestId("update-install").click();
  await expect(page.getByTestId("update-progress")).toBeVisible();
  await expect(page.getByTestId("update-install")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("update-dialog")).toBeVisible();
});

test("settings check on demand and the startup check can be turned off", async ({
  page,
}) => {
  const errors = await installUpdates(page, {
    check: "network",
    install: "pending",
  });
  // A failed startup check stays silent.
  await expect.poll(() => updateCalls(page)).toHaveLength(1);
  await expect(page.getByTestId("update-notice")).toBeHidden();
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-network").click();
  const settings = page.getByTestId("update-settings");
  await settings.getByTestId("update-check").click();
  await expect(page.getByTestId("update-check-status")).toContainText(
    "连接 GitHub 失败",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "synthetic-update-scenario",
      JSON.stringify({ check: "current", install: "pending" }),
    ),
  );
  await page.getByTestId("update-check-on-startup").uncheck();
  await page.reload();
  await page.getByTestId("nav-settings").click();
  await page.getByTestId("settings-network").click();
  await expect(page.getByTestId("update-check-on-startup")).not.toBeChecked();
  expect(await updateCalls(page)).toEqual([]);
  await page.getByTestId("update-check").click();
  await expect(page.getByTestId("update-check-status")).toHaveText(
    "已是最新版本（1.1.0）。",
  );
  await expect(page.getByTestId("update-notice")).toBeHidden();
  expect(
    await page.evaluate(() => window.workflowTest.unexpectedCommands),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
