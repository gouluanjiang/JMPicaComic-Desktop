// One player for the ASMR section. It owns a single media element that the
// player view attaches, so playback continues while the section is hidden.

import { invokeDesktop } from "../runtime.ts";
import { extensionOf, mediaUrl, parseSubtitle } from "./asmr-media.ts";
import type {
  Cue,
  PlayGroup,
  PlayableFile,
  SePreference,
} from "./asmr-media.ts";

export type QueueItem = PlayableFile & {
  workId: number;
  workCode: string;
  workTitle: string;
};

export type SleepTimer =
  | { mode: "minutes"; minutes: number; endsAt: number }
  | { mode: "track" }
  | null;

export type SubtitleState = "none" | "loading" | "ready" | "failed";

export type PlayerState = {
  queue: QueueItem[];
  index: number;
  playing: boolean;
  buffering: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  rate: number;
  error: string | null;
  cues: Cue[];
  subtitle: SubtitleState;
  sleep: SleepTimer;
  expanded: boolean;
};

const POSITIONS_KEY = "jmpicacomic.asmr.positions";
const LAST_KEY = "jmpicacomic.asmr.lastPlayed";
const SETTINGS_KEY = "jmpicacomic.asmr.player";
const SE_KEY = "jmpicacomic.asmr.sePreference";
const MAX_POSITIONS = 300;
const MAX_LAST = 300;
const SAVE_INTERVAL_MS = 5000;
const RESUME_MIN_SECONDS = 5;
const RESUME_TAIL_SECONDS = 10;
const SLEEP_FADE_MS = 4000;
export const RATES = [0.75, 1, 1.25, 1.5, 2];

type Positions = Record<string, { t: number; at: number }>;
type LastPlayed = Record<string, { fileId: number; at: number }>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? (JSON.parse(raw) as unknown) : null;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as T)
      : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full or unavailable; playback does not depend on it.
  }
}

/** Keeps the newest `limit` entries by their `at` time. */
function trim<T extends { at: number }>(
  entries: Record<string, T>,
  limit: number,
): Record<string, T> {
  const keys = Object.keys(entries);
  if (keys.length <= limit) return entries;
  keys.sort((a, b) => entries[b].at - entries[a].at);
  return Object.fromEntries(
    keys.slice(0, limit).map((key) => [key, entries[key]]),
  );
}

const positionKey = (item: { workId: number; fileId: number }) =>
  `${item.workId}-${item.fileId}`;

export function savedPosition(workId: number, fileId: number): number | null {
  const entry = readJson<Positions>(POSITIONS_KEY, {})[`${workId}-${fileId}`];
  return entry && Number.isFinite(entry.t) && entry.t > 0 ? entry.t : null;
}

export function lastPlayed(workId: number): number | null {
  const entry = readJson<LastPlayed>(LAST_KEY, {})[String(workId)];
  return entry && Number.isSafeInteger(entry.fileId) ? entry.fileId : null;
}

export function sePreference(): SePreference {
  try {
    const value = localStorage.getItem(SE_KEY);
    return value === "with" || value === "without" ? value : null;
  } catch {
    return null;
  }
}

export function rememberSePreference(value: SePreference) {
  try {
    if (value) localStorage.setItem(SE_KEY, value);
  } catch {
    // Not essential.
  }
}

const loadText = (workId: number, fileId: number) =>
  invokeDesktop("asmr_subtitle", { workId, fileId }).then((value) => {
    if (typeof value !== "string") throw new Error("ASMR_RESPONSE_INVALID");
    return value;
  });

function mediaErrorMessage(element: HTMLMediaElement, item: QueueItem) {
  switch (element.error?.code) {
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return `无法在线播放这个文件（${extensionOf(item.title).toUpperCase() || "未知格式"}），可能是格式不受支持或网络读取失败。`;
    case MediaError.MEDIA_ERR_DECODE:
      return "文件解码失败，无法继续播放。";
    case MediaError.MEDIA_ERR_NETWORK:
      return "网络中断，播放停止了。";
    default:
      return "播放失败，请重试。";
  }
}

export class AsmrPlayer {
  private state: PlayerState;
  private listeners = new Set<() => void>();
  private element: HTMLMediaElement | null = null;
  private detach: (() => void) | null = null;
  private resumeAt: number | null = null;
  private autoplay = false;
  private lastSave = 0;
  private subtitleToken = 0;
  private sleepTimer: ReturnType<typeof setInterval> | null = null;
  private fading = false;

