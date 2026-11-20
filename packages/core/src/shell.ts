import { SimulatedLogProvider } from "./logs";
import { createStore, registerMenu, type Store } from "./storage";
import { STYLES } from "./styles";
import type {
  AppOptions,
  ContentView,
  Conversation,
  CoverStory,
  LogEntry,
  LogProvider,
  LogSink,
  SiteAdapter,
  SiteContext,
  WorkNode,
} from "./types";
import {
  clamp,
  escapeAttr,
  escapeHtml,
  faviconDataUri,
  firstChar,
  isTypingTarget,
  sanitizeHtml,
  timeAgo,
} from "./utils";

const ROOT_ID = "fs-host";
const HIDE_STYLE_ID = "fs-hide-style";
const MIN_WIDTH = 1000;

const LOG_LABELS: Record<string, string> = {
  connecting: "连接中",
  live: "实时",
  sim: "模拟",
  unauth: "未登录",
  offline: "离线",
};

export interface AppState {
  enabled: boolean;
  workMode: boolean;
  logsOnly: boolean;
  leftWidth: number;
  logWidth: number;
  branch: string;
  branchMenuOpen: boolean;
  workCollapsed: boolean;
  workExpanded: Set<string>;
  workSelected: string;
  conversations: Conversation[];
  currentId: string;
  currentView: ContentView | null;
  listError: string;
  dataLoaded: boolean;
  openToken: number;
}

export interface AppHandle {
  state: AppState;
  host: HTMLElement;
  shadow: ShadowRoot;
  openConversation(id: string): Promise<void>;
  toggleLogsOnly(): void;
  toggleWorkMode(): void;
  enterMode(): void;
  exitMode(): void;
}

