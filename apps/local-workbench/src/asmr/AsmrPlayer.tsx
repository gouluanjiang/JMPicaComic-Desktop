import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "../icons.tsx";
import { useDesktopLyrics } from "./asmr-desktop-lyrics.ts";
import { cueAt } from "./asmr-media.ts";
import { RATES, asmrPlayer } from "./asmr-player.ts";
import type { PlayerState, QueueItem } from "./asmr-player.ts";
import { cachedCover } from "./asmr-runtime.ts";
import { formatDuration } from "./asmr-types.ts";
import { AsmrCover } from "./AsmrWorkCard.tsx";

const SKIP_SECONDS = 10;
const SLEEP_CHOICES = [15, 30, 45, 60, 90];

export function usePlayer(): PlayerState {
  return useSyncExternalStore(asmrPlayer.subscribe, asmrPlayer.getState);
}

function clock(seconds: number): string {
  return formatDuration(Math.floor(seconds)) ?? "0:00";
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Keyboard control while the ASMR section is on screen. */
function useShortcuts(active: boolean, expanded: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        typing(event.target)
      )
        return;
      const handled = (() => {
        switch (event.key) {
          case " ":
          case "k":
          case "K":
            if (event.key === "K" && event.shiftKey) return false;
            asmrPlayer.toggle();
            return true;
          case "ArrowLeft":
            asmrPlayer.skip(-(event.shiftKey ? 30 : SKIP_SECONDS));
            return true;
          case "ArrowRight":
            asmrPlayer.skip(event.shiftKey ? 30 : SKIP_SECONDS);
            return true;
          case "ArrowUp":
          case "ArrowDown":
            // Arrow keys scroll lists unless the full player is open.
            if (!expanded) return false;
            asmrPlayer.setVolume(
              asmrPlayer.getState().volume +
                (event.key === "ArrowUp" ? 0.05 : -0.05),
            );
            return true;
          case "m":
          case "M":
            asmrPlayer.toggleMute();
            return true;
          case "N":
            if (!event.shiftKey) return false;
            asmrPlayer.next();
            return true;
          case "P":
            if (!event.shiftKey) return false;
            asmrPlayer.previous();
            return true;
          case "Escape":
            if (!expanded) return false;
            asmrPlayer.setExpanded(false);
            return true;
          default:
            return false;
        }
      })();
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, expanded]);
}

/** Windows media keys and the system media overlay. */
function useMediaSession(item: QueueItem | null, playing: boolean) {
  useEffect(() => {
    const session =
      typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!session || typeof MediaMetadata === "undefined") return;
    if (!item) {
      session.metadata = null;
      return;
    }
    const cover =
      cachedCover(item.workId, "main") ?? cachedCover(item.workId, "thumbnail");
    session.metadata = new MediaMetadata({
      title: item.title,
      artist: item.workCode,
      album: item.workTitle,
      artwork: cover ? [{ src: cover }] : [],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => asmrPlayer.toggle()],
      ["pause", () => asmrPlayer.toggle()],
      ["previoustrack", () => asmrPlayer.previous()],
      ["nexttrack", () => asmrPlayer.next()],
      ["seekbackward", () => asmrPlayer.skip(-SKIP_SECONDS)],
      ["seekforward", () => asmrPlayer.skip(SKIP_SECONDS)],
      ["seekto", (details) => asmrPlayer.seek(details.seekTime ?? 0)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not every action is supported everywhere.
      }
    }
  }, [item]);
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaSession)
      navigator.mediaSession.playbackState = item
        ? playing
          ? "playing"
          : "paused"
        : "none";
  }, [item, playing]);
}

function SleepControl({ state }: { state: PlayerState }) {
  const sleep = state.sleep;
  const remaining =
    sleep?.mode === "minutes"
      ? Math.max(0, Math.ceil((sleep.endsAt - Date.now()) / 1000))
      : null;
  const value =
    sleep === null
      ? "off"
      : sleep.mode === "track"
        ? "track"
        : String(sleep.minutes);
  return (
    <label
      className={`asmr-player-sleep${sleep ? " active" : ""}`}
      title="睡眠定时"
    >
      <Icon name="moon" size={16} />
      <select
        value={value}
        aria-label="睡眠定时"
        data-testid="asmr-sleep"
        onChange={(event) => {
          const choice = event.target.value;
          asmrPlayer.setSleep(
            choice === "off"
              ? null
              : choice === "track"
                ? "track"
                : Number(choice),
          );
        }}
      >
        <option value="off">定时关</option>
        {SLEEP_CHOICES.map((minutes) => (
          <option key={minutes} value={minutes}>
            {minutes} 分钟
          </option>
        ))}
        <option value="track">播完当前文件</option>
      </select>
      {remaining !== null && (
        <span className="asmr-player-countdown" data-testid="asmr-sleep-left">
          {clock(remaining)}
        </span>
      )}
    </label>
  );
}