  constructor() {
    const settings = readJson<{ volume?: unknown; rate?: unknown }>(
      SETTINGS_KEY,
      {},
    );
    const volume =
      typeof settings.volume === "number" &&
      settings.volume >= 0 &&
      settings.volume <= 1
        ? settings.volume
        : 1;
    const rate =
      typeof settings.rate === "number" && RATES.includes(settings.rate)
        ? settings.rate
        : 1;
    this.state = {
      queue: [],
      index: 0,
      playing: false,
      buffering: false,
      time: 0,
      duration: 0,
      volume,
      muted: false,
      rate,
      error: null,
      cues: [],
      subtitle: "none",
      sleep: null,
      expanded: false,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  get current(): QueueItem | null {
    return this.state.queue[this.state.index] ?? null;
  }

  /** Called by the player view with its media element, or null on unmount. */
  attach(element: HTMLMediaElement | null) {
    if (element === this.element) return;
    this.detach?.();
    this.detach = null;
    this.element = element;
    if (!element) return;
    element.volume = this.state.volume;
    element.playbackRate = this.state.rate;
    const on = <K extends keyof HTMLMediaElementEventMap>(
      type: K,
      handler: () => void,
    ) => {
      element.addEventListener(type, handler);
      return () => element.removeEventListener(type, handler);
    };
    const offs = [
      on("timeupdate", () => {
        this.set({ time: element.currentTime });
        if (Date.now() - this.lastSave > SAVE_INTERVAL_MS) this.savePosition();
      }),
      on("durationchange", () =>
        this.set({
          duration: Number.isFinite(element.duration) ? element.duration : 0,
        }),
      ),
      on("loadedmetadata", () => {
        const resume = this.resumeAt;
        this.resumeAt = null;
        if (
          resume !== null &&
          Number.isFinite(element.duration) &&
          resume < element.duration - RESUME_TAIL_SECONDS
        )
          element.currentTime = resume;
        element.playbackRate = this.state.rate;
        if (this.autoplay) {
          this.autoplay = false;
          void element.play().catch(() => this.set({ playing: false }));
        }
      }),
      on("play", () => this.set({ playing: true, error: null })),
      on("pause", () => {
        this.set({ playing: false });
        this.savePosition();
      }),
      on("waiting", () => this.set({ buffering: true })),
      on("playing", () => this.set({ buffering: false, playing: true })),
      on("canplay", () => this.set({ buffering: false })),
      on("ended", () => this.ended()),
      on("error", () => {
        const item = this.current;
        if (!item) return;
        this.set({
          playing: false,
          buffering: false,
          error: mediaErrorMessage(element, item),
        });
      }),
    ];
    this.detach = () => offs.forEach((off) => off());
    if (this.current) this.load(this.state.index, false, this.state.time);
  }

  /** Replaces the queue with one version folder and starts at `fileId`. */
  playGroup(
    work: { id: number; code: string; title: string },
    group: PlayGroup,
    fileId: number | null = null,
    resume = true,
  ) {
    if (group.items.length === 0) return;
    this.savePosition();
    const queue = group.items.map((item) => ({
      ...item,
      workId: work.id,
      workCode: work.code,
      workTitle: work.title,
    }));
    const start = Math.max(
      0,
      queue.findIndex((item) => item.fileId === fileId),
    );
    const resumeAt = resume
      ? savedPosition(work.id, queue[start].fileId)
      : null;
    this.set({ queue, index: start });
    this.load(start, true, resumeAt);
  }

  private load(index: number, autoplay: boolean, resumeAt: number | null) {
    const item = this.state.queue[index];
    if (!item) return;
    this.set({
      index,
      time: resumeAt ?? 0,
      duration: item.durationSeconds ?? 0,
      error: null,
      buffering: autoplay,
      playing: false,
    });
    this.rememberLast(item);
    this.loadSubtitle(item);
    const element = this.element;
    if (!element) return;
    this.resumeAt = resumeAt;
    this.autoplay = autoplay;
    element.src = mediaUrl(item.workId, item.fileId);
    element.load();
  }

  private loadSubtitle(item: QueueItem) {
    const token = ++this.subtitleToken;
    if (item.subtitleFileId === null) {
      this.set({ cues: [], subtitle: "none" });
      return;
    }
    this.set({ cues: [], subtitle: "loading" });
    const subtitleId = item.subtitleFileId;
    loadText(item.workId, subtitleId)
      .then((text) => {
        if (token !== this.subtitleToken) return;
        // The extension decides the parser; the matching code keeps it known.
        const cues = parseSubtitle(text, this.subtitleExtension(text));
        this.set({ cues, subtitle: cues.length ? "ready" : "failed" });
      })
      .catch(() => {
        if (token === this.subtitleToken) this.set({ subtitle: "failed" });
      });
  }

  private subtitleExtension(text: string) {
    if (/^﻿?WEBVTT/.test(text)) return "vtt";
    return /^\s*\[\d{1,3}:\d{1,2}/m.test(text) && !text.includes("-->")
      ? "lrc"
      : "srt";
  }

  private rememberLast(item: QueueItem) {
    const last = readJson<LastPlayed>(LAST_KEY, {});
    last[String(item.workId)] = { fileId: item.fileId, at: Date.now() };
    writeJson(LAST_KEY, trim(last, MAX_LAST));
  }

  private savePosition() {
    const item = this.current;
    const element = this.element;
    if (!item || !element || !element.src) return;
    this.lastSave = Date.now();
    const time = element.currentTime;
    const duration = Number.isFinite(element.duration) ? element.duration : 0;
    const positions = readJson<Positions>(POSITIONS_KEY, {});
    const key = positionKey(item);
    // A finished or barely started file starts from the beginning next time.
    if (
      time < RESUME_MIN_SECONDS ||
      (duration > 0 && time > duration - RESUME_TAIL_SECONDS)
    )
      delete positions[key];
    else positions[key] = { t: Math.floor(time), at: Date.now() };
    writeJson(POSITIONS_KEY, trim(positions, MAX_POSITIONS));
  }

  private ended() {
    const item = this.current;
    if (item) {
      const positions = readJson<Positions>(POSITIONS_KEY, {});
      delete positions[positionKey(item)];
      writeJson(POSITIONS_KEY, positions);
    }
    if (this.state.sleep?.mode === "track") {
      this.set({ sleep: null, playing: false });
      return;
    }
    if (this.state.index < this.state.queue.length - 1)
      this.load(this.state.index + 1, true, null);
    else this.set({ playing: false });
  }

  toggle = () => {
    const element = this.element;
    if (!element || !this.current) return;
    if (this.state.error) {
      this.retry();
      return;
    }
    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  };

  retry = () => {
    const element = this.element;
    const time = element?.currentTime || this.state.time;
    this.load(this.state.index, true, time > 0 ? time : null);
  };

  next = () => {
    if (this.state.index < this.state.queue.length - 1) {
      this.savePosition();
      this.load(this.state.index + 1, true, null);
    }
  };

  previous = () => {
    const element = this.element;
    // Like most players: restart the track unless it has only just begun.
    if (element && element.currentTime > 3) element.currentTime = 0;
    else if (this.state.index > 0) {
      this.savePosition();
      this.load(this.state.index - 1, true, null);
    } else if (element) element.currentTime = 0;
  };

  jump = (index: number) => {
    if (
      index >= 0 &&
      index < this.state.queue.length &&
      index !== this.state.index
    ) {
      this.savePosition();
      const item = this.state.queue[index];
      this.load(index, true, savedPosition(item.workId, item.fileId));
    }
  };

  seek = (time: number) => {
    const element = this.element;
    if (!element || !Number.isFinite(time)) return;
    const duration = Number.isFinite(element.duration)
      ? element.duration
      : this.state.duration;
    element.currentTime = Math.max(
      0,
      duration ? Math.min(time, duration) : time,
    );
    this.set({ time: element.currentTime });
  };

  skip = (seconds: number) => {
    const element = this.element;
    if (element) this.seek(element.currentTime + seconds);
  };

  setVolume = (volume: number) => {
    const value = Math.min(1, Math.max(0, volume));
    if (this.element && !this.fading) this.element.volume = value;
    if (this.element) this.element.muted = false;
    this.set({ volume: value, muted: false });
    this.saveSettings();
  };

  toggleMute = () => {
    const muted = !this.state.muted;
    if (this.element) this.element.muted = muted;
    this.set({ muted });
  };

  setRate = (rate: number) => {
    if (!RATES.includes(rate)) return;
    if (this.element) this.element.playbackRate = rate;
    this.set({ rate });
    this.saveSettings();
  };

  private saveSettings() {
    writeJson(SETTINGS_KEY, {
      volume: this.state.volume,
      rate: this.state.rate,
    });
  }

  setExpanded = (expanded: boolean) => this.set({ expanded });

  /** Minutes from now, the end of the current file, or off. */
  setSleep = (minutes: number | "track" | null) => {
    if (this.sleepTimer) clearInterval(this.sleepTimer);
    this.sleepTimer = null;
    if (minutes === null) {
      this.set({ sleep: null });
      return;
    }
    if (minutes === "track") {
      this.set({ sleep: { mode: "track" } });
      return;
    }
    const endsAt = Date.now() + minutes * 60_000;
    this.set({ sleep: { mode: "minutes", minutes, endsAt } });
    this.sleepTimer = setInterval(() => {
      if (Date.now() >= endsAt) {
        if (this.sleepTimer) clearInterval(this.sleepTimer);
        this.sleepTimer = null;
        this.fadeOut();
      } else this.set({});
    }, 1000);
  };

  /** Lowers the volume over a few seconds, pauses, then restores it. */
  private fadeOut() {
    const element = this.element;
    this.set({ sleep: null });
    if (!element || element.paused) return;
    this.fading = true;
    const start = element.volume;
    const began = Date.now();
    const step = setInterval(() => {
      const progress = (Date.now() - began) / SLEEP_FADE_MS;
      if (progress >= 1) {
        clearInterval(step);
        element.pause();
        element.volume = this.state.volume;
        this.fading = false;
      } else element.volume = start * (1 - progress);
    }, 100);
  }

  /** Stops playback and clears the queue. */
  close = () => {
    this.savePosition();
    this.setSleep(null);
    const element = this.element;
    if (element) {
      element.pause();
      element.removeAttribute("src");
      element.load();
    }
    this.subtitleToken++;
    this.set({
      queue: [],
      index: 0,
      playing: false,
      buffering: false,
      time: 0,
      duration: 0,
      error: null,
      cues: [],
      subtitle: "none",
      expanded: false,
    });
  };
}

export const asmrPlayer = new AsmrPlayer();
