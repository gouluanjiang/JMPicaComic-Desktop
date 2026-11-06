import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkForUpdate,
  formatPublishedAt,
  installUpdate,
  readCheckOnStartup,
  updateErrorMessage,
  writeCheckOnStartup,
} from "./updater.ts";
import type { AvailableUpdate } from "./updater.ts";

export type Updates = ReturnType<typeof useUpdates>;

export function useUpdates(native: boolean) {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [noticeHidden, setNoticeHidden] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [checkOnStartup, setCheckOnStartupState] = useState(() =>
    readCheckOnStartup(),
  );
  const sequence = useRef(0);
  const check = useCallback(async (manual: boolean) => {
    const id = ++sequence.current;
    setChecking(true);
    if (manual) setStatus(null);
    try {
      const result = await checkForUpdate();
      if (id !== sequence.current) return;
      if (result.available) {
        setUpdate(result);
        setNoticeHidden(false);
        if (manual) setStatus(`发现新版本 ${result.version}。`);
      } else {
        setUpdate(null);
        if (manual) setStatus(`已是最新版本（${result.currentVersion}）。`);
      }
    } catch (error) {
      // A failed startup check stays silent; the settings page can retry.
      if (id === sequence.current && manual)
        setStatus(updateErrorMessage(error));
    } finally {
      if (id === sequence.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    if (native && readCheckOnStartup()) void check(false);
  }, [native, check]);
  return {
    native,
    update,
    checking,
    status,
    checkOnStartup,
    dialogOpen,
    noticeVisible: Boolean(update) && !noticeHidden && !dialogOpen,
    check: () => check(true),
    setCheckOnStartup(enabled: boolean) {
      writeCheckOnStartup(enabled);
      setCheckOnStartupState(enabled);
    },
    hideNotice: () => setNoticeHidden(true),
    openDialog: () => setDialogOpen(true),
    closeDialog: () => setDialogOpen(false),
  };
}

export function UpdateNotice({ updates }: { updates: Updates }) {
  const { update } = updates;
  if (!updates.noticeVisible || !update) return null;
  return (
    <aside
      className="update-notice"
      aria-label="发现新版本"
      data-testid="update-notice"
    >
      <div>
        <strong>发现新版本 {update.version}</strong>
        <span>当前版本 {update.currentVersion}</span>
      </div>
      <div className="update-notice-actions">
        <button className="text-button" onClick={updates.hideNotice}>
          稍后
        </button>
        <button className="button primary" onClick={updates.openDialog}>
          查看更新
        </button>
      </div>
    </aside>
  );
}

export function UpdateDialog({ updates }: { updates: Updates }) {
  const { update } = updates;
  const dialog = useRef<HTMLDialogElement>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const open = updates.dialogOpen && Boolean(update);
  useEffect(() => {
    if (!open) return;
    setError(null);
    dialog.current?.showModal();
  }, [open]);
  if (!open || !update) return null;
  const published = formatPublishedAt(update.publishedAt);
  async function install() {
    if (!update || installing) return;
    setInstalling(true);
    setError(null);
    try {
      // On Windows the app closes here and the installer reopens it.
      await installUpdate(update.version);
      setFinished(true);
    } catch (reason) {
      setError(updateErrorMessage(reason));
    } finally {
      setInstalling(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="dialog update-dialog"
      aria-label={`更新到 ${update.version}`}
      data-testid="update-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!installing) updates.closeDialog();
      }}
    >
      <h2>更新到 {update.version}</h2>
      <p className="update-dialog-meta">
        当前版本 {update.currentVersion}
        {published ? ` · 发布于 ${published}` : ""}
      </p>
      {update.notes ? (
        <pre className="update-notes" data-testid="update-notes">
          {update.notes}
        </pre>
      ) : (
        <p>这个版本没有附带说明，可以到 GitHub 发行页查看。</p>
      )}
      <ul className="update-dialog-rules">
        <li>安装包会从 GitHub 下载，并在安装前校验签名。</li>
        <li>
          安装时程序和所有阅读小窗会关闭，安装完成后自动重新打开。漫画库、关注和设置都会保留。
        </li>
        <li>下载队列运行时不能安装，请先暂停或等下载完成。</li>
      </ul>
      {installing && (
        <p role="status" data-testid="update-progress">
          正在下载并校验更新，完成后程序会自动关闭并安装…
        </p>
      )}
      {finished && <p role="status">更新已安装，请重新打开程序。</p>}
      {error && (
        <p role="alert" data-testid="update-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button secondary"
          disabled={installing}
          onClick={updates.closeDialog}
        >
          {finished ? "关闭" : "以后再说"}
        </button>
        {!finished && (
          <button
            className="button primary"
            disabled={installing}
            data-testid="update-install"
            onClick={() => void install()}
          >
            {installing ? "正在更新…" : "下载并安装"}
          </button>
        )}
      </div>
    </dialog>
  );
}

export function UpdateSettings({ updates }: { updates: Updates }) {
  return (
    <section
      className="settings-card"
      aria-labelledby="update-settings-title"
      data-testid="update-settings"
    >
      <h2 id="update-settings-title">软件更新</h2>
      <p className="settings-copy">
        从 GitHub 发行页检查新版本。确认后才会下载，安装前会校验签名。
      </p>
      <label className="settings-motion-choice">
        <input
          type="checkbox"
          checked={updates.checkOnStartup}
          data-testid="update-check-on-startup"
          onChange={(event) => updates.setCheckOnStartup(event.target.checked)}
        />
        <span>启动时检查更新</span>
      </label>
      <p className="settings-help">只检查是否有新版本，不会自动下载或安装。</p>
      <div className="source-actions">
        <button
          className="button secondary"
          disabled={updates.checking}
          data-testid="update-check"
          onClick={() => void updates.check()}
        >
          {updates.checking ? "正在检查…" : "检查更新"}
        </button>
        {updates.update && (
          <button className="button primary" onClick={updates.openDialog}>
            查看 {updates.update.version}
          </button>
        )}
      </div>
      {updates.status && (
        <p
          className="settings-help"
          role="status"
          data-testid="update-check-status"
        >
          {updates.status}
        </p>
      )}
    </section>
  );
}
