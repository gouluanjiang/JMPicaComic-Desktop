// Pure helpers for online playback: which files can play, which subtitle
// belongs to which file, which version folder to play, and subtitle parsing.

import type { AsmrFile, AsmrTrack } from "./asmr-types.ts";

export type PlayableKind = "audio" | "video";

export type PlayableFile = {
  fileId: number;
  title: string;
  kind: PlayableKind;
  durationSeconds: number | null;
  subtitleFileId: number | null;
};

export type PlayGroup = {
  /** Folder names from the root; empty for files at the top level. */
  path: string[];
  items: PlayableFile[];
};

export type Cue = { start: number; end: number; text: string };

const SUBTITLE_EXTENSIONS = ["vtt", "lrc", "srt"];
const MAX_CUES = 10_000;
const MAX_CUE_TEXT = 500;

export function extensionOf(title: string): string {
  const dot = title.lastIndexOf(".");
  return dot > 0 && dot < title.length - 1
    ? title.slice(dot + 1).toLowerCase()
    : "";
}

const withoutExtension = (title: string) => {
  const dot = title.lastIndexOf(".");
  return dot > 0 ? title.slice(0, dot) : title;
};

export const isSubtitle = (file: AsmrFile) =>
  file.kind === "text" && SUBTITLE_EXTENSIONS.includes(extensionOf(file.title));

type Located = { file: AsmrFile; path: string[] };

function flatten(tracks: AsmrTrack[], path: string[] = []): Located[] {
  return tracks.flatMap((track) =>
    track.type === "folder"
      ? flatten(track.children, [...path, track.title])
      : [{ file: track, path }],
  );
}

const samePath = (a: string[], b: string[]) =>
  a.length === b.length && a.every((part, index) => part === b[index]);

/**
 * The subtitle for a media file: `01.wav.vtt` or `01.vtt` next to it first,
 * then the same names anywhere in the work. VTT is preferred over LRC and SRT.
 */
export function subtitleFor(
  media: Located,
  subtitles: Located[],
): number | null {
  const names = new Set([
    media.file.title.toLowerCase(),
    withoutExtension(media.file.title).toLowerCase(),
  ]);
  const matching = subtitles.filter(
    (entry) =>
      entry.file.fileId !== null &&
      names.has(withoutExtension(entry.file.title).toLowerCase()),
  );
  const rank = (entry: Located) =>
    (samePath(entry.path, media.path) ? 0 : 10) +
    SUBTITLE_EXTENSIONS.indexOf(extensionOf(entry.file.title));
  matching.sort((a, b) => rank(a) - rank(b));
  return matching[0]?.file.fileId ?? null;
}

/** Playable files grouped by the folder that directly holds them. */
export function playGroups(tracks: AsmrTrack[]): PlayGroup[] {
  const files = flatten(tracks);
  const subtitles = files.filter((entry) => isSubtitle(entry.file));
  const groups: PlayGroup[] = [];
  for (const entry of files) {
    const { file } = entry;
    if (
      file.fileId === null ||
      (file.kind !== "audio" && file.kind !== "video")
    )
      continue;
    let group = groups.find((candidate) =>
      samePath(candidate.path, entry.path),
    );
    if (!group) {
      group = { path: entry.path, items: [] };
      groups.push(group);
    }
    group.items.push({
      fileId: file.fileId,
      title: file.title,
      kind: file.kind,
      durationSeconds: file.durationSeconds,
      subtitleFileId: subtitleFor(entry, subtitles),
    });
  }
  return groups;
}

export type SePreference = "with" | "without" | null;

const chineseHint =
  /中文|中字|汉化|漢化|简体|簡体|繁體|繁体|中国語|chs|cht|chinese/i;
const bonusHint = /特典|おまけ|オマケ|bonus|omake|附赠|赠品|贈品/i;
const noSeHint =
  /(se|効果音|效果音|音效)\s*[_-]?\s*(なし|無し|无|無|off|カット)|(无|無|没有|不含|no|without|ナシ)\s*[_-]?\s*(se|効果音|效果音|音效)/i;
