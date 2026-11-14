import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Icon } from "../icons.tsx";
import {
  AsmrAccountButton,
  AsmrLoginDialog,
  isSessionError,
  useAsmrAccount,
} from "./AsmrAccount.tsx";
import { AsmrDetailPanel } from "./AsmrDetailPanel.tsx";
import { AsmrPlayerView } from "./AsmrPlayer.tsx";
import { AsmrCover, AsmrWorkCard } from "./AsmrWorkCard.tsx";
import type { OpenRelated } from "./AsmrWorkCard.tsx";
import {
  loadIndex,
  loadPlaylistWorks,
  loadPlaylists,
  loadPopular,
  loadRelated,
  loadReviews,
  loadWorks,
  searchWorks,
} from "./asmr-runtime.ts";
import {
  asmrErrorMessage,
  PAGE_SIZE,
  parseWorkInput,
  playlistTitle,
  PROGRESS,
  progressLabels,
} from "./asmr-types.ts";
import type {
  AsmrIndexEntry,
  AsmrIndexKind,
  AsmrListQuery,
  AsmrOrder,
  AsmrPage,
  AsmrPlaylist,
  AsmrProgress,
  AsmrRelation,
  AsmrWork,
} from "./asmr-types.ts";
import "./asmr.css";

export type AsmrTheme = "light" | "dark";

export type AsmrDestination =
  | "asmr-home"
  | "asmr-popular"
  | "asmr-random"
  | "asmr-favourites"
  | "asmr-playlists"
  | "asmr-circles"
  | "asmr-tags"
  | "asmr-voice-actors";

type View =
  | { kind: "home" }
  | { kind: "popular" }
  | { kind: "random" }
  | { kind: "favourites" }
  | { kind: "playlists" }
  | { kind: "playlist"; id: string; name: string }
  | { kind: "search"; keyword: string }
  | { kind: "related"; relation: AsmrRelation; id: string; name: string }
  | { kind: "index"; index: AsmrIndexKind };

type ViewMode = "grid" | "cards";

const VIEW_MODE_KEY = "jmpicacomic.asmr.viewMode";
const SUBTITLE_KEY = "jmpicacomic.asmr.subtitleOnly";

const orders: { value: AsmrOrder; label: string }[] = [
  { value: "added", label: "最新收录" },
  { value: "release", label: "发售日期" },
  { value: "downloads", label: "下载最多" },
  { value: "rating", label: "评分最高" },
  { value: "reviews", label: "评论最多" },
];

const indexTitles: Record<AsmrIndexKind, string> = {
  circles: "社团",
  tags: "标签",
  voiceActors: "声优",
};

const relationTitles: Record<AsmrRelation, string> = {
  circle: "社团",
  voiceActor: "声优",
  tag: "标签",
};

function readStored<T extends string>(key: string, allowed: T[], fallback: T) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences are a convenience; the session still works without them.
  }
}

export function viewFor(destination: AsmrDestination): View {
  switch (destination) {
    case "asmr-popular":
      return { kind: "popular" };
    case "asmr-random":
      return { kind: "random" };
    case "asmr-favourites":
      return { kind: "favourites" };
    case "asmr-playlists":
      return { kind: "playlists" };
    case "asmr-circles":
      return { kind: "index", index: "circles" };
    case "asmr-tags":
      return { kind: "index", index: "tags" };
    case "asmr-voice-actors":
      return { kind: "index", index: "voiceActors" };
    default:
      return { kind: "home" };
  }
}

function titleFor(view: View): string {
  switch (view.kind) {
    case "home":
      return "作品";
    case "popular":
      return "热门作品";
    case "random":
      return "随机听";
    case "favourites":
      return "我的收藏";
    case "playlists":
      return "播放列表";
    case "playlist":
      return `播放列表：${view.name}`;
    case "search":
      return `搜索：${view.keyword}`;
    case "related":
      return `${relationTitles[view.relation]}：${view.name}`;
    case "index":
      return indexTitles[view.index];
  }
}

type Loader = (query: AsmrListQuery) => Promise<AsmrPage>;

// Keeps one endless list to a size the page can render comfortably.
const MAX_LOADED = 2000;

