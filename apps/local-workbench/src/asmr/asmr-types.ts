// Shapes returned by the native ASMR commands. Everything is re-validated here
// because the renderer treats native responses as untrusted input too.

export type AsmrOrder =
  "added" | "release" | "downloads" | "rating" | "reviews" | "price" | "random";
export type AsmrRelation = "circle" | "voiceActor" | "tag";
export type AsmrIndexKind = "circles" | "tags" | "voiceActors";
export type AsmrCoverSize = "thumbnail" | "main";
/** The site's five listening marks. */
export type AsmrProgress =
  "marked" | "listening" | "listened" | "replay" | "postponed";
export const PROGRESS: AsmrProgress[] = [
  "marked",
  "listening",
  "listened",
  "replay",
  "postponed",
];
export const progressLabels: Record<AsmrProgress, string> = {
  marked: "想听",
  listening: "在听",
  listened: "听过",
  replay: "重听",
  postponed: "搁置",
};

export type AsmrListQuery = {
  order: AsmrOrder;
  ascending: boolean;
  page: number;
  pageSize: number;
  subtitleOnly: boolean;
};

export type AsmrWork = {
  id: number;
  code: string;
  title: string;
  circle: { id: number; name: string } | null;
  voiceActors: { id: string; name: string }[];
  tags: { id: number; name: string }[];
  release: string | null;
  added: string | null;
  downloads: number;
  rating: number | null;
  ratingCount: number;
  reviewCount: number;
  price: number | null;
  durationSeconds: number | null;
  hasSubtitle: boolean;
  editions: { code: string; lang: string; label: string }[];
  /** The signed-in listener's own rating, 1 to 5. */
  userRating: number | null;
  /** The signed-in listener's mark, where the list reports it. */
  progress: AsmrProgress | null;
  /** When the mark or rating last changed. */
  marked: string | null;
};

export type AsmrPage = {
  works: AsmrWork[];
  page: number;
  pageSize: number;
  total: number;
};

export type AsmrIndexEntry = { id: string; name: string; count: number };

export type AsmrAccount = {
  signedIn: boolean;
  name: string | null;
  /** False when the session lasts for this run only. */
  remembered: boolean;
};

export type AsmrPlaylist = {
  id: string;
  name: string;
  description: string;
  works: number;
  coverWork: number | null;
  updated: string | null;
  privacy: AsmrPrivacy;
  /** Whether the work that was asked about is in this list. */
  contains: boolean | null;
};

/** Who can see a playlist. */
export type AsmrPrivacy = "private" | "unlisted" | "public";
export const PRIVACY: AsmrPrivacy[] = ["private", "unlisted", "public"];
export const privacyLabels: Record<AsmrPrivacy, string> = {
  private: "私享（只有你能看）",
  unlisted: "不公开（知道链接的人能看）",
  public: "公开（任何人都能看）",
};

export type AsmrPlaylistPage = {
  playlists: AsmrPlaylist[];
  page: number;
  pageSize: number;
  total: number;
};

export type AsmrFileKind = "audio" | "video" | "text" | "image" | "other";
export type AsmrFile = Extract<AsmrTrack, { type: "file" }>;
export type AsmrTrack =
  | { type: "folder"; title: string; children: AsmrTrack[] }
  | {
      type: "file";
      /** The site's file id; null when the file cannot be opened. */
      fileId: number | null;
      kind: AsmrFileKind;
      title: string;
      size: number | null;
      durationSeconds: number | null;
    };

export type AsmrWorkDetail = { work: AsmrWork; tracks: AsmrTrack[] };

export const PAGE_SIZE = 48;
// Native caps are in characters; UTF-16 lengths can be up to twice that.
const MAX_TEXT = 1100;
const workCode = /^[A-Z]{2}\d{6,8}$/;
const personId = /^[A-Za-z0-9-]{1,64}$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const playlistId = /^[0-9a-fA-F-]{36}$/;

