import { invokeDesktop } from "./runtime.ts";

export type AvailableUpdate = {
  available: true;
  currentVersion: string;
  version: string;
  notes: string | null;
  publishedAt: number | null;
};

export type UpdateCheck =
  { available: false; currentVersion: string } | AvailableUpdate;

export const CHECK_ON_STARTUP_KEY = "jmpicacomic.updates.checkOnStartup";
const NOTES_LIMIT = 8_000;
const version = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function invalid(): never {
  throw { code: "UPDATE_RESPONSE_INVALID" };
}

function versionString(value: unknown): string {
  return typeof value === "string" && value.length <= 64 && version.test(value)
    ? value
    : invalid();
}

export function validateUpdateCheck(value: unknown): UpdateCheck {
  if (!value || typeof value !== "object") invalid();
  const record = value as Record<string, unknown>;
  const currentVersion = versionString(record.currentVersion);
  if (record.available === false) return { available: false, currentVersion };
  if (record.available !== true) invalid();
  const notes = record.notes;
  const publishedAt = record.publishedAt;
  if (notes !== null && notes !== undefined && typeof notes !== "string")
    invalid();
  if (
    publishedAt !== null &&
    publishedAt !== undefined &&
    !Number.isSafeInteger(publishedAt)
  )
    invalid();
  return {
    available: true,
    currentVersion,
    version: versionString(record.version),
    notes:
      typeof notes === "string" && notes.trim()
        ? notes.slice(0, NOTES_LIMIT)
        : null,
    publishedAt: typeof publishedAt === "number" ? publishedAt : null,
  };
}

export function checkForUpdate(): Promise<UpdateCheck> {
  return invokeDesktop("workbench_update_check").then(validateUpdateCheck);
}

/** On Windows a successful install closes the app; the installer reopens it. */
export function installUpdate(target: string): Promise<void> {
  return invokeDesktop("workbench_update_install", { version: target });
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readCheckOnStartup(storage = defaultStorage()): boolean {
  try {
    return storage?.getItem(CHECK_ON_STARTUP_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeCheckOnStartup(
  enabled: boolean,
  storage = defaultStorage(),
): boolean {
  try {
    storage?.setItem(CHECK_ON_STARTUP_KEY, enabled ? "true" : "false");
    return Boolean(storage);
  } catch {
    return false;
  }
}

const messages: Record<string, string> = {
  UPDATE_NETWORK: "连接 GitHub 失败，请检查网络后重试。",
  UPDATE_UNAVAILABLE:
    "暂时读取不到更新信息。可以稍后再试，或到 GitHub 发行页查看。",
  UPDATE_CHECK_FAILED: "检查更新失败，请稍后重试。",
  UPDATE_RESPONSE_INVALID: "更新信息格式不正确，已忽略。",
  UPDATE_STALE: "更新信息已过期，请重新检查更新。",
  UPDATE_IN_PROGRESS: "正在处理更新，请稍候。",
  UPDATE_DOWNLOADS_ACTIVE:
    "下载队列正在运行。请先暂停或等下载完成，再安装更新。",
  UPDATE_DOWNLOAD_FAILED: "更新下载失败，请检查网络后重试。",
  UPDATE_SIGNATURE_INVALID:
    "更新文件没有通过签名校验，已停止安装。请到 GitHub 发行页手动下载。",
  UPDATE_INSTALL_FAILED: "无法启动安装程序。请到 GitHub 发行页手动下载安装包。",
};

export function updateErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code: unknown }).code
      : undefined;
  return (
    (typeof code === "string" && messages[code]) || "更新失败，请稍后重试。"
  );
}

export function formatPublishedAt(seconds: number | null): string | null {
  if (seconds === null) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
