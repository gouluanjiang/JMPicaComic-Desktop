import type { ComponentProps, RefObject } from "react";
import { Icon } from "./icons.tsx";
import type { AccountSummary } from "./source-types.ts";
import type { AsmrDestination } from "./asmr/AsmrWorkspace.tsx";

export type UiSection = "comic" | "asmr";

export type UiDestination =
  | "library"
  | "queue"
  | "favorites"
  | "recent"
  | "ranking"
  | "discovery"
  | "completion"
  | "special"
  | "history"
  | "author-search"
  | "authors"
  | "settings";
type Entry = {
  id: UiDestination;
  label: string;
  icon: ComponentProps<typeof Icon>["name"];
  native?: boolean;
};
type AsmrEntry = {
  id: AsmrDestination;
  label: string;
  icon: ComponentProps<typeof Icon>["name"];
};
const asmrGroups: { label: string; entries: AsmrEntry[] }[] = [
  {
    label: "浏览",
    entries: [
      { id: "asmr-home", label: "作品", icon: "headphones" },
      { id: "asmr-popular", label: "热门", icon: "discover" },
      { id: "asmr-random", label: "随机听", icon: "shuffle" },
    ],
  },
  {
    label: "分类",
    entries: [
      { id: "asmr-circles", label: "社团", icon: "people" },
      { id: "asmr-voice-actors", label: "声优", icon: "mic" },
      { id: "asmr-tags", label: "标签", icon: "tag" },
    ],
  },
];
const groups: { label: string; entries: Entry[] }[] = [
  {
    label: "我的漫画",
    entries: [
      { id: "library", label: "漫画库", icon: "library" },
      { id: "queue", label: "下载队列", icon: "download" },
      { id: "history", label: "浏览历史", icon: "clock", native: true },
    ],
  },
  {
    label: "发现作品",
    entries: [
      { id: "favorites", label: "在线收藏", icon: "heart" },
      { id: "recent", label: "最近更新", icon: "refresh", native: true },
      { id: "ranking", label: "周排行榜", icon: "discover", native: true },
      { id: "discovery", label: "搜索", icon: "search" },
    ],
  },
  {
    label: "关注与更新",
    entries: [
      {
        id: "completion",
        label: "作者更新",
        icon: "completeness",
        native: true,
      },
      { id: "authors", label: "关注作者", icon: "people" },
      { id: "special", label: "特别关注", icon: "star", native: true },
    ],
  },
];

export function UiSidebar({
  sidebarRef,
  active,
  native,
  collapsed,
  accounts,
  unfinished,
  specialUnread = 0,
  onNavigate,
  onToggle,
  onOpenAccounts,
  section = "comic",
  asmrActive = "asmr-home",
  onSection,
  onAsmrNavigate,
}: {
  sidebarRef: RefObject<HTMLElement | null>;
  active: UiDestination;
  native: boolean;
  collapsed: boolean;
  accounts: AccountSummary[];
  unfinished: number;
  specialUnread?: number;
  onNavigate(destination: UiDestination): void;
  onToggle(): void;
  onOpenAccounts(): void;
  section?: UiSection;
  asmrActive?: AsmrDestination;
  onSection?(section: UiSection): void;
  onAsmrNavigate?(destination: AsmrDestination): void;
}) {
  const connected = accounts
    .filter((account) => account.state === "connected")
    .map((account) => (account.source === "Pica" ? "哔咔" : account.source));
  const connectionLabel = native
    ? connected.length
      ? connected.join(" · ") + " 已连接"
      : "来源尚未连接"
    : "交互样例";
  const toggleLabel = collapsed ? "展开侧栏" : "收起侧栏";
  const asmr = native && section === "asmr";
  const asmrEntry = ({ id, label, icon }: AsmrEntry) => (
    <button
      key={id}
      className={`nav-item ui-nav-item ${asmrActive === id ? "active" : ""}`}
      data-testid={`nav-${id}`}
      title={label}
      aria-label={label}
      aria-current={asmrActive === id ? "page" : undefined}
      onClick={() => onAsmrNavigate?.(id)}
    >
      <Icon name={icon} size={19} />
      <span className="ui-nav-label">{label}</span>
    </button>
  );
  const entry = ({ id, label, icon }: Entry) => (
    <button
      key={id}
      className={`nav-item ui-nav-item ${!asmr && active === id ? "active" : ""}`}
      data-testid={`nav-${id}`}
      title={label}
      aria-label={label}
      aria-current={!asmr && active === id ? "page" : undefined}
      onClick={() => onNavigate(id)}
    >
      <Icon name={icon} size={19} />
      <span className="ui-nav-label">{label}</span>
      {id === "queue" && unfinished > 0 && (
        <span className="nav-count ui-nav-count">{unfinished}</span>
      )}
      {id === "special" && specialUnread > 0 && (
        <span
          className="nav-count ui-nav-count"
          aria-label={`${specialUnread} 部未读作品`}
        >
          {specialUnread}
        </span>
      )}
    </button>
  );
  return (
    <aside
      ref={sidebarRef}
      className="sidebar ui-sidebar"
      aria-label="工作台侧栏"
    >
      <button
        className="brand"
        aria-label="JMPicaComic-Desktop 首页"
        onClick={() => onNavigate("library")}
      >
        <span className="brand-mark">
          J<span />
        </span>
        <span className="ui-brand-name">
          JMPicaComic<small>你的漫画，井然有序。</small>
        </span>
      </button>
      {native && onSection && (
        <div className="ui-section-switch" role="group" aria-label="内容分区">
          {(
            [
              ["comic", "漫画"],
              ["asmr", "ASMR"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              data-testid={`section-${id}`}
              aria-pressed={section === id}
              onClick={() => onSection(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <nav
        className="ui-navigation"
        aria-label="主要导航"
        id="workbench-navigation"
      >
        {asmr
          ? asmrGroups.map((group) => (
              <section className="ui-nav-group" key={group.label}>
                <p className="ui-nav-heading">{group.label}</p>
                {group.entries.map(asmrEntry)}
              </section>
            ))
          : groups.map((group) => (
              <section className="ui-nav-group" key={group.label}>
                <p className="ui-nav-heading">{group.label}</p>
                {group.entries
                  .filter((item) => native || !item.native)
                  .map(entry)}
              </section>
            ))}
      </nav>
      <div className="sidebar-bottom">
        <button
          className="ui-connection"
          title={connectionLabel}
          aria-label={connectionLabel + "，打开账号设置"}
          onClick={onOpenAccounts}
        >
          <span
            className={`ui-connection-dot ${connected.length ? "connected" : ""}`}
          />
          <span className="ui-nav-label">{connectionLabel}</span>
        </button>
        {entry({ id: "settings", label: "设置", icon: "settings" })}
        <button
          className="nav-item ui-nav-item ui-sidebar-toggle"
          data-testid="sidebar-toggle"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={!collapsed}
          aria-controls="workbench-navigation"
          onClick={onToggle}
        >
          <Icon name={collapsed ? "arrow" : "back"} size={19} />
          <span className="ui-nav-label">{toggleLabel}</span>
        </button>
      </div>
    </aside>
  );
}
