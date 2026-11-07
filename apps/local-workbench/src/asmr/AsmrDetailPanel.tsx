import { useEffect, useState } from "react";
import { Icon } from "../icons.tsx";
import { loadWork } from "./asmr-runtime.ts";
import {
  asmrErrorMessage,
  formatDuration,
  formatSize,
  parseWorkInput,
} from "./asmr-types.ts";
import type { AsmrTrack, AsmrWorkDetail } from "./asmr-types.ts";
import { AsmrChips, AsmrCover, AsmrStars } from "./AsmrWorkCard.tsx";
import type { OpenRelated } from "./AsmrWorkCard.tsx";

const kindIcon = {
  audio: "headphones",
  text: "book",
  image: "grid",
  other: "folder",
} as const;

function countFiles(tracks: AsmrTrack[]): number {
  return tracks.reduce(
    (total, track) =>
      total + (track.type === "folder" ? countFiles(track.children) : 1),
    0,
  );
}

function TrackTree({ tracks, depth }: { tracks: AsmrTrack[]; depth: number }) {
  return (
    <ul className="asmr-tracks" role={depth === 0 ? "tree" : "group"}>
      {tracks.map((track, index) =>
        track.type === "folder" ? (
          <Folder key={`${index}:${track.title}`} track={track} depth={depth} />
        ) : (
          <li
            key={`${index}:${track.title}`}
            className={`asmr-track asmr-track-${track.kind}`}
            role="treeitem"
          >
            <Icon name={kindIcon[track.kind]} size={16} />
            <span className="asmr-track-title">{track.title}</span>
            <span className="asmr-track-meta">
              {formatDuration(track.durationSeconds) ??
                formatSize(track.size) ??
                ""}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

function Folder({
  track,
  depth,
}: {
  track: Extract<AsmrTrack, { type: "folder" }>;
  depth: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  return (
    <li className="asmr-folder" role="treeitem" aria-expanded={open}>
      <button className="asmr-folder-toggle" onClick={() => setOpen(!open)}>
        <Icon name={open ? "folder" : "arrow"} size={16} />
        <span className="asmr-track-title">{track.title}</span>
        <span className="asmr-track-meta">
          {countFiles(track.children)} 个文件
        </span>
      </button>
      {open && <TrackTree tracks={track.children} depth={depth + 1} />}
    </li>
  );
}

export function AsmrDetailPanel({
  id,
  onClose,
  onOpenWork,
  onRelated,
}: {
  id: number;
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
        if (active) setDetail(value);
      })
      .catch((reason) => {
        if (active) setError(asmrErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  const work = detail?.work;
  const duration = formatDuration(work?.durationSeconds ?? null);
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
          <h3 className="asmr-detail-subtitle">
            文件 · {countFiles(detail.tracks)} 个
          </h3>
          {detail.tracks.length ? (
            <TrackTree tracks={detail.tracks} depth={0} />
          ) : (
            <p className="asmr-muted">这部作品暂时没有可显示的文件。</p>
          )}
          <p className="asmr-muted asmr-detail-note">
            在线播放会在之后的版本加入。
          </p>
        </div>
      )}
    </aside>
  );
}