const seHint =
  /(se|効果音|效果音|音效)\s*[_-]?\s*(あり|有り|有|付き|on)|(with|含|带|帶)\s*[_-]?\s*(se|効果音|效果音|音效)/i;
const lossless = new Set(["wav", "flac"]);

export function seKind(group: PlayGroup): SePreference {
  const text = group.path.join("/");
  if (noSeHint.test(text)) return "without";
  if (seHint.test(text)) return "with";
  return null;
}

/** Higher is better: Chinese, subtitled, original quality, not a bonus. */
function score(group: PlayGroup): number {
  const text = group.path.join("/");
  const subtitled = group.items.some((item) => item.subtitleFileId !== null);
  const original = group.items.every((item) =>
    lossless.has(extensionOf(item.title)),
  );
  return (
    (chineseHint.test(text) ? 4 : 0) +
    (subtitled ? 2 : 0) +
    (original ? 1 : 0) -
    (bonusHint.test(text) ? 3 : 0)
  );
}

export type GroupChoice =
  { group: PlayGroup } | { choices: PlayGroup[] } | { group: null };

/**
 * Picks the version folder to play. Folders that tie on everything but sound
 * effects follow the remembered preference; with none remembered, or any
 * other tie, the listener chooses.
 */
export function chooseGroup(
  groups: PlayGroup[],
  preference: SePreference,
): GroupChoice {
  if (groups.length === 0) return { group: null };
  if (groups.length === 1) return { group: groups[0] };
  const best = Math.max(...groups.map(score));
  let top = groups.filter((group) => score(group) === best);
  if (top.length > 1 && preference) {
    const preferred = top.filter((group) => seKind(group) === preference);
    if (preferred.length > 0) top = preferred;
  }
  return top.length === 1 ? { group: top[0] } : { choices: top };
}

function timestamp(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, hours, minutes, seconds, fraction] = match;
  return (
    Number(hours ?? 0) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    (fraction ? Number(fraction.padEnd(3, "0")) / 1000 : 0)
  );
}

const cleanCue = (text: string) =>
  text
    .replace(/<[^>]*>/g, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim()
    .slice(0, MAX_CUE_TEXT);

function parseBlocks(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const [from, rest] = lines[timing].split("-->");
    const start = timestamp(from);
    const end = timestamp(rest.trim().split(/\s+/)[0] ?? "");
    const body = cleanCue(lines.slice(timing + 1).join("\n"));
    if (start === null || end === null || end < start || !body) continue;
    cues.push({ start, end, text: body });
    if (cues.length >= MAX_CUES) break;
  }
  return cues;
}

function parseLrc(text: string): Cue[] {
  const timed: { start: number; text: string }[] = [];
  for (const line of text.split("\n")) {
    const tags = [...line.matchAll(/\[(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (tags.length === 0) continue;
    const body = cleanCue(line.replace(/\[[^\]]*\]/g, ""));
    for (const tag of tags) {
      const start = timestamp(tag[1].replace(/:(\d{1,3})$/, ".$1"));
      if (start !== null) timed.push({ start, text: body });
    }
    if (timed.length >= MAX_CUES) break;
  }
  timed.sort((a, b) => a.start - b.start);
  return timed
    .map((cue, index) => ({
      start: cue.start,
      end: timed[index + 1]?.start ?? cue.start + 8,
      text: cue.text,
    }))
    .filter((cue) => cue.text);
}

/** VTT, SRT or LRC text as cues sorted by start time. */
export function parseSubtitle(text: string, extension: string): Cue[] {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const cues =
    extension === "lrc" ? parseLrc(normalized) : parseBlocks(normalized);
  return cues.sort((a, b) => a.start - b.start);
}

/** Index of the cue showing at `time`, or -1. */
export function cueAt(cues: Cue[], time: number): number {
  let low = 0;
  let high = cues.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (cues[middle].start <= time) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found >= 0 && time < cues[found].end ? found : -1;
}

/** Address of a media file on the native media protocol. */
export function mediaUrl(workId: number, fileId: number): string {
  const path = `${workId}-${fileId}`;
  return /Windows|Android/.test(navigator.userAgent)
    ? `http://asmrmedia.localhost/${path}`
    : `asmrmedia://localhost/${path}`;
}