type Loaded = {
  works: AsmrWork[];
  total: number;
  nextPage: number;
  done: boolean;
};

function WorkList({
  title,
  loader,
  loaderKey,
  sortable,
  defaultOrder,
  viewMode,
  onViewMode,
  subtitleOnly,
  onSubtitleOnly,
  selected,
  onOpen,
  onRelated,
  scrollRoot,
  filters,
  plain = false,
  onError,
}: {
  title: string;
  loader: Loader;
  loaderKey: string;
  sortable: boolean;
  defaultOrder: AsmrOrder;
  viewMode: ViewMode;
  onViewMode(mode: ViewMode): void;
  subtitleOnly: boolean;
  onSubtitleOnly(value: boolean): void;
  selected: number | null;
  onOpen(work: AsmrWork): void;
  onRelated: OpenRelated;
  scrollRoot: RefObject<HTMLDivElement | null>;
  /** Extra controls for this list, shown in its toolbar. */
  filters?: ReactNode;
  /** Hides the subtitle switch where the list cannot use it. */
  plain?: boolean;
  onError?(reason: unknown): void;
}) {
  const [order, setOrder] = useState<AsmrOrder>(defaultOrder);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadPage = (pageNumber: number, reset: boolean) => {
    const id = ++sequence.current;
    setLoading(true);
    setError(null);
    if (reset) setLoaded(null);
    loader({
      order,
      ascending: false,
      page: pageNumber,
      pageSize: PAGE_SIZE,
      subtitleOnly,
    })
      .then((result) => {
        if (id !== sequence.current) return;
        setLoaded((previous) => {
          const base = reset || !previous ? [] : previous.works;
          // New works can shift later pages; never show one twice.
          const seen = new Set(base.map((work) => work.id));
          const works = [
            ...base,
            ...result.works.filter((work) => !seen.has(work.id)),
          ].slice(0, MAX_LOADED);
          return {
            works,
            total: result.total,
            nextPage: pageNumber + 1,
            done:
              result.works.length === 0 ||
              // Account lists come in the site's own page size.
              pageNumber * (result.pageSize || PAGE_SIZE) >= result.total ||
              works.length >= MAX_LOADED,
          };
        });
      })
      .catch((reason) => {
        if (id !== sequence.current) return;
        setError(asmrErrorMessage(reason));
        onError?.(reason);
      })
      .finally(() => {
        if (id === sequence.current) setLoading(false);
      });
  };
  useEffect(() => {
    loadPage(1, true);
    // `loader` is recreated per render; `loaderKey` names what it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaderKey, order, subtitleOnly]);
  const loadMore = () => {
    if (loaded && !loaded.done && !loading) loadPage(loaded.nextPage, false);
  };
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !loaded || loaded.done || loading || error) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          loadPage(loaded.nextPage, false);
        }
      },
      { root: scrollRoot.current, rootMargin: "0px 0px 800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, loading, error]);
  const retry = () =>
    loaded ? loadPage(loaded.nextPage, false) : loadPage(1, true);
  const errorBlock = error && (
    <div className="asmr-error" role="alert">
      {error}
      <button className="asmr-text-button" onClick={retry}>
        重试
      </button>
    </div>
  );
  return (
    <section className="asmr-list" aria-label={title}>
      <div className="asmr-list-toolbar">
        <h2>
          {title}
          {loaded && <span className="asmr-count">（{loaded.total}）</span>}
        </h2>
        {sortable && (
          <label className="asmr-select">
            <span>排序</span>
            <select
              value={order}
              data-testid="asmr-order"
              onChange={(event) => setOrder(event.target.value as AsmrOrder)}
            >
              {orders.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {filters}
        {!plain && (
          <label className="asmr-toggle">
            <input
              type="checkbox"
              checked={subtitleOnly}
              data-testid="asmr-subtitle-only"
              onChange={(event) => onSubtitleOnly(event.target.checked)}
            />
            <span>带字幕</span>
          </label>
        )}
        <div className="asmr-view-modes" role="group" aria-label="显示方式">
          <button
            aria-pressed={viewMode === "grid"}
            aria-label="封面网格"
            title="封面网格"
            onClick={() => onViewMode("grid")}
          >
            <Icon name="grid" size={17} />
          </button>
          <button
            aria-pressed={viewMode === "cards"}
            aria-label="详细卡片"
            title="详细卡片"
            onClick={() => onViewMode("cards")}
          >
            <Icon name="list" size={17} />
          </button>
        </div>
      </div>
      {!loaded && errorBlock}
      {!loaded && !error && (
        <p className="asmr-muted" role="status">
          正在读取…
        </p>
      )}
      {loaded && loaded.works.length === 0 && (
        <p className="asmr-muted">没有找到作品。</p>
      )}
      {loaded && loaded.works.length > 0 && (
        <>
          <div
            className={`asmr-grid asmr-grid-${viewMode}`}
            data-testid="asmr-works"
          >
            {loaded.works.map((work) => (
              <AsmrWorkCard
                key={work.id}
                work={work}
                variant={viewMode}
                selected={selected === work.id}
                onOpen={onOpen}
                onRelated={onRelated}
              />
            ))}
          </div>
          <div
            ref={sentinel}
            className="asmr-list-end"
            data-testid="asmr-list-end"
          >
            {errorBlock}
            {loading ? (
              <span role="status">正在读取更多…</span>
            ) : loaded.done ? (
              <span>
                {loaded.works.length >= MAX_LOADED
                  ? `已显示 ${loaded.works.length} 部，可以用排序或搜索缩小范围`
                  : `已显示全部 ${loaded.works.length} 部`}
              </span>
            ) : (
              !error && (
                <button className="asmr-load-more" onClick={loadMore}>
                  加载更多（已显示 {loaded.works.length} / {loaded.total}）
                </button>
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}

function PopularStrip({
  subtitleOnly,
  selected,
  onOpen,
  onRelated,
  onMore,
}: {
  subtitleOnly: boolean;
  selected: number | null;
  onOpen(work: AsmrWork): void;
  onRelated: OpenRelated;
  onMore(): void;
}) {
  const [works, setWorks] = useState<AsmrWork[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setWorks(null);
    setFailed(false);
    loadPopular(1, subtitleOnly)
      .then((page) => {
        if (active) setWorks(page.works);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [subtitleOnly]);
  if (failed || (works && works.length === 0)) return null;
  return (
    <section className="asmr-popular" aria-label="热门作品">
      <button className="asmr-section-link" onClick={onMore}>
        热门作品 <Icon name="arrow" size={16} />
      </button>
      {!works ? (
        <p className="asmr-muted" role="status">
          正在读取…
        </p>
      ) : (
        <div className="asmr-strip" data-testid="asmr-popular-strip">
          {works.map((work) => (
            <AsmrWorkCard
              key={work.id}
              work={work}
              variant="cards"
              selected={selected === work.id}
              onOpen={onOpen}
              onRelated={onRelated}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function IndexView({
  kind,
  onRelated,
}: {
  kind: AsmrIndexKind;
  onRelated: OpenRelated;
}) {
  const [entries, setEntries] = useState<AsmrIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(300);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setEntries(null);
    setError(null);
    setFilter("");
    setLimit(300);
    loadIndex(kind)
      .then((value) => {
        if (active)
          setEntries(
            [...value].sort((left, right) => right.count - left.count),
          );
      })
      .catch((reason) => {
        if (active) setError(asmrErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [kind, attempt]);
  const relation: AsmrRelation =
    kind === "circles" ? "circle" : kind === "tags" ? "tag" : "voiceActor";
  const matching = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return (entries ?? []).filter((entry) =>
      entry.name.toLocaleLowerCase().includes(needle),
    );
  }, [entries, filter]);
  return (
    <section className="asmr-list" aria-label={indexTitles[kind]}>
      <div className="asmr-list-toolbar">
        <h2>
          {indexTitles[kind]}
          {entries && <span className="asmr-count">（{entries.length}）</span>}
        </h2>
        <input
          className="asmr-filter"
          type="search"
          placeholder={`筛选${indexTitles[kind]}…`}
          aria-label={`筛选${indexTitles[kind]}`}
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setLimit(300);
          }}
        />
      </div>
      {error && (
        <div className="asmr-error" role="alert">
          {error}
          <button
            className="asmr-text-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            重试
          </button>
        </div>
      )}
      {!entries && !error && (
        <p className="asmr-muted" role="status">
          正在读取…
        </p>
      )}
      {entries && (
        <div className="asmr-index" data-testid="asmr-index">
          {matching.slice(0, limit).map((entry) => (
            <button
              key={entry.id}
              className="asmr-index-entry"
              onClick={() => onRelated(relation, entry.id, entry.name)}
            >
              <span>{entry.name}</span>
              <span className="asmr-muted">{entry.count}</span>
            </button>
          ))}
          {matching.length === 0 && (
            <p className="asmr-muted">没有匹配的{indexTitles[kind]}。</p>
          )}
        </div>
      )}
      {matching.length > limit && (
        <button
          className="asmr-text-button asmr-more"
          onClick={() => setLimit((value) => value + 300)}
        >
          显示更多（还有 {matching.length - limit} 个）
        </button>
      )}
    </section>
  );
}

function SignInPrompt({ what, onLogin }: { what: string; onLogin(): void }) {
  return (
    <section className="asmr-list" aria-label={what}>
      <div className="asmr-sign-in" data-testid="asmr-sign-in">
        <p>登录 asmr.one 账号后可以查看{what}。</p>
        <button className="asmr-primary-button" onClick={onLogin}>
          登录
        </button>
      </div>
    </section>
  );
}

type ListProps = Omit<
  Parameters<typeof WorkList>[0],
  "title" | "loader" | "loaderKey" | "sortable" | "defaultOrder" | "filters"
>;

/** Works the listener marked or rated, as the site's favourites page shows. */
function FavouritesView({ listProps }: { listProps: ListProps }) {
  const [progress, setProgress] = useState<AsmrProgress | null>(null);
  const [ascending, setAscending] = useState(false);
  const filters = (
    <>
      <div
        className="asmr-tabs"
        role="group"
        aria-label="按标记筛选"
        data-testid="asmr-progress-filter"
      >
        <button
          aria-pressed={progress === null}
          onClick={() => setProgress(null)}
        >
          全部
        </button>
        {PROGRESS.map((value) => (
          <button
            key={value}
            aria-pressed={progress === value}
            onClick={() => setProgress(value)}
          >
            {progressLabels[value]}
          </button>
        ))}
      </div>
      <button
        className="asmr-text-button"
        data-testid="asmr-review-order"
        title="按标记时间排序"
        onClick={() => setAscending((value) => !value)}
      >
        {ascending ? "最早标记在前" : "最近标记在前"}
      </button>
    </>
  );
  return (
    <WorkList
      key={`reviews:${progress}:${ascending}`}
      {...listProps}
      title="我的收藏"
      loaderKey={`reviews:${progress}:${ascending}`}
      loader={(listQuery) => loadReviews(progress, ascending, listQuery.page)}
      sortable={false}
      defaultOrder="added"
      filters={filters}
      plain
    />
  );
}

function PlaylistsView({
  onOpen,
  onError,
}: {
  onOpen(playlist: AsmrPlaylist): void;
  onError(reason: unknown): void;
}) {
  const [playlists, setPlaylists] = useState<AsmrPlaylist[] | null>(null);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = (page: number) => {
    setLoading(true);
    setError(null);
    loadPlaylists(page)
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
      .catch((reason) => {
        setError(asmrErrorMessage(reason));
        onError(reason);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="asmr-list" aria-label="播放列表">
      <div className="asmr-list-toolbar">
        <h2>
          播放列表
          {playlists && <span className="asmr-count">（{total}）</span>}
        </h2>
      </div>
      {error && (
        <div className="asmr-error" role="alert">
          {error}
          <button
            className="asmr-text-button"
            onClick={() => load(playlists ? nextPage : 1)}
          >
            重试
          </button>
        </div>
      )}
      {!playlists && !error && (
        <p className="asmr-muted" role="status">
          正在读取…
        </p>
      )}
      {playlists && playlists.length === 0 && (
        <p className="asmr-muted">还没有播放列表。</p>
      )}
      {playlists && playlists.length > 0 && (
        <div className="asmr-playlists" data-testid="asmr-playlists">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              className="asmr-playlist"
              onClick={() => onOpen(playlist)}
            >
              {playlist.coverWork !== null ? (
                <AsmrCover
                  id={playlist.coverWork}
                  code=""
                  size="main"
                  className="asmr-playlist-cover"
                />
              ) : (
                <span className="asmr-cover asmr-playlist-cover" />
              )}
              <strong>{playlistTitle(playlist.name)}</strong>
              <span className="asmr-muted">{playlist.works} 部作品</span>
            </button>
          ))}
        </div>
      )}
      {playlists && playlists.length < total && !error && (
        <button
          className="asmr-load-more"
          disabled={loading}
          onClick={() => load(nextPage)}
        >
          {loading ? "正在读取…" : "加载更多"}
        </button>
      )}
    </section>
  );
}

export function AsmrWorkspace({
  destination,
  navigationKey,
  hidden = false,
  theme = "light",
  onTheme,
}: {
  destination: AsmrDestination;
  navigationKey: number;
  hidden?: boolean;
  theme?: AsmrTheme;
  onTheme?(theme: AsmrTheme): void;
}) {
  const [history, setHistory] = useState<View[]>(() => [viewFor(destination)]);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    readStored<ViewMode>(VIEW_MODE_KEY, ["grid", "cards"], "grid"),
  );
  const [subtitleOnly, setSubtitleOnly] = useState(
    () => readStored(SUBTITLE_KEY, ["true", "false"], "false") === "true",
  );
  const content = useRef<HTMLDivElement>(null);
  const view = history[history.length - 1];
  const { account, refresh, login, logout } = useAsmrAccount();
  const [loginOpen, setLoginOpen] = useState(false);
  const signedIn = account?.signedIn === true;
  // A session the site or the program dropped shows as signed out at once.
  const onListError = (reason: unknown) => {
    if (isSessionError(reason)) refresh();
  };
  useEffect(() => {
    setHistory([viewFor(destination)]);
    setSelected(null);
  }, [destination, navigationKey]);
  const scrollTop = () => content.current?.scrollTo({ top: 0 });
  const go = (next: View) => {
    setHistory((previous) => [...previous.slice(-19), next]);
    scrollTop();
  };
  const openRelated: OpenRelated = (relation, id, name) =>
    go({ kind: "related", relation, id, name });
  const openWork = (work: AsmrWork) => setSelected(work.id);
  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    store(VIEW_MODE_KEY, mode);
  };
  const changeSubtitleOnly = (value: boolean) => {
    setSubtitleOnly(value);
    store(SUBTITLE_KEY, String(value));
  };
  const submitSearch = () => {
    const keyword = query.trim();
    if (!keyword) return;
    const id = parseWorkInput(keyword);
    if (id !== null) setSelected(id);
    go({ kind: "search", keyword });
  };
  const listProps = {
    viewMode,
    onViewMode: changeViewMode,
    subtitleOnly,
    onSubtitleOnly: changeSubtitleOnly,
    selected,
    onOpen: openWork,
    onRelated: openRelated,
    scrollRoot: content,
    onError: onListError,
  };
  // Each list is keyed by what it loads, so page and order start fresh.
  let body: ReactNode = null;
  switch (view.kind) {
    case "home":
      body = (
        <>
          <PopularStrip
            subtitleOnly={subtitleOnly}
            selected={selected}
            onOpen={openWork}
            onRelated={openRelated}
            onMore={() => go({ kind: "popular" })}
          />
          <WorkList
            key="works"
            {...listProps}
            title="全部作品"
            loaderKey="works"
            loader={loadWorks}
            sortable
            defaultOrder="added"
          />
        </>
      );
      break;
    case "popular":
      body = (
        <WorkList
          key="popular"
          {...listProps}
          title="热门作品"
          loaderKey="popular"
          loader={(listQuery) =>
            loadPopular(listQuery.page, listQuery.subtitleOnly)
          }
          sortable={false}
          defaultOrder="added"
        />
      );
      break;
    case "random":
      body = (
        <WorkList
          key="random"
          {...listProps}
          title="随机听"
          loaderKey="random"
          loader={loadWorks}
          sortable={false}
          defaultOrder="random"
        />
      );
      break;
    case "favourites":
      body = !account ? null : signedIn ? (
        <FavouritesView key={account.name} listProps={listProps} />
      ) : (
        <SignInPrompt
          what="你的收藏和标记"
          onLogin={() => setLoginOpen(true)}
        />
      );
      break;
    case "playlists":
      body = !account ? null : signedIn ? (
        <PlaylistsView
          key={account.name}
          onError={onListError}
          onOpen={(playlist) =>
            go({
              kind: "playlist",
              id: playlist.id,
              name: playlistTitle(playlist.name),
            })
          }
        />
      ) : (
        <SignInPrompt what="你的播放列表" onLogin={() => setLoginOpen(true)} />
      );
      break;
    case "playlist":
      body = signedIn ? (
        <WorkList
          key={`playlist:${view.id}`}
          {...listProps}
          title={view.name}
          loaderKey={`playlist:${view.id}`}
          loader={(listQuery) => loadPlaylistWorks(view.id, listQuery.page)}
          sortable={false}
          defaultOrder="added"
          plain
        />
      ) : (
        <SignInPrompt what="这个播放列表" onLogin={() => setLoginOpen(true)} />
      );
      break;
    case "search":
      body = (
        <WorkList
          key={`search:${view.keyword}`}
          {...listProps}
          title={`搜索：${view.keyword}`}
          loaderKey={`search:${view.keyword}`}
          loader={(listQuery) => searchWorks(view.keyword, listQuery)}
          sortable
          defaultOrder="added"
        />
      );
      break;
    case "related":
      body = (
        <WorkList
          key={`${view.relation}:${view.id}`}
          {...listProps}
          title={`${relationTitles[view.relation]}：${view.name}`}
          loaderKey={`${view.relation}:${view.id}`}
          loader={(listQuery) => loadRelated(view.relation, view.id, listQuery)}
          sortable
          defaultOrder="added"
        />
      );
      break;
    case "index":
      body = <IndexView kind={view.index} onRelated={openRelated} />;
      break;
  }
  return (
    <div
      className={`asmr-workspace${selected !== null ? " has-detail" : ""}`}
      data-testid="asmr-workspace"
      data-theme={theme}
      hidden={hidden}
    >
      <header className="asmr-topbar">
        <button
          className="asmr-icon-button"
          aria-label="返回"
          title="返回"
          disabled={history.length <= 1}
          onClick={() => {
            setHistory((previous) => previous.slice(0, -1));
            scrollTop();
          }}
        >
          <Icon name="back" size={19} />
        </button>
        <h1 className="asmr-title">{titleFor(view)}</h1>
        <form
          className="asmr-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <Icon name="search" size={17} />
          <input
            type="search"
            value={query}
            placeholder="搜索标题、社团、声优或 RJ 号"
            aria-label="搜索 ASMR 作品"
            data-testid="asmr-search"
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        <AsmrAccountButton
          account={account}
          onLogin={() => setLoginOpen(true)}
          onLogout={() => void logout()}
        />
        <button
          className="asmr-icon-button"
          data-testid="asmr-theme"
          aria-label={theme === "dark" ? "切换到浅色主题" : "切换到暗色主题"}
          title={theme === "dark" ? "切换到浅色主题" : "切换到暗色主题"}
          onClick={() => onTheme?.(theme === "dark" ? "light" : "dark")}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
        </button>
      </header>
      <div className="asmr-body">
        <div className="asmr-content" ref={content}>
          {body}
        </div>
        {selected !== null && (
          <AsmrDetailPanel
            // Signing in or out changes what a work's details carry.
            key={`${selected}:${account?.name ?? ""}`}
            id={selected}
            onClose={() => setSelected(null)}
            onOpenWork={setSelected}
            onRelated={openRelated}
          />
        )}
      </div>
      <AsmrPlayerView hidden={hidden} onOpenWork={setSelected} />
      {loginOpen && (
        <AsmrLoginDialog onLogin={login} onClose={() => setLoginOpen(false)} />
      )}
    </div>
  );
}
