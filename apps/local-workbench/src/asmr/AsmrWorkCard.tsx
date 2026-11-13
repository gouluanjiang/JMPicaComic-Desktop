import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { cachedCover, loadCover } from "./asmr-runtime.ts";
import { chineseLabel, formatDuration, progressLabels } from "./asmr-types.ts";
import type { AsmrCoverSize, AsmrRelation, AsmrWork } from "./asmr-types.ts";

export type OpenRelated = (
  relation: AsmrRelation,
  id: string,
  name: string,
) => void;

export function AsmrCover({
  id,
  code,
  size,
  className = "",
}: {
  id: number;
  code: string;
  size: AsmrCoverSize;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null | undefined>(() =>
    cachedCover(id, size),
  );
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (url !== undefined) return;
    const element = host.current;
    if (!element) return;
    let active = true;
    const start = () =>
      void loadCover(id, size)
        .then((value) => {
          if (active) setUrl(value);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    if (typeof IntersectionObserver === "undefined") {
      start();
      return () => {
        active = false;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [id, size, url]);
  return (
    <div
      ref={host}
      className={`asmr-cover ${className}`}
      data-testid={`asmr-cover-${id}`}
      data-state={
        url ? "ready" : failed || url === null ? "missing" : "loading"
      }
    >
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : (
        <span className="asmr-cover-placeholder">{code}</span>
      )}
    </div>
  );
}

function Stars({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null) return <span className="asmr-muted">暂无评分</span>;
  return (
    <span className="asmr-rating" aria-label={`评分 ${rating.toFixed(2)}`}>
      <span
        className="asmr-stars"
        style={{ "--rating": rating / 5 } as CSSProperties}
        aria-hidden="true"
      >
        ★★★★★
      </span>
      {rating.toFixed(1)}
      <span className="asmr-muted">({count})</span>
    </span>
  );
}

function Chips({
  work,
  onRelated,
  tagLimit,
}: {
  work: AsmrWork;
  onRelated: OpenRelated;
  tagLimit: number;
}) {
  return (
    <>
      {work.voiceActors.length > 0 && (
        <div className="asmr-chips">
          {work.voiceActors.map((person) => (
            <button
              key={person.id}
              className="asmr-chip asmr-chip-voice"
              onClick={(event) => {
                event.stopPropagation();
                onRelated("voiceActor", person.id, person.name);
              }}
            >
              {person.name}
            </button>
          ))}
        </div>
      )}
      {work.tags.length > 0 && (
        <div className="asmr-chips">
          {work.tags.slice(0, tagLimit).map((tag) => (
            <button
              key={tag.id}
              className="asmr-chip"
              onClick={(event) => {
                event.stopPropagation();
                onRelated("tag", String(tag.id), tag.name);
              }}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function AsmrWorkCard({
  work,
  variant,
  selected,
  onOpen,
  onRelated,
}: {
  work: AsmrWork;
  variant: "grid" | "cards";
  selected: boolean;
  onOpen(work: AsmrWork): void;
  onRelated: OpenRelated;
}) {
  const language = chineseLabel(work);
  const duration = formatDuration(work.durationSeconds);
  return (
    <article
      className={`asmr-card asmr-card-${variant}${selected ? " selected" : ""}`}
      data-testid={`asmr-work-${work.id}`}
    >
      <button
        className="asmr-card-open"
        aria-label={`查看 ${work.title}`}
        onClick={() => onOpen(work)}
      >
        <AsmrCover id={work.id} code={work.code} size="main" />
        <span className="asmr-badge asmr-badge-code">{work.code}</span>
        {work.release && (
          <span className="asmr-badge asmr-badge-date">{work.release}</span>
        )}
        {language && (
          <span className="asmr-badge asmr-badge-language">{language}</span>
        )}
        {work.progress && (
          <span className="asmr-badge asmr-badge-progress">
            {progressLabels[work.progress]}
          </span>
        )}
      </button>
      <div className="asmr-card-body">
        <button className="asmr-card-title" onClick={() => onOpen(work)}>
          {work.title}
        </button>
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
        {variant === "cards" && (
          <>
            <div className="asmr-card-stats">
              <Stars rating={work.rating} count={work.ratingCount} />
              <span>下载 {work.downloads.toLocaleString("zh-CN")}</span>
              {duration && <span>时长 {duration}</span>}
              {work.price !== null && <span>{work.price} 日元</span>}
              {work.userRating !== null && (
                <span className="asmr-my-rating">
                  我的评分 {work.userRating}★
                </span>
              )}
            </div>
            <Chips work={work} onRelated={onRelated} tagLimit={6} />
          </>
        )}
      </div>
    </article>
  );
}

export { Chips as AsmrChips, Stars as AsmrStars };
