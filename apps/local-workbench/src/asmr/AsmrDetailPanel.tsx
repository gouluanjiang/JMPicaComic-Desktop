import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "../icons.tsx";
import { AsmrMyReview, AsmrPlaylistPicker } from "./AsmrAccountActions.tsx";
import { noteProgress } from "./asmr-marks.ts";
import { chooseGroup, playGroups, seKind } from "./asmr-media.ts";
import type { PlayGroup } from "./asmr-media.ts";
import {
  asmrPlayer,
  lastPlayed,
  rememberSePreference,
  sePreference,
} from "./asmr-player.ts";
import { loadWork } from "./asmr-runtime.ts";
import {
  asmrErrorMessage,
  formatDuration,
  formatSize,
  parseWorkInput,
} from "./asmr-types.ts";
import type { AsmrTrack, AsmrWork, AsmrWorkDetail } from "./asmr-types.ts";
import { AsmrChips, AsmrCover, AsmrStars } from "./AsmrWorkCard.tsx";
import type { OpenRelated } from "./AsmrWorkCard.tsx";

const kindIcon = {
  audio: "headphones",
  video: "film",
  text: "book",
  image: "grid",
  other: "folder",
} as const;

function containsFile(tracks: AsmrTrack[], fileId: number): boolean {
  return tracks.some((track) =>
    track.type === "folder"
      ? containsFile(track.children, fileId)
      : track.fileId === fileId,
  );
}

function countFiles(tracks: AsmrTrack[]): number {
  return tracks.reduce(
    (total, track) =>
      total + (track.type === "folder" ? countFiles(track.children) : 1),
    0,
  );
}

type TreeProps = {
  depth: number;
  playing: number | null;
  onPlay(fileId: number): void;
};

/** The file id now playing from this work, as a primitive for cheap renders. */
function usePlayingFile(workId: number): number | null {
  return useSyncExternalStore(asmrPlayer.subscribe, () => {
    const state = asmrPlayer.getState();
    const item = state.queue[state.index];
    return item && item.workId === workId ? item.fileId : null;
  });
}

function TrackTree({
  tracks,
  ...props
}: TreeProps & {
  tracks: AsmrTrack[];
}) {
  const { depth, playing, onPlay } = props;
  return (
    <ul className="asmr-tracks" role={depth === 0 ? "tree" : "group"}>
      {tracks.map((track, index) => {
        const key = `${index}:${track.title}`;
        if (track.type === "folder")
          return <Folder key={key} track={track} {...props} />;
        const meta = (
          <>
            <Icon name={kindIcon[track.kind]} size={16} />
            <span className="asmr-track-title">{track.title}</span>
            <span className="asmr-track-meta">
              {formatDuration(track.durationSeconds) ??
                formatSize(track.size) ??
                ""}
            </span>
          </>
        );
        const fileId = track.fileId;
        const playable =
          fileId !== null && (track.kind === "audio" || track.kind === "video");
        return playable ? (
          <li key={key} role="treeitem">
            <button
              className={`asmr-track asmr-track-${track.kind}${playing === fileId ? " playing" : ""}`}
              aria-current={playing === fileId ? "true" : undefined}
              aria-label={`播放 ${track.title}`}
              title={`播放 ${track.title}`}
              onClick={() => onPlay(fileId)}
            >
              {meta}
            </button>
          </li>
        ) : (
          <li
            key={key}
            className={`asmr-track asmr-track-${track.kind}`}
            role="treeitem"
          >
            {meta}
          </li>
        );
      })}
    </ul>
  );
}

function Folder({
  track,
  ...props
}: TreeProps & {
  track: Extract<AsmrTrack, { type: "folder" }>;
}) {
  const [open, setOpen] = useState(props.depth === 0);
  // The folder holding what is playing opens so the file can be seen.
  const holdsPlaying =
    props.playing !== null && containsFile(track.children, props.playing);
  useEffect(() => {
    if (holdsPlaying) setOpen(true);
  }, [holdsPlaying]);
  return (
    <li className="asmr-folder" role="treeitem" aria-expanded={open}>
      <button className="asmr-folder-toggle" onClick={() => setOpen(!open)}>
        <Icon name={open ? "folder" : "arrow"} size={16} />
        <span className="asmr-track-title">{track.title}</span>
        <span className="asmr-track-meta">
          {countFiles(track.children)} 个文件
        </span>
      </button>
      {open && (
        <TrackTree tracks={track.children} {...props} depth={props.depth + 1} />
      )}
    </li>
  );
}

