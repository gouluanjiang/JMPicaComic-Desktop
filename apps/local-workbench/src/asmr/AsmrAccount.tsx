import { useCallback, useEffect, useRef, useState } from "react";
import { autoMarkEnabled, setAutoMark } from "./asmr-marks.ts";
import { loadAccount, signIn, signOut } from "./asmr-runtime.ts";
import { asmrErrorMessage } from "./asmr-types.ts";
import type { AsmrAccount } from "./asmr-types.ts";

const SIGNED_OUT: AsmrAccount = {
  signedIn: false,
  name: null,
  remembered: true,
};

/** Errors after which the stored session is gone and the state must be re-read. */
export function isSessionError(reason: unknown): boolean {
  const code =
    reason && typeof reason === "object" && "code" in reason
      ? (reason as { code: unknown }).code
      : undefined;
  return code === "ASMR_LOGIN_EXPIRED" || code === "ASMR_SIGNED_OUT";
}

/** The asmr.one account this program is signed in to, if any. */
export function useAsmrAccount() {
  // `null` until the native side has answered once.
  const [account, setAccount] = useState<AsmrAccount | null>(null);
  const refresh = useCallback(() => {
    loadAccount()
      .then(setAccount)
      .catch(() => setAccount(SIGNED_OUT));
  }, []);
  useEffect(refresh, [refresh]);
  const login = useCallback(async (name: string, password: string) => {
    const next = await signIn(name, password);
    setAccount(next);
    return next;
  }, []);
  const logout = useCallback(async () => {
    try {
      setAccount(await signOut());
    } catch {
      refresh();
    }
  }, [refresh]);
  return { account, refresh, login, logout };
}

export function AsmrLoginDialog({
  onLogin,
  onClose,
}: {
  onLogin(name: string, password: string): Promise<AsmrAccount>;
  onClose(): void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const submit = () => {
    if (busy || !name.trim() || !password) return;
    setBusy(true);
    setError(null);
    onLogin(name.trim(), password)
      .then((account) => {
        // The password is not kept once the native side has it.
        setPassword("");
        if (account.signedIn) onClose();
      })
      .catch((reason) => {
        setError(asmrErrorMessage(reason));
        setBusy(false);
      });
  };
  return (
    <div
      className="asmr-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="asmr-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="登录 asmr.one"
        data-testid="asmr-login"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2>登录 asmr.one</h2>
        <p className="asmr-muted">
          登录后可以查看和修改你的收藏、标记和播放列表。密码只发给
          asmr.one，不会保存；登录状态保存在 Windows 凭据管理器里。
        </p>
        <label className="asmr-field">
          <span>用户名</span>
          <input
            ref={first}
            type="text"
            autoComplete="username"
            maxLength={64}
            value={name}
            data-testid="asmr-login-name"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="asmr-field">
          <span>密码</span>
          <input
            type="password"
            autoComplete="current-password"
            maxLength={256}
            value={password}
            data-testid="asmr-login-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="asmr-error" role="alert">
            {error}
          </p>
        )}
        <div className="asmr-dialog-actions">
          <button type="button" className="asmr-text-button" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="asmr-primary-button"
            disabled={busy || !name.trim() || !password}
            data-testid="asmr-login-submit"
          >
            {busy ? "正在登录…" : "登录"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** The top bar's account entry: a sign-in button, or the name with sign-out. */
export function AsmrAccountButton({
  account,
  onLogin,
  onLogout,
}: {
  account: AsmrAccount | null;
  onLogin(): void;
  onLogout(): void;
}) {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(autoMarkEnabled);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  if (!account) return null;
  if (!account.signedIn)
    return (
      <button
        className="asmr-account-button"
        data-testid="asmr-account"
        onClick={onLogin}
      >
        登录
      </button>
    );
  return (
    <div className="asmr-account" ref={host}>
      <button
        className="asmr-account-button"
        data-testid="asmr-account"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`已登录 asmr.one：${account.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        {account.name}
      </button>
      {open && (
        <div className="asmr-account-menu" role="menu">
          {!account.remembered && (
            <p className="asmr-muted">
              登录状态没能保存，关闭程序后需要重新登录。
            </p>
          )}
          <label
            className="asmr-account-option"
            title="开始播放时标为“在听”，播完最后一个文件时标为“听过”；不会改动“重听”和“搁置”"
          >
            <input
              type="checkbox"
              checked={auto}
              data-testid="asmr-auto-mark"
              onChange={(event) => {
                setAutoMark(event.target.checked);
                setAuto(event.target.checked);
              }}
            />
            播放时自动标记
          </label>
          <button
            role="menuitem"
            data-testid="asmr-logout"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