export class AsmrError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function invalid(): never {
  throw new AsmrError("ASMR_RESPONSE_INVALID");
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : invalid();
const text = (value: unknown, limit = MAX_TEXT): string =>
  typeof value === "string" && value.length > 0 && value.length <= limit
    ? value
    : invalid();
const count = (value: unknown): number =>
  Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : invalid();
const optional = <T>(value: unknown, read: (value: unknown) => T): T | null =>
  value === null || value === undefined ? null : read(value);
const date = (value: unknown): string =>
  typeof value === "string" && isoDate.test(value) ? value : invalid();

export function validateWork(value: unknown): AsmrWork {
  const work = record(value);
  const id = count(work.id);
  if (id === 0) invalid();
  const code = text(work.code, 12);
  if (!workCode.test(code)) invalid();
  const circle = optional(work.circle, (raw) => {
    const circle = record(raw);
    return { id: count(circle.id), name: text(circle.name, 400) };
  });
  const rating = optional(work.rating, (raw) =>
    typeof raw === "number" && raw >= 0 && raw <= 5 ? raw : invalid(),
  );
  return {
    id,
    code,
    title: text(work.title),
    circle,
    voiceActors: list(work.voiceActors).map((raw) => {
      const person = record(raw);
      const personKey = text(person.id, 64);
      if (!personId.test(personKey)) invalid();
      return { id: personKey, name: text(person.name, 400) };
    }),
    tags: list(work.tags).map((raw) => {
      const tag = record(raw);
      return { id: count(tag.id), name: text(tag.name, 400) };
    }),
    release: optional(work.release, date),
    added: optional(work.added, date),
    downloads: count(work.downloads),
    rating,
    ratingCount: count(work.ratingCount),
    reviewCount: count(work.reviewCount),
    price: optional(work.price, count),
    durationSeconds: optional(work.durationSeconds, count),
    hasSubtitle: work.hasSubtitle === true,
    editions: list(work.editions).map((raw) => {
      const edition = record(raw);
      const editionCode = text(edition.code, 12);
      if (!workCode.test(editionCode)) invalid();
      return {
        code: editionCode,
        lang: text(edition.lang, 16),
        label: typeof edition.label === "string" ? edition.label : "",
      };
    }),
    userRating: optional(work.userRating, (raw) =>
      Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= 5
        ? (raw as number)
        : invalid(),
    ),
    progress: optional(work.progress, (raw) =>
      PROGRESS.includes(raw as AsmrProgress)
        ? (raw as AsmrProgress)
        : invalid(),
    ),
    marked: optional(work.marked, date),
  };
}

export function validatePage(value: unknown): AsmrPage {
  const page = record(value);
  const works = list(page.works);
  if (works.length > 100) invalid();
  return {
    works: works.map(validateWork),
    page: count(page.page),
    pageSize: count(page.pageSize),
    total: count(page.total),
  };
}

export function validateAccount(value: unknown): AsmrAccount {
  const account = record(value);
  const name = optional(account.name, (raw) => text(raw, 64));
  if (
    typeof account.signedIn !== "boolean" ||
    account.signedIn !== (name !== null)
  )
    invalid();
  return {
    signedIn: account.signedIn as boolean,
    name,
    remembered: account.remembered !== false,
  };
}

export function validatePlaylists(value: unknown): AsmrPlaylistPage {
  const page = record(value);
  const playlists = list(page.playlists);
  if (playlists.length > 100) invalid();
  return {
    playlists: playlists.map((raw) => {
      const playlist = record(raw);
      const id = text(playlist.id, 36);
      if (!playlistId.test(id)) invalid();
      const coverWork = optional(playlist.coverWork, count);
      if (coverWork === 0) invalid();
      return {
        id,
        name: text(playlist.name, 240),
        description:
          typeof playlist.description === "string" &&
          playlist.description.length <= MAX_TEXT
            ? playlist.description
            : invalid(),
        works: count(playlist.works),
        coverWork,
        updated: optional(playlist.updated, date),
        privacy: PRIVACY.includes(playlist.privacy as AsmrPrivacy)
          ? (playlist.privacy as AsmrPrivacy)
          : invalid(),
        contains: optional(playlist.contains, (raw) =>
          typeof raw === "boolean" ? raw : invalid(),
        ),
      };
    }),
    page: count(page.page),
    pageSize: count(page.pageSize),
    total: count(page.total),
  };
}

/** The site's own lists, which cannot be renamed or deleted. */
export function isSystemPlaylist(name: string): boolean {
  return name.startsWith("__SYS_PLAYLIST_");
}

/**
 * The mark playback sets by itself, or `null` to leave the work alone. It
 * only moves a work forward and never touches "replay" or "postponed".
 */
export function nextAutoMark(
  current: AsmrProgress | null,
  stage: "started" | "finished",
): AsmrProgress | null {
  if (current === null || current === "marked")
    return stage === "started" ? "listening" : "listened";
  return current === "listening" && stage === "finished" ? "listened" : null;
}

/** The site's default list has a reserved name instead of a title. */
export function playlistTitle(name: string): string {
  if (name === "__SYS_PLAYLIST_MARKED") return "我标记的";
  if (name === "__SYS_PLAYLIST_LIKED") return "我喜欢的";
  return name;
}

export function validateIndex(value: unknown): AsmrIndexEntry[] {
  return list(value).map((raw) => {
    const entry = record(raw);
    const id = text(entry.id, 64);
    if (!personId.test(id)) invalid();
    return { id, name: text(entry.name, 400), count: count(entry.count) };
  });
}

function validateTrack(value: unknown, depth: number): AsmrTrack {
  if (depth > 12) invalid();
  const node = record(value);
  if (node.type === "folder")
    return {
      type: "folder",
      title: text(node.title),
      children: list(node.children).map((child) =>
        validateTrack(child, depth + 1),
      ),
    };
  if (node.type !== "file") invalid();
  const kind = node.kind;
  if (
    kind !== "audio" &&
    kind !== "video" &&
    kind !== "text" &&
    kind !== "image" &&
    kind !== "other"
  )
    invalid();
  const fileId = optional(node.fileId, count);
  if (fileId === 0) invalid();
  return {
    type: "file",
    fileId,
    kind,
    title: text(node.title),
    size: optional(node.size, count),
    durationSeconds: optional(node.durationSeconds, (raw) =>
      typeof raw === "number" && Number.isFinite(raw) && raw > 0
        ? raw
        : invalid(),
    ),
  };
}

export function validateDetail(value: unknown): AsmrWorkDetail {
  const detail = record(value);
  return {
    work: validateWork(detail.work),
    tracks: list(detail.tracks).map((track) => validateTrack(track, 0)),
  };
}

export function validateCover(value: unknown, id: number): string | null {
  const cover = record(value);
  if (cover.id !== id) invalid();
  if (cover.dataUrl === null) return null;
  return typeof cover.dataUrl === "string" &&
    cover.dataUrl.length <= 6 * 1024 * 1024 &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(cover.dataUrl)
    ? cover.dataUrl
    : invalid();
}

/** Accepts `RJ01683351`, `rj1683351`, a bare id or an asmr.one work link. */
export function parseWorkInput(input: string): number | null {
  const trimmed = input.trim();
  const last =
    trimmed.split("/").filter(Boolean).pop()?.split(/[?#]/)[0]?.toUpperCase() ??
    "";
  const linked = /asmr\.one\/work\//i.test(trimmed);
  const match =
    /^RJ(\d{1,10})$/.exec(last) ?? (linked ? /^(\d{1,10})$/.exec(last) : null);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function workCodeFor(id: number): string {
  return `RJ${String(id).padStart(id >= 1_000_000 ? 8 : 6, "0")}`;
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
}

export function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Chinese editions or Chinese-subtitled works, for the language badge. */
export function chineseLabel(work: AsmrWork): string | null {
  const chinese = work.editions.find(
    (edition) => edition.lang.startsWith("CHI") && edition.code === work.code,
  );
  if (chinese) return chinese.lang === "CHI_HANT" ? "繁中" : "简中";
  return work.hasSubtitle ? "字幕" : null;
}

const messages: Record<string, string> = {
  ASMR_NETWORK: "连接 asmr.one 失败，请检查网络后重试。",
  ASMR_UNAVAILABLE: "asmr.one 暂时无法访问，请稍后再试。",
  ASMR_RATE_LIMITED: "请求太频繁，请稍等一会儿再试。",
  ASMR_NOT_FOUND: "没有找到这部作品。",
  ASMR_INVALID_INPUT: "输入无效，请检查后重试。",
  ASMR_RESPONSE_INVALID: "asmr.one 返回的数据无法识别。",
  ASMR_RESPONSE_TOO_LARGE: "asmr.one 返回的数据过大，已停止读取。",
  ASMR_REFUSED: "asmr.one 拒绝了这次请求。",
  ASMR_LOGIN_FAILED: "登录失败，请检查账号和密码。",
  ASMR_LOGIN_EXPIRED: "登录已失效，请重新登录。",
  ASMR_SIGNED_OUT: "请先登录 asmr.one 账号。",
};

export function asmrErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code: unknown }).code
      : undefined;
  return (
    (typeof code === "string" && messages[code]) || "读取失败，请稍后重试。"
  );
}