function CueList({ state }: { state: PlayerState }) {
  const active = cueAt(state.cues, state.time);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>(".active");
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);
  if (state.subtitle === "none")
    return <p className="asmr-muted">这个文件没有找到字幕。</p>;
  if (state.subtitle === "loading")
    return <p className="asmr-muted">正在读取字幕…</p>;
  if (state.subtitle === "failed")
    return <p className="asmr-muted">字幕读取失败或无法识别。</p>;
  return (
    <ol className="asmr-cues" ref={list} data-testid="asmr-cues">
      {state.cues.map((cue, index) => (
        <li key={index}>
          <button
            className={index === active ? "active" : undefined}
            onClick={() => asmrPlayer.seek(cue.start)}
          >
            <span className="asmr-cue-time">{clock(cue.start)}</span>
            <span>{cue.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function QueueList({ state }: { state: PlayerState }) {
  return (
    <ol className="asmr-queue" data-testid="asmr-queue">
      {state.queue.map((item, index) => (
        <li key={item.fileId}>
          <button
            className={index === state.index ? "active" : undefined}
            aria-current={index === state.index ? "true" : undefined}
            onClick={() => asmrPlayer.jump(index)}
          >
            <Icon
              name={item.kind === "video" ? "film" : "headphones"}
              size={15}
            />
            <span className="asmr-queue-title">{item.title}</span>
            <span className="asmr-track-meta">
              {formatDuration(item.durationSeconds) ?? ""}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function FullPlayer({
  state,
  item,
  onOpenWork,
}: {
  state: PlayerState;
  item: QueueItem;
  onOpenWork(id: number): void;
}) {
  const [tab, setTab] = useState<"cues" | "queue">(
    item.subtitleFileId !== null ? "cues" : "queue",
  );
  const active = cueAt(state.cues, state.time);
  return (
    <section
      className="asmr-player-full"
      aria-label="播放器"
      data-testid="asmr-player-full"
    >
      <div className="asmr-player-main">
        <header className="asmr-player-full-header">
          <button
            className="asmr-icon-button"
            aria-label="收起播放器"
            title="收起播放器 (Esc)"
            onClick={() => asmrPlayer.setExpanded(false)}
          >
            <Icon name="chevronDown" size={20} />
          </button>
          <div className="asmr-player-full-title">
            <strong>{item.title}</strong>
            <button
              className="asmr-text-button"
              onClick={() => {
                asmrPlayer.setExpanded(false);
                onOpenWork(item.workId);
              }}
            >
              {item.workCode} · {item.workTitle}
            </button>
          </div>
        </header>
        {/* The media element is laid over this area; see .asmr-screen. */}
        <div className="asmr-player-screen-slot" />
        <p className="asmr-player-big-cue" data-testid="asmr-current-cue">
          {active >= 0 ? state.cues[active].text : " "}
        </p>
      </div>
      <aside className="asmr-player-side">
        <div className="asmr-player-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "cues"}
            onClick={() => setTab("cues")}
          >
            字幕
          </button>
          <button
            role="tab"
            aria-selected={tab === "queue"}
            onClick={() => setTab("queue")}
          >
            播放列表（{state.queue.length}）
          </button>
        </div>
        <div className="asmr-player-side-body">
          {tab === "cues" ? (
            <CueList state={state} />
          ) : (
            <QueueList state={state} />
          )}
        </div>
      </aside>
    </section>
  );
}

const VIDEO_POSITION_KEY = "jmpicacomic.asmr.videoPosition";
const BAR_HEIGHT = 76;
const DRAG_THRESHOLD = 4;

/** Offsets of the small video from the workspace's right and bottom edges. */
type Offset = { right: number; bottom: number };

function readOffset(): Offset | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(VIDEO_POSITION_KEY) ?? "null",
    ) as unknown;
    if (!value || typeof value !== "object") return null;
    const { right, bottom } = value as Record<string, unknown>;
    return typeof right === "number" &&
      typeof bottom === "number" &&
      Number.isFinite(right) &&
      Number.isFinite(bottom)
      ? { right, bottom }
      : null;
  } catch {
    return null;
  }
}

/**
 * Lets the small video be dragged anywhere inside the ASMR section. A press
 * that does not move opens the full player, as a click did before.
 */
function useFloatingDrag(onClick: () => void) {
  const [offset, setOffset] = useState<Offset | null>(readOffset);
  const drag = useRef<{
    x: number;
    y: number;
    start: Offset;
    bounds: {
      width: number;
      height: number;
      boxWidth: number;
      boxHeight: number;
    };
    moved: boolean;
  } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const box = event.currentTarget;
    const parent = box.offsetParent as HTMLElement | null;
    if (!parent) return;
    const rect = box.getBoundingClientRect();
    const area = parent.getBoundingClientRect();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      start: {
        right: area.right - rect.right,
        bottom: area.bottom - rect.bottom,
      },
      bounds: {
        width: area.width,
        height: area.height,
        boxWidth: rect.width,
        boxHeight: rect.height,
      },
      moved: false,
    };
    box.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    current.moved = true;
    const { width, height, boxWidth, boxHeight } = current.bounds;
    setOffset({
      right: Math.round(
        Math.min(Math.max(0, current.start.right - dx), width - boxWidth),
      ),
      bottom: Math.round(
        Math.min(
          Math.max(BAR_HEIGHT, current.start.bottom - dy),
          height - boxHeight,
        ),
      ),
    });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current) return;
    if (!current.moved) {
      onClick();
      return;
    }
    setOffset((value) => {
      try {
        if (value)
          localStorage.setItem(VIDEO_POSITION_KEY, JSON.stringify(value));
      } catch {
        // Not essential.
      }
      return value;
    });
  };
  // A narrower window keeps the box inside instead of pushing it out.
  const style: CSSProperties | undefined = offset
    ? {
        right: `min(${offset.right}px, calc(100% - 320px))`,
        bottom: `min(${offset.bottom}px, calc(100% - 180px))`,
      }
    : undefined;
  return {
    style,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: () => {
        drag.current = null;
      },
    },
  };
}

export function AsmrPlayerView({
  hidden,
  onOpenWork,
}: {
  hidden: boolean;
  onOpenWork(id: number): void;
}) {
  const state = usePlayer();
  const media = useRef<HTMLVideoElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    asmrPlayer.attach(media.current);
    return () => asmrPlayer.attach(null);
  }, []);
  const item = state.queue[state.index] ?? null;
  useShortcuts(!hidden && item !== null, state.expanded);
  useMediaSession(item, state.playing);
  const video = item?.kind === "video";
  const active = cueAt(state.cues, state.time);
  const cue = active >= 0 ? state.cues[active].text : null;
  const mode = !item
    ? "empty"
    : state.expanded
      ? "expanded"
      : video
        ? "floating"
        : "audio";
  const duration = state.duration || item?.durationSeconds || 0;
  const [desktopLyrics, setDesktopLyrics] = useDesktopLyrics(item, cue);
  const floating = useFloatingDrag(() => asmrPlayer.setExpanded(true));
  return (
    <>
      {item && state.expanded && (
        <FullPlayer
          key={`${item.workId}-${item.fileId}`}
          state={state}
          item={item}
          onOpenWork={onOpenWork}
        />
      )}
      <div
        className={`asmr-screen is-${mode}${video ? " is-video" : ""}`}
        ref={screen}
        data-testid="asmr-screen"
        style={mode === "floating" ? floating.style : undefined}
        title={mode === "floating" ? "拖动可移动，点击展开播放器" : undefined}
        {...(mode === "floating" ? floating.handlers : {})}
      >
        <video
          ref={media}
          className="asmr-video"
          playsInline
          preload="metadata"
          data-testid="asmr-media"
          onClick={() => {
            if (state.expanded) asmrPlayer.toggle();
          }}
        />
        {item && !video && (
          <AsmrCover
            id={item.workId}
            code={item.workCode}
            size="main"
            className="asmr-screen-cover"
          />
        )}
        {video && cue && <div className="asmr-video-cue">{cue}</div>}
        {video && state.expanded && (
          <button
            className="asmr-icon-button asmr-screen-fullscreen"
            aria-label="全屏"
            title="全屏"
            onClick={() => {
              const target = screen.current;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void target?.requestFullscreen().catch(() => undefined);
            }}
          >
            <Icon name="fullscreen" size={18} />
          </button>
        )}
      </div>
      {item && (
        <footer
          className="asmr-bar"
          aria-label="播放控制"
          data-testid="asmr-bar"
        >
          <button
            className="asmr-bar-now"
            title="展开播放器"
            onClick={() => asmrPlayer.setExpanded(!state.expanded)}
          >
            <AsmrCover
              id={item.workId}
              code={item.workCode}
              size="thumbnail"
              className="asmr-bar-cover"
            />
            <span className="asmr-bar-text">
              <strong data-testid="asmr-now-title">{item.title}</strong>
              <span
                className={cue ? "asmr-bar-cue" : undefined}
                data-testid="asmr-bar-cue"
              >
                {cue ?? `${item.workCode} · ${item.workTitle}`}
              </span>
            </span>
          </button>
          <div className="asmr-bar-center">
            <div className="asmr-bar-buttons">
              <button
                className="asmr-icon-button"
                aria-label="上一个"
                title="上一个 (Shift+P)"
                onClick={asmrPlayer.previous}
              >
                <Icon name="previous" size={18} />
              </button>
              <button
                className="asmr-play-button"
                aria-label={state.playing ? "暂停" : "播放"}
                title={state.playing ? "暂停 (空格)" : "播放 (空格)"}
                data-testid="asmr-play"
                onClick={asmrPlayer.toggle}
              >
                <Icon name={state.playing ? "pause" : "play"} size={20} />
              </button>
              <button
                className="asmr-icon-button"
                aria-label="下一个"
                title="下一个 (Shift+N)"
                disabled={state.index >= state.queue.length - 1}
                onClick={asmrPlayer.next}
              >
                <Icon name="next" size={18} />
              </button>
            </div>
            <div className="asmr-bar-progress">
              <span data-testid="asmr-time">{clock(state.time)}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={1}
                value={Math.min(state.time, duration || 1)}
                aria-label="播放进度"
                data-testid="asmr-progress"
                onChange={(event) =>
                  asmrPlayer.seek(Number(event.target.value))
                }
              />
              <span>{duration ? clock(duration) : "--:--"}</span>
            </div>
            {state.error ? (
              <p className="asmr-bar-error" role="alert">
                {state.error}
                <button className="asmr-text-button" onClick={asmrPlayer.retry}>
                  重试
                </button>
              </p>
            ) : (
              state.buffering && (
                <p className="asmr-bar-status" role="status">
                  正在缓冲…
                </p>
              )
            )}
          </div>
          <div className="asmr-bar-tools">
            <label className="asmr-player-rate" title="播放速度">
              <select
                value={state.rate}
                aria-label="播放速度"
                onChange={(event) =>
                  asmrPlayer.setRate(Number(event.target.value))
                }
              >
                {RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
            </label>
            <SleepControl state={state} />
            <button
              className={`asmr-icon-button asmr-lyrics-toggle${desktopLyrics ? " active" : ""}`}
              aria-label="桌面字幕"
              aria-pressed={desktopLyrics}
              title={
                desktopLyrics
                  ? "关闭桌面字幕（有字幕的文件会在桌面上显示字幕）"
                  : "打开桌面字幕：字幕显示在可拖到任意位置的置顶小窗里"
              }
              data-testid="asmr-desktop-lyrics"
              onClick={() => setDesktopLyrics(!desktopLyrics)}
            >
              <Icon name="captions" size={18} />
            </button>
            <div className="asmr-player-volume">
              <button
                className="asmr-icon-button"
                aria-label={state.muted ? "取消静音" : "静音"}
                title={state.muted ? "取消静音 (M)" : "静音 (M)"}
                onClick={asmrPlayer.toggleMute}
              >
                <Icon
                  name={state.muted || state.volume === 0 ? "mute" : "volume"}
                  size={18}
                />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.muted ? 0 : state.volume}
                aria-label="音量"
                onChange={(event) =>
                  asmrPlayer.setVolume(Number(event.target.value))
                }
              />
            </div>
            <button
              className="asmr-icon-button"
              aria-label={state.expanded ? "收起播放器" : "展开播放器"}
              title={state.expanded ? "收起播放器" : "展开播放器"}
              data-testid="asmr-expand"
              onClick={() => asmrPlayer.setExpanded(!state.expanded)}
            >
              <Icon
                name={state.expanded ? "chevronDown" : "chevronUp"}
                size={18}
              />
            </button>
            <button
              className="asmr-icon-button"
              aria-label="停止并关闭播放器"
              title="停止并关闭播放器"
              onClick={asmrPlayer.close}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </footer>
      )}
    </>
  );
}
