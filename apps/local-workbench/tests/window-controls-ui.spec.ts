import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { installAsmr } from "./asmr-fixture.ts";

const windowCalls = (page: Page) =>
  page.evaluate(() =>
    window.workflowTest.calls
      .filter((call) => call.command.startsWith("plugin:window|"))
      .map((call) => [call.command, call.args]),
  );

async function apart(a: Locator, b: Locator) {
  const [first, second] = [await a.boundingBox(), await b.boundingBox()];
  expect(first && second).toBeTruthy();
  const overlap =
    first!.x < second!.x + second!.width &&
    second!.x < first!.x + first!.width &&
    first!.y < second!.y + second!.height &&
    second!.y < first!.y + first!.height;
  expect(overlap).toBe(false);
}

test("the main window draws its own title bar buttons in both sections", async ({
  page,
}) => {
  const errors = await installAsmr(page);
  const controls = page.getByTestId("window-controls");
  await expect(controls.getByRole("button")).toHaveCount(3);

  // The buttons sit in the top-right corner, clear of the comic top bar's own.
  const box = (await controls.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.round(box.x + box.width)).toBe(viewport.width);
  expect(Math.round(box.y)).toBe(0);
  await apart(controls, page.getByTestId("appearance-shortcut"));
  // The empty top bar moves the window; its buttons do not.
  await expect(page.locator("header.topbar")).toHaveAttribute(
    "data-tauri-drag-region",
    "",
  );
  await expect(page.getByTestId("appearance-shortcut")).not.toHaveAttribute(
    "data-tauri-drag-region",
  );

  // Each button sends one request for the main window only.
  await controls.getByRole("button", { name: "最小化" }).click();
  await controls.getByRole("button", { name: /最大化|向下还原/ }).click();
  await controls.getByRole("button", { name: "关闭" }).click();
  expect(await windowCalls(page)).toEqual([
    ["plugin:window|minimize", { label: "main" }],
    ["plugin:window|toggle_maximize", { label: "main" }],
    ["plugin:window|close", { label: "main" }],
  ]);

  // On the ASMR bar the buttons stay in the corner, clear of its controls.
  await page.getByTestId("section-asmr").click();
  await expect(page.getByTestId("asmr-workspace")).toBeVisible();
  await expect(controls).toBeVisible();
  await expect(page.locator("header.asmr-topbar")).toHaveAttribute(
    "data-tauri-drag-region",
    "",
  );
  await apart(controls, page.getByTestId("asmr-theme"));
  await apart(controls, page.getByTestId("asmr-account"));
  expect(await controls.evaluate((node) => getComputedStyle(node).color)).toBe(
    "rgba(255, 255, 255, 0.85)",
  );

  // A narrow window still keeps the bar's buttons clear.
  await page.setViewportSize({ width: 720, height: 700 });
  await apart(controls, page.getByTestId("asmr-theme"));
  await page.getByTestId("section-comic").click();
  await apart(controls, page.getByTestId("appearance-shortcut"));

  expect(
    await page.evaluate(() => window.workflowTest.unexpectedCommands),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