function PlaySection({
  work,
  groups,
  playing,
}: {
  work: AsmrWork;
  groups: PlayGroup[];
  playing: number | null;
}) {
  const [choices, setChoices] = useState<PlayGroup[] | null>(null);
  if (groups.length === 0)
    return <p className="asmr-muted">这部作品没有可以在线播放的音频或视频。</p>;
  const start = (group: PlayGroup, fileId: number | null = null) => {
    setChoices(null);
    asmrPlayer.playGroup(work, group, fileId);
  };
  const last = lastPlayed(work.id);
  const lastGroup =
    last === null
      ? undefined
      : groups.find((group) =>
          group.items.some((item) => item.fileId === last),
        );
  const lastItem = lastGroup?.items.find((item) => item.fileId === last);
  return (
    <div className="asmr-play">
      <div className="asmr-play-buttons">
        <button
          className="asmr-primary-button"
          data-testid="asmr-play-work"
          onClick={() => {
            const choice = chooseGroup(groups, sePreference());
            if ("choices" in choice) setChoices(choice.choices);
            else if (choice.group) start(choice.group);
          }}
        >
          <Icon name="play" size={16} />
          播放
        </button>
        {lastGroup && lastItem && playing === null && (
          <button
            className="asmr-secondary-button"
            data-testid="asmr-resume"
            title={lastItem.title}
            onClick={() => start(lastGroup, lastItem.fileId)}
          >
            继续：{lastItem.title}
          </button>
        )}
      </div>
      {choices && (
        <div
          className="asmr-version-choice"
          role="group"
          aria-label="选择版本"
          data-testid="asmr-version-choice"
        >
          <p>这部作品有多个版本，选择要播放的：</p>
          {choices.map((group) => (
            <button
              key={group.path.join("/")}
              onClick={() => {
                rememberSePreference(seKind(group));
                start(group);
              }}
            >
              <span>{group.path.join(" / ") || "顶层文件"}</span>
              <span className="asmr-track-meta">
                {group.items.length} 个文件
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AsmrDetailPanel({
  id,
  signedIn,
  onAccountError,
  onClose,
  onOpenWork,
  onRelated,
}: {
  id: number;
  /** Signed in, the panel shows and changes the listener's mark and lists. */
  signedIn: boolean;
  onAccountError(reason: unknown): void;
  onClose(): void;
  onOpenWork(id: number): void;
  onRelated: OpenRelated;
}) {
  const [detail, setDetail] = useState<AsmrWorkDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    loadWork(id)
      .then((value) => {
        if (!active) return;
        // Only a signed-in read says what the listener's mark really is.
        if (signedIn) noteProgress(value.work.id, value.work.progress);
        setDetail(value);
      })
      .catch((reason) => {
        if (active) setError(asmrErrorMessage(reason));
      });
    return () => {
      active = false;
    };
    // The panel is remounted when the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);
  const work = detail?.work;
  const duration = formatDuration(work?.durationSeconds ?? null);
  const groups = detail ? playGroups(detail.tracks) : [];
  const playing = usePlayingFile(id);
  const playFile = (fileId: number) => {
    const group = groups.find((candidate) =>
      candidate.items.some((item) => item.fileId === fileId),
    );
    if (work && group) asmrPlayer.playGroup(work, group, fileId);
  };
  return (
    <aside
      className="asmr-detail"
      aria-label="作品详情"
      data-testid="asmr-detail"
    >
      <header className="asmr-detail-header">
        <span>{work?.code ?? "作品详情"}</span>
        <button
          className="asmr-icon-button"
          aria-label="关闭详情"
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
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
      {!work && !error && (
        <p className="asmr-muted" role="status">
          正在读取作品信息…
        </p>
      )}
      {work && detail && (
        <div className="asmr-detail-body">
          <AsmrCover
            id={work.id}
            code={work.code}
            size="main"
            className="asmr-detail-cover"
          />
          <h2 className="asmr-detail-title">{work.title}</h2>
          {work.circle && (
            <button
              className="asmr-card-circle"
              onClick={() =>
                onRelated("circle", String(work.circle!.id), work.circle!.name)
              }
            >
              {work.circle.name}
            </button>
          )}
          <div className="asmr-card-stats">
            <AsmrStars rating={work.rating} count={work.ratingCount} />
            <span>下载 {work.downloads.toLocaleString("zh-CN")}</span>
            {work.reviewCount > 0 && <span>评论 {work.reviewCount}</span>}
            {duration && <span>时长 {duration}</span>}
            {work.price !== null && <span>{work.price} 日元</span>}
          </div>
          <dl className="asmr-detail-facts">
            {work.release && (
              <>
                <dt>发售日</dt>
                <dd>{work.release}</dd>
              </>
            )}
            {work.added && (
              <>
                <dt>收录日</dt>
                <dd>{work.added}</dd>
              </>
            )}
            <dt>字幕</dt>
            <dd>{work.hasSubtitle ? "有" : "无"}</dd>
          </dl>
          {signedIn && (
            <>
              <AsmrMyReview work={work} onError={onAccountError} />
              <AsmrPlaylistPicker workId={work.id} onError={onAccountError} />
            </>
          )}
          <AsmrChips work={work} onRelated={onRelated} tagLimit={80} />
          {work.editions.length > 1 && (
            <div className="asmr-editions" aria-label="其他语言版本">
              {work.editions.map((edition) => {
                const target = parseWorkInput(edition.code);
                const current = edition.code === work.code;
                return (
                  <button
                    key={edition.code}
                    className={`asmr-chip${current ? " current" : ""}`}
                    disabled={current || target === null}
                    aria-current={current ? "true" : undefined}
                    onClick={() => target !== null && onOpenWork(target)}
                  >
                    {edition.label || edition.lang}
                  </button>
                );
              })}
            </div>
          )}
          <PlaySection
            key={work.id}
            work={work}
            groups={groups}
            playing={playing}
          />
          <h3 className="asmr-detail-subtitle">
            文件 · {countFiles(detail.tracks)} 个
          </h3>
          {detail.tracks.length ? (
            <TrackTree
              tracks={detail.tracks}
              depth={0}
              playing={playing}
              onPlay={playFile}
            />
          ) : (
            <p className="asmr-muted">这部作品暂时没有可显示的文件。</p>
          )}
        </div>
      )}
    </aside>
  );
}