function logClock(timestamp?: number): string {
  const date = new Date(timestamp ?? Date.now());
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(
    date.getMilliseconds(),
  ).padStart(3, "0")}`;
}

function avatarMarkup(avatar: string | undefined, title: string, className: string): string {
  if (avatar) {
    return `<img class="${className}" src="${escapeAttr(avatar)}" alt="" loading="lazy">`;
  }
  return `<span class="${className} fs-avatar-letter">${escapeHtml(firstChar(title))}</span>`;
}

function fileBadge(name: string): { label: string; cls: string } {
  const extension = String(name).split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, [string, string]> = {
    go: ["GO", "go"],
    ts: ["TS", "ts"],
    tsx: ["TS", "ts"],
    js: ["JS", "js"],
    jsx: ["JS", "js"],
    yaml: ["Y", "yaml"],
    yml: ["Y", "yaml"],
    md: ["M", "md"],
    sh: ["SH", "sh"],
    json: ["{}", "json"],
    sql: ["SQL", "sql"],
    xml: ["X", "txt"],
    toml: ["T", "txt"],
  };
  const found = map[extension] ?? ["·", "txt"];
  return { label: found[0], cls: found[1] };
}

export async function startApp(
  adapter: SiteAdapter,
  coverStory: CoverStory,
  options: AppOptions = {},
): Promise<AppHandle | null> {
  if (!adapter.match(new URL(location.href))) return null;
  if (document.getElementById(ROOT_ID)) return null;

  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
  }
  if (!document.body) return null;

  const minWidth = options.minWidth ?? MIN_WIDTH;
  if (window.innerWidth < minWidth) return null;

  let ctx: SiteContext | null = null;
  try {
    ctx = await adapter.detect();
  } catch {
    ctx = null;
  }
  if (!ctx) return null;

  const store: Store = createStore(options.storagePrefix || `fishwm:${adapter.id}`);

  const state: AppState = {
    enabled: store.get<boolean>("enabled", true) !== false,
    workMode: store.get<boolean>("workMode", false) === true,
    logsOnly: store.get<boolean>("logsOnly", false) === true,
    leftWidth: clamp(store.get<number>("leftWidth", 280), 220, 460),
    logWidth: clamp(store.get<number>("logWidth", 340), 220, 1800),
    branch: coverStory.branch,
    branchMenuOpen: false,
    workCollapsed: false,
    workExpanded: new Set<string>(),
    workSelected: "",
    conversations: [],
    currentId: "",
    currentView: null,
    listError: "",
    dataLoaded: false,
    openToken: 0,
  };

  const workIndex = new Map<string, WorkNode>();
  const indexTree = (nodes: WorkNode[], base = "") => {
    for (const node of nodes) {
      const path = base ? `${base}/${node.name}` : node.name;
      workIndex.set(path, node);
      if (node.children) indexTree(node.children, path);
    }
  };
  indexTree(coverStory.tree);
  for (const [path, node] of workIndex) {
    if (node.type === "dir") state.workExpanded.add(path);
  }

  const host = document.createElement("div");
  host.id = ROOT_ID;
  host.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${STYLES}</style>
    <div class="fs-app" id="fs-app">
      <aside class="fs-side" id="fs-side">
        <div class="fs-side-head">
          <button class="fs-brand" id="fs-brand"></button>
          <button class="fs-refresh" id="fs-refresh" title="刷新">↻</button>
        </div>
        <div class="fs-list" id="fs-list"></div>
        <div class="fs-side-foot" id="fs-side-foot"></div>
      </aside>
      <div class="fs-resizer" id="fs-left-resizer"></div>
      <main class="fs-main" id="fs-main">
        <header class="fs-head">
          <span class="fs-head-cover" id="fs-head-cover"></span>
          <div class="fs-head-main">
            <div class="fs-head-title" id="fs-head-title" title="点击切换阅读区 / 日志（Ctrl+Alt+Q）"></div>
            <div class="fs-head-sub" id="fs-head-sub"></div>
          </div>
          <span class="fs-spacer"></span>
          <button class="fs-head-btn" id="fs-log-btn" title="切换阅读区 / 日志（Ctrl+Alt+Q）">日志</button>
          <button class="fs-exit" id="fs-exit" title="退出工作模式">⏏</button>
        </header>
        <div class="fs-content" id="fs-content"></div>
      </main>
      <div class="fs-resizer fs-log-resizer" id="fs-log-resizer"></div>
      <aside class="fs-logpane" id="fs-logpane">
        <div class="fs-loghead"><span class="fs-dot"></span>运行日志<span class="fs-log-status" id="fs-log-status">模拟</span></div>
        <div class="fs-logbody" id="fs-logbody"></div>
      </aside>
    </div>
    <div class="fs-ball" id="fs-ball" hidden>鱼</div>
    <div class="fs-toast" id="fs-toast"></div>
  `;
  document.body.appendChild(host);

  const must = <T extends Element>(selector: string): T => {
    const element = shadow.querySelector(selector);
    if (!element) throw new Error(`missing element: ${selector}`);
    return element as T;
  };

  const app = must<HTMLElement>("#fs-app");
  const side = must<HTMLElement>("#fs-side");
  const brand = must<HTMLButtonElement>("#fs-brand");
  const refreshBtn = must<HTMLButtonElement>("#fs-refresh");
  const list = must<HTMLElement>("#fs-list");
  const sideFoot = must<HTMLElement>("#fs-side-foot");
  const headCover = must<HTMLElement>("#fs-head-cover");
  const headTitle = must<HTMLElement>("#fs-head-title");
  const headSub = must<HTMLElement>("#fs-head-sub");
  const logBtn = must<HTMLButtonElement>("#fs-log-btn");
  const exitBtn = must<HTMLButtonElement>("#fs-exit");
  const content = must<HTMLElement>("#fs-content");
  const leftResizer = must<HTMLElement>("#fs-left-resizer");
  const logResizer = must<HTMLElement>("#fs-log-resizer");
  const logPane = must<HTMLElement>("#fs-logpane");
  const logBody = must<HTMLElement>("#fs-logbody");
  const logStatus = must<HTMLElement>("#fs-log-status");
  const ball = must<HTMLElement>("#fs-ball");
  const toastEl = must<HTMLElement>("#fs-toast");

  let originalTitle = document.title;
  let originalFavicons: Array<{ el: HTMLLinkElement; href: string | null }> = [];
  let createdFavicon: HTMLLinkElement | null = null;
  let logStarted = false;
  let stopLogs: (() => void) | null = null;
  let toastTimer = 0;

  const conversationById = (id: string): Conversation | undefined =>
    state.conversations.find((conversation) => conversation.id === id);

  function toast(message: string): void {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function appendLog(entry: LogEntry): void {
    const line = document.createElement("div");
    line.className = "fs-logline";
    const level = String(entry.level || "INFO").toLowerCase();
    line.innerHTML =
      `<span class="fs-log-time">${logClock(entry.ts)}</span>` +
      `<span class="fs-log-level fs-log-${escapeAttr(level)}">${escapeHtml(entry.level)}</span>` +
      `<span class="fs-log-service">${escapeHtml(entry.service)}</span>` +
      `<span class="fs-log-message">${escapeHtml(entry.message)}</span>`;
    logBody.appendChild(line);
    while (logBody.childElementCount > 400 && logBody.firstElementChild) {
      logBody.firstElementChild.remove();
    }
    logBody.scrollTop = logBody.scrollHeight;
  }

  function startLogFeed(): void {
    if (logStarted) return;
    logStarted = true;
    const provider: LogProvider = adapter.createLogProvider?.() ?? new SimulatedLogProvider();
    const sink: LogSink = {
      line: appendLog,
      status: (status) => {
        logStatus.textContent = LOG_LABELS[status] ?? status;
        logStatus.className = `fs-log-status ${status}`;
      },
    };
    stopLogs = provider.start(sink);
  }

  function stopLogFeed(): void {
    if (stopLogs) stopLogs();
    stopLogs = null;
    logStarted = false;
  }

  function applyWidths(): void {
    side.style.width = `${state.leftWidth}px`;
    side.style.flexBasis = `${state.leftWidth}px`;
    state.logWidth = clamp(state.logWidth, 220, maxLogWidth());
    logPane.style.width = `${state.logWidth}px`;
  }

  function maxLogWidth(): number {
    const total = app.clientWidth || window.innerWidth;
    return Math.max(220, total - state.leftWidth - 60);
  }

  function setSiteHidden(hidden: boolean): void {
    document.documentElement.classList.toggle("fs-on", hidden);
  }

  function injectHideStyle(): void {
    if (document.getElementById(HIDE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIDE_STYLE_ID;
    style.textContent = `
      html.fs-on body > *:not(#${ROOT_ID}) {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      html.fs-on body { overflow: hidden !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function collectFavicons(): void {
    if (originalFavicons.length) return;
    originalFavicons = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"]')].map(
      (el) => ({ el, href: el.getAttribute("href") }),
    );
  }

  function applyFavicon(fake: boolean): void {
    collectFavicons();
    if (fake) {
      if (originalFavicons.length) {
        for (const item of originalFavicons) item.el.setAttribute("href", faviconDataUri());
      } else if (!createdFavicon) {
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = faviconDataUri();
        (document.head || document.documentElement).appendChild(link);
        createdFavicon = link;
      }
      return;
    }
    for (const item of originalFavicons) {
      if (item.href == null) item.el.removeAttribute("href");
      else item.el.setAttribute("href", item.href);
    }
    if (createdFavicon) {
      createdFavicon.remove();
      createdFavicon = null;
    }
  }

  function updateTabTitle(): void {
    if (!state.enabled) return;
    if (state.workMode) {
      document.title = coverStory.tabTitle;
      applyFavicon(true);
    } else {
      document.title = originalTitle;
      applyFavicon(false);
    }
  }

  function restoreTabTitle(): void {
    document.title = originalTitle;
    applyFavicon(false);
  }

  function setBrandAndFoot(): void {
    brand.textContent = state.workMode ? "工作目录" : adapter.normalTitle;
    brand.title = state.workMode ? "点击恢复会话列表" : "点击切换工作目录";
    sideFoot.textContent = state.workMode ? coverStory.footer : "最近会话";
  }

  function renderTree(nodes: WorkNode[], depth: number, base: string): string {
    return nodes
      .map((node) => {
        const path = base ? `${base}/${node.name}` : node.name;
        const pad = 8 + depth * 14;
        const status = node.status
          ? `<span class="fs-git fs-git-${escapeAttr(String(node.status).toLowerCase())}">${escapeHtml(
              node.status,
            )}</span>`
          : "";
        if (node.type === "dir") {
          const open = state.workExpanded.has(path);
          return `<div class="fs-node fs-dir" data-path="${escapeAttr(path)}" style="padding-left:${pad}px" title="${escapeAttr(
            node.name,
          )}">
            <span class="fs-caret">${open ? "▾" : "▸"}</span><span class="fs-node-name">${escapeHtml(node.name)}</span>
          </div>${open ? renderTree(node.children ?? [], depth + 1, path) : ""}`;
        }
        const badge = fileBadge(node.name);
        const active = state.workSelected === path ? " active" : "";
        return `<div class="fs-node fs-file${active}" data-path="${escapeAttr(path)}" style="padding-left:${
          pad + 12
        }px" title="${escapeAttr(node.name)}">
          <span class="fs-ft fs-ft-${badge.cls}">${badge.label}</span><span class="fs-node-name">${escapeHtml(
            node.name,
          )}</span>${status}
        </div>`;
      })
      .join("");
  }

  function renderWorkTree(): void {
    const branches = coverStory.branches.length ? coverStory.branches : [coverStory.branch];
    const menu = state.branchMenuOpen
      ? `<div class="fs-branch-menu">${branches
          .map(
            (branch) =>
              `<div class="fs-branch-item${branch === state.branch ? " active" : ""}" data-branch="${escapeAttr(
                branch,
              )}">${escapeHtml(branch)}</div>`,
          )
          .join("")}</div>`
      : "";
    list.innerHTML = `<div class="fs-tree">
      <div class="fs-workspace" id="fs-workspace">
        <span class="fs-caret">${state.workCollapsed ? "▸" : "▾"}</span>
        <span class="fs-workspace-name">${escapeHtml(coverStory.workspace)}</span>
      </div>
      ${
        state.workCollapsed
          ? ""
          : `<div class="fs-branch" id="fs-branch">
              <span class="fs-branch-name">${escapeHtml(state.branch)}</span>
              <span class="fs-caret">▾</span>
              <span class="fs-branch-count">3 changes</span>
            </div>${menu}${renderTree(coverStory.tree, 0, "")}`
      }
    </div>`;
  }

  function renderConversationList(): void {
    if (!state.conversations.length) {
      const label = state.listError ? "加载失败" : state.dataLoaded ? "暂无话题" : "加载中…";
      list.innerHTML = `<div class="fs-empty"${
        state.listError ? ` title="${escapeAttr(state.listError)}"` : ""
      }>${label}</div>`;
      return;
    }
    list.innerHTML = state.conversations
      .map((conversation) => {
        const active = conversation.id === state.currentId ? " active" : "";
        const subtitle = conversation.subtitle || "";
        return `<div class="fs-item${active}" data-id="${escapeAttr(conversation.id)}" title="${escapeAttr(
          conversation.title,
        )}">
          ${avatarMarkup(conversation.avatar, conversation.title, "fs-avatar")}
          <div class="fs-item-main">
            <div class="fs-item-title">${escapeHtml(conversation.title)}</div>
            <div class="fs-item-sub">${escapeHtml(subtitle)}</div>
          </div>
          ${
            conversation.unread
              ? `<span class="fs-item-unread"></span>`
              : `<span class="fs-item-time">${escapeHtml(timeAgo(conversation.updatedAt))}</span>`
          }
        </div>`;
      })
      .join("");
  }

  function renderSidebar(): void {
    setBrandAndFoot();
    if (state.workMode) renderWorkTree();
    else renderConversationList();
  }

  function renderHead(): void {
    const conversation = conversationById(state.currentId);
    const title = state.workMode
      ? coverStory.fakeDocName
      : state.currentView?.title || conversation?.title || ctx?.title || "选择一个话题";
    const subtitle = state.workMode
      ? "工作文档"
      : state.currentView?.subtitle || conversation?.subtitle || "选择左侧会话开始阅读";
    if (state.workMode) {
      headCover.innerHTML = `<span class="fs-doc-icon">DOC</span>`;
    } else {
      const avatar = conversation?.avatar;
      headCover.innerHTML = avatar
        ? `<img src="${escapeAttr(avatar)}" alt="" loading="lazy">`
        : escapeHtml(firstChar(title));
    }
    headTitle.textContent = title;
    headSub.textContent = subtitle;
  }

  function renderContent(): void {
    const view = state.currentView;
    if (!view) {
      content.innerHTML = `<div class="fs-empty">${
        state.listError ? `加载失败：${escapeHtml(state.listError)}` : "选择左侧会话开始阅读"
      }</div>`;
      return;
    }
    const more =
      view.hasMore && adapter.loadMore ? `<button class="fs-more" type="button">加载更多回复</button>` : "";
    content.innerHTML = `<div class="fs-doc">${sanitizeHtml(view.html)}${more}</div>`;
    const moreButton = content.querySelector<HTMLButtonElement>(".fs-more");
    if (moreButton) {
      moreButton.addEventListener("click", () => void handleLoadMore(moreButton));
    }
    content.scrollTop = 0;
  }

  async function handleLoadMore(button: HTMLButtonElement): Promise<void> {
    const view = state.currentView;
    if (!view || !adapter.loadMore) return;
    const id = state.currentId;
    button.disabled = true;
    button.textContent = "加载中…";
    try {
      const result = await adapter.loadMore(id, view.cursor);
      if (state.currentId !== id || state.currentView !== view) return;
      const doc = content.querySelector(".fs-doc");
      if (!doc) return;
      const temp = document.createElement("div");
      temp.innerHTML = sanitizeHtml(result.html);
      while (temp.firstChild) doc.insertBefore(temp.firstChild, button);
      view.hasMore = result.hasMore;
      view.cursor = result.cursor;
      if (!result.hasMore) button.remove();
      else {
        button.disabled = false;
        button.textContent = "加载更多回复";
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = "加载失败，重试";
      toast(`加载更多失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function openConversation(id: string): Promise<void> {
    if (!id) return;
    const token = ++state.openToken;
    state.currentId = id;
    renderSidebar();
    renderHead();
    content.innerHTML = `<div class="fs-loading">正在加载…</div>`;
    try {
      const view = await adapter.openConversation(id);
      if (token !== state.openToken) return;
      state.currentView = view;
      store.set("lastId", id);
      if (!state.conversations.some((conversation) => conversation.id === id)) {
        state.conversations.unshift({ id, title: view.title, subtitle: view.subtitle });
      }
      renderSidebar();
      renderHead();
      renderContent();
    } catch (error) {
      if (token !== state.openToken) return;
      state.currentView = null;
      renderHead();
      content.innerHTML = `<div class="fs-empty">加载失败：${escapeHtml(
        error instanceof Error ? error.message : String(error),
      )}</div>`;
      toast("话题加载失败");
    }
  }

  async function ensureData(): Promise<void> {
    if (state.dataLoaded) return;
    state.dataLoaded = true;
    try {
      state.conversations = await adapter.listConversations();
      state.listError = "";
    } catch (error) {
      state.dataLoaded = false;
      state.listError = error instanceof Error ? error.message : String(error);
      state.conversations = [];
      toast(`话题列表加载失败：${state.listError}`);
    }
    renderSidebar();

    const preferred = adapter.initialConversationId?.(ctx as SiteContext) || store.get<string>("lastId", "");
    const inList = preferred && state.conversations.some((conversation) => conversation.id === preferred);
    const first = state.conversations[0]?.id ?? "";
    const id = inList ? preferred : preferred || first;
    if (id) {
      await openConversation(id);
    } else {
      renderContent();
    }
  }

  async function refreshConversations(): Promise<void> {
    try {
      state.conversations = await adapter.listConversations();
      state.listError = "";
      renderSidebar();
      if (!state.currentId && state.conversations[0]) {
        await openConversation(state.conversations[0].id);
      }
      toast("已刷新");
    } catch (error) {
      toast(`刷新失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function applyLogsOnly(): void {
    app.classList.toggle("fs-logs-only", state.logsOnly);
    if (state.logsOnly) logBody.scrollTop = logBody.scrollHeight;
  }

  function toggleLogsOnly(): void {
    state.logsOnly = !state.logsOnly;
    store.set("logsOnly", state.logsOnly);
    applyLogsOnly();
  }

  function toggleWorkMode(): void {
    state.workMode = !state.workMode;
    store.set("workMode", state.workMode);
    updateTabTitle();
    renderSidebar();
    renderHead();
  }

  function exitMode(): void {
    state.enabled = false;
    store.set("enabled", false);
    stopLogFeed();
    setSiteHidden(false);
    app.style.display = "none";
    ball.hidden = false;
    restoreTabTitle();
  }

  function enterMode(): void {
    state.enabled = true;
    store.set("enabled", true);
    app.style.display = "flex";
    ball.hidden = true;
    setSiteHidden(true);
    updateTabTitle();
    startLogFeed();
    void ensureData();
  }

  function applyViewport(): void {
    if (window.innerWidth < minWidth) {
      app.style.display = "none";
      setSiteHidden(false);
      ball.hidden = true;
      return;
    }
    if (state.enabled) {
      app.style.display = "flex";
      ball.hidden = true;
      setSiteHidden(true);
    } else {
      app.style.display = "none";
      ball.hidden = false;
      setSiteHidden(false);
    }
  }

  function bindResizer(
    handle: HTMLElement,
    getWidth: () => number,
    min: number,
    max: () => number,
    invert: boolean,
    onMove: (width: number) => void,
    onEnd: () => void,
  ): void {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = getWidth();
      const previousCursor = document.documentElement.style.cursor;
      const previousSelect = document.documentElement.style.userSelect;
      handle.classList.add("fs-dragging");
      document.documentElement.style.cursor = "col-resize";
      document.documentElement.style.userSelect = "none";
      const move = (moveEvent: PointerEvent) => {
        const delta = (moveEvent.clientX - startX) * (invert ? -1 : 1);
        onMove(clamp(startWidth + delta, min, max()));
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        handle.classList.remove("fs-dragging");
        document.documentElement.style.cursor = previousCursor;
        document.documentElement.style.userSelect = previousSelect;
        onEnd();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    });
  }

  function onKeydown(event: KeyboardEvent): void {
    if (!event.ctrlKey || !event.altKey || event.shiftKey || event.repeat) return;
    const key = String(event.key || "").toLowerCase();
    if (key !== "q" && event.code !== "KeyQ") return;
    if (!state.enabled) return;
    if (app.style.display === "none") return;
    if (isTypingTarget(event)) return;
    event.preventDefault();
    event.stopPropagation();
    toggleLogsOnly();
  }

  function onContentClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    const anchor = target?.closest?.("a") ?? null;
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    const url = new URL(href, location.href);
    if (adapter.conversationIdFromUrl) {
      const id = adapter.conversationIdFromUrl(url);
      if (id) {
        event.preventDefault();
        void openConversation(id);
        return;
      }
    }
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer");
  }

  list.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (!target) return;
    if (state.workMode) {
      const branchItem = target.closest(".fs-branch-item");
      if (branchItem) {
        state.branch = branchItem.getAttribute("data-branch") || coverStory.branch;
        state.branchMenuOpen = false;
        renderSidebar();
        return;
      }
      if (target.closest("#fs-branch")) {
        state.branchMenuOpen = !state.branchMenuOpen;
        renderSidebar();
        return;
      }
      if (target.closest("#fs-workspace")) {
        state.workCollapsed = !state.workCollapsed;
        state.branchMenuOpen = false;
        renderSidebar();
        return;
      }
      const node = target.closest(".fs-node");
      if (node) {
        const path = node.getAttribute("data-path") || "";
        const item = workIndex.get(path);
        if (item) {
          if (item.type === "dir") {
            if (state.workExpanded.has(path)) state.workExpanded.delete(path);
            else state.workExpanded.add(path);
          } else {
            state.workSelected = path;
          }
          renderSidebar();
        }
      }
      return;
    }
    const item = target.closest(".fs-item");
    if (item) {
      const id = item.getAttribute("data-id");
      if (id) void openConversation(id);
    }
  });

  brand.addEventListener("click", toggleWorkMode);
  refreshBtn.addEventListener("click", () => {
    if (state.workMode) {
      renderSidebar();
      return;
    }
    void refreshConversations();
  });
  headTitle.addEventListener("click", toggleLogsOnly);
  logBtn.addEventListener("click", toggleLogsOnly);
  exitBtn.addEventListener("click", exitMode);
  ball.addEventListener("click", enterMode);
  content.addEventListener("click", onContentClick);
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("resize", () => {
    applyViewport();
    state.logWidth = clamp(state.logWidth, 220, maxLogWidth());
    logPane.style.width = `${state.logWidth}px`;
  });

  bindResizer(
    leftResizer,
    () => state.leftWidth,
    220,
    () => 460,
    false,
    (width) => {
      state.leftWidth = width;
      side.style.width = `${width}px`;
      side.style.flexBasis = `${width}px`;
    },
    () => {
      store.set("leftWidth", state.leftWidth);
      state.logWidth = clamp(state.logWidth, 220, maxLogWidth());
      logPane.style.width = `${state.logWidth}px`;
      store.set("logWidth", state.logWidth);
    },
  );

  bindResizer(
    logResizer,
    () => state.logWidth,
    220,
    () => maxLogWidth(),
    true,
    (width) => {
      state.logWidth = width;
      logPane.style.width = `${width}px`;
    },
    () => store.set("logWidth", state.logWidth),
  );

  injectHideStyle();
  applyWidths();
  applyLogsOnly();
  renderSidebar();
  renderHead();
  renderContent();

  if (state.enabled) {
    app.style.display = "flex";
    ball.hidden = true;
    setSiteHidden(true);
    updateTabTitle();
    startLogFeed();
    void ensureData();
  } else {
    app.style.display = "none";
    ball.hidden = false;
    setSiteHidden(false);
  }

  registerMenu("进入/退出工作模式", () => {
    if (state.enabled) exitMode();
    else enterMode();
  });
  registerMenu("切换阅读区 / 日志（Ctrl+Alt+Q）", () => {
    if (state.enabled) toggleLogsOnly();
  });
  registerMenu("刷新话题列表", () => void refreshConversations());

  return {
    state,
    host,
    shadow,
    openConversation,
    toggleLogsOnly,
    toggleWorkMode,
    enterMode,
    exitMode,
  };
}