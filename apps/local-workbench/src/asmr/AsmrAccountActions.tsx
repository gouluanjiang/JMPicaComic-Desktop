// Controls that change the listener's asmr.one account: a work's mark and
// rating, which playlists hold it, and creating, editing or deleting a list.

import { useEffect, useRef, useState } from "react";
import { announceReview, onReviewChange } from "./asmr-marks.ts";
import {
  changePlaylist,
  createPlaylist,
  deletePlaylist,
  deleteReview,
  editPlaylist,
  loadWorkPlaylists,
  setReview,
} from "./asmr-runtime.ts";
import {
  asmrErrorMessage,
  playlistTitle,
  PRIVACY,
  privacyLabels,
  PROGRESS,
  progressLabels,
} from "./asmr-types.ts";
import type {
  AsmrPlaylist,
  AsmrPrivacy,
  AsmrProgress,
  AsmrWork,
} from "./asmr-types.ts";

function useEscape(onClose: () => void) {
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
}

/** The listener's own mark and rating for a work, both changeable. */
export function AsmrMyReview({
  work,
  onError,
}: {
  work: AsmrWork;
  onError(reason: unknown): void;
}) {
  const [progress, setProgress] = useState(work.progress);
  const [rating, setRating] = useState(work.userRating);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onReviewChange((change) => {
        if (change.id !== work.id) return;
        if (change.progress !== undefined) setProgress(change.progress);
        if (change.userRating !== undefined) setRating(change.userRating);
      }),
    [work.id],
  );
  const send = (
    request: Promise<void>,
    change: { progress?: AsmrProgress | null; userRating?: number | null },
  ) => {
    setBusy(true);
    setError(null);
    request
      .then(() => announceReview({ id: work.id, ...change }))
      .catch((reason) => {
        setError(asmrErrorMessage(reason));
        onError(reason);
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="asmr-my-review" data-testid="asmr-my-review">
      <div className="asmr-my-row">
        <span className="asmr-my-label">我的标记</span>
        <div
          className="asmr-tabs"
          role="group"
          aria-label="我的标记"
          data-testid="asmr-my-progress"
        >
          {PROGRESS.map((value) => (
            <button
              key={value}
              disabled={busy}
              aria-pressed={progress === value}
              onClick={() => {
                if (progress !== value)
                  send(setReview(work.id, null, value), { progress: value });
              }}
            >
              {progressLabels[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="asmr-my-row">
        <span className="asmr-my-label">我的评分</span>
        <div
          className="asmr-my-stars"
          role="group"
          aria-label="我的评分"
          data-testid="asmr-my-rating"
          data-rating={rating ?? 0}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              disabled={busy}
              aria-label={`评 ${value} 星`}
              aria-pressed={rating !== null && rating >= value}
              onClick={() => {
                if (rating !== value)
                  send(setReview(work.id, value, null), { userRating: value });
              }}
            >
              {rating !== null && rating >= value ? "★" : "☆"}
            </button>
          ))}
        </div>
        {(progress !== null || rating !== null) && (
          <button
            className="asmr-text-button"
            disabled={busy}
            data-testid="asmr-my-clear"
            title="同时清除这部作品的标记和评分"
            onClick={() =>
              send(deleteReview(work.id), { progress: null, userRating: null })
            }
          >
            清除
          </button>
        )}
      </div>
      {error && (
        <p className="asmr-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Which of the listener's playlists hold a work, with a switch for each. */
export function AsmrPlaylistPicker({
  workId,
  onError,
}: {
  workId: number;
  onError(reason: unknown): void;
}) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<AsmrPlaylist[] | null>(null);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (reason: unknown) => {
    setError(asmrErrorMessage(reason));
    onError(reason);
  };
  const load = (page: number) => {
    setError(null);
    loadWorkPlaylists(workId, page)
      .then((result) => {
        setPlaylists((previous) => {
          const base = page === 1 || !previous ? [] : previous;
          const seen = new Set(base.map((playlist) => playlist.id));
          return [
            ...base,
            ...result.playlists.filter((playlist) => !seen.has(playlist.id)),
          ];
        });
        setTotal(result.total);
        setNextPage(page + 1);
      })
      .catch(fail);
  };
  const toggle = (playlist: AsmrPlaylist) => {
    const add = playlist.contains !== true;
    setBusy(playlist.id);
    setError(null);
    changePlaylist(playlist.id, workId, add)
      .then(() =>
        setPlaylists(
          (previous) =>
            previous?.map((entry) =>
              entry.id === playlist.id
                ? {
                    ...entry,
                    contains: add,
                    works: Math.max(0, entry.works + (add ? 1 : -1)),
                  }
                : entry,
            ) ?? null,
        ),
      )
      .catch(fail)
      .finally(() => setBusy(null));
  };
  return (
    <div className="asmr-playlist-picker">
      <button
        className="asmr-secondary-button"
        aria-expanded={open}
        data-testid="asmr-add-to-playlist"
        onClick={() => {
          if (!open) load(1);
          setOpen(!open);
        }}
      >
        加入播放列表
      </button>
      {open && (
        <div
          className="asmr-playlist-choices"
          role="group"
          aria-label="我的播放列表"
          data-testid="asmr-playlist-choices"
        >
          {!playlists && !error && (
            <p className="asmr-muted" role="status">
              正在读取…
            </p>
          )}
          {playlists && playlists.length === 0 && (
            <p className="asmr-muted">
              还没有播放列表，可以在“播放列表”页新建。
            </p>
          )}
          {playlists?.map((playlist) => (
            <label key={playlist.id}>
              <input
                type="checkbox"
                checked={playlist.contains === true}
                disabled={busy !== null}
                onChange={() => toggle(playlist)}
              />
              <span>{playlistTitle(playlist.name)}</span>
              <span className="asmr-track-meta">{playlist.works} 部</span>
            </label>
          ))}
          {playlists && playlists.length < total && (
            <button className="asmr-text-button" onClick={() => load(nextPage)}>
              加载更多
            </button>
          )}
          {error && (
            <p className="asmr-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Creates a playlist, or edits `playlist` when one is given. */
export function AsmrPlaylistDialog({
  playlist,
  onDone,
  onClose,
  onError,
}: {
  playlist: AsmrPlaylist | null;
  onDone(): void;
  onClose(): void;
  onError(reason: unknown): void;
}) {
  const [name, setName] = useState(playlist?.name ?? "");
  const [description, setDescription] = useState(playlist?.description ?? "");
  const [privacy, setPrivacy] = useState<AsmrPrivacy>(
    playlist?.privacy ?? "private",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  useEscape(onClose);
  const title = playlist ? "编辑播放列表" : "新建播放列表";
  const submit = () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    (playlist
      ? editPlaylist(playlist.id, name.trim(), description, privacy)
      : createPlaylist(name.trim(), description, privacy)
    )
      .then(onDone)
      .catch((reason) => {
        setError(asmrErrorMessage(reason));
        setBusy(false);
        onError(reason);
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
        aria-label={title}
        data-testid="asmr-playlist-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2>{title}</h2>
        <label className="asmr-field">
          <span>名称</span>
          <input
            ref={first}
            type="text"
            maxLength={120}
            value={name}
            data-testid="asmr-playlist-name"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="asmr-field">
          <span>说明（可不填）</span>
          <textarea
            rows={3}
            maxLength={500}
            value={description}
            data-testid="asmr-playlist-description"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="asmr-field">
          <span>谁能看到</span>
          <select
            value={privacy}
            data-testid="asmr-playlist-privacy"
            onChange={(event) => setPrivacy(event.target.value as AsmrPrivacy)}
          >
            {PRIVACY.map((value) => (
              <option key={value} value={value}>
                {privacyLabels[value]}
              </option>
            ))}
          </select>
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
            disabled={busy || !name.trim()}
            data-testid="asmr-playlist-submit"
          >
            {busy ? "正在保存…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Asks before a playlist is deleted; the site cannot bring it back. */
export function AsmrPlaylistDeleteDialog({
  playlist,
  onDone,
  onClose,
  onError,
}: {
  playlist: AsmrPlaylist;
  onDone(): void;
  onClose(): void;
  onError(reason: unknown): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);
  return (
    <div
      className="asmr-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="asmr-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="删除播放列表"
        data-testid="asmr-playlist-delete"
      >
        <h2>删除播放列表</h2>
        <p>
          确定要删除“{playlist.name}
          ”吗？删除后不能恢复，列表里的作品本身不受影响。
        </p>
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
            type="button"
            className="asmr-primary-button asmr-danger-button"
            disabled={busy}
            data-testid="asmr-playlist-delete-confirm"
            onClick={() => {
              setBusy(true);
              setError(null);
              deletePlaylist(playlist.id)
                .then(onDone)
                .catch((reason) => {
                  setError(asmrErrorMessage(reason));
                  setBusy(false);
                  onError(reason);
                });
            }}
          >
            {busy ? "正在删除…" : "删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
