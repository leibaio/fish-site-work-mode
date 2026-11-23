import type {
  ContentView,
  Conversation,
  CoverStory,
  LoadMoreResult,
  SiteAdapter,
  SiteContext,
  WorkNode,
} from "../../../core/src/index";
import {
  escapeAttr,
  escapeHtml,
  firstChar,
  sanitizeCooked,
  timeAgo,
} from "../../../core/src/index";

const HUPU_ORIGIN = "https://bbs.hupu.com";

interface HupuCursor {
  page: number;
  total: number;
  offset: number;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: unknown): number {
  const number = Number.parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(number) ? number : 0;
}

function absoluteUrl(value: string | null | undefined, base: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("data:")) return "";
  try {
    return new URL(raw, base).href;
  } catch {
    return "";
  }
}

function avatarUrl(value: string | null | undefined, base: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("data:") || /def_man\.png|avatar.*placeholder/i.test(raw)) {
    return "";
  }
  return absoluteUrl(raw, base);
}

function parseHupuTime(value: string): number {
  const text = normalize(value);
  if (!text) return 0;

  const full = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (full) {
    return new Date(
      Number(full[1]),
      Number(full[2]) - 1,
      Number(full[3]),
      Number(full[4]),
      Number(full[5]),
      Number(full[6] || 0),
    ).getTime();
  }

  const now = new Date();
  const today = text.match(/今天\s*(\d{1,2}):(\d{2})/);
  if (today) {
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number(today[1]),
      Number(today[2]),
    ).getTime();
  }
  const yesterday = text.match(/昨天\s*(\d{1,2}):(\d{2})/);
  if (yesterday) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number(yesterday[1]),
      Number(yesterday[2]),
    );
    date.setDate(date.getDate() - 1);
    return date.getTime();
  }

  const monthDay = text.match(/(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (monthDay) {
    let date = new Date(
      now.getFullYear(),
      Number(monthDay[1]) - 1,
      Number(monthDay[2]),
      Number(monthDay[3]),
      Number(monthDay[4]),
    );
    if (date.getTime() > now.getTime() + 86_400_000) {
      date = new Date(
        now.getFullYear() - 1,
        Number(monthDay[1]) - 1,
        Number(monthDay[2]),
        Number(monthDay[3]),
        Number(monthDay[4]),
      );
    }
    return date.getTime();
  }

  const minutes = text.match(/(\d+)\s*分钟前/);
  if (minutes) return Date.now() - Number(minutes[1]) * 60_000;
  const hours = text.match(/(\d+)\s*小时前/);
  if (hours) return Date.now() - Number(hours[1]) * 3_600_000;
  if (text.includes("刚刚")) return Date.now();
  return 0;
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function cleanContent(element: Element | null, baseUrl: string): string {
  if (!element) return "";
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(".seo-dom").forEach((node) => node.remove());

  clone.querySelectorAll("img").forEach((image) => {
    const real =
      image.getAttribute("data-src") ||
      image.getAttribute("data-original") ||
      image.getAttribute("data-lazy-src");
    if (real) image.setAttribute("src", real);
    const src = image.getAttribute("src");
    if (src) {
      const absolute = absoluteUrl(src, baseUrl);
      if (absolute) image.setAttribute("src", absolute);
      else image.removeAttribute("src");
    }
    image.removeAttribute("data-src");
    image.removeAttribute("data-original");
    image.removeAttribute("data-lazy-src");
  });

  clone.querySelectorAll("video").forEach((video) => {
    for (const name of ["src", "poster"]) {
      const value = video.getAttribute(name);
      if (value) {
        const absolute = absoluteUrl(value, baseUrl);
        if (absolute) video.setAttribute(name, absolute);
      }
    }
  });

  clone.querySelectorAll("source").forEach((source) => {
    const src = source.getAttribute("src");
    if (src) {
      const absolute = absoluteUrl(src, baseUrl);
      if (absolute) source.setAttribute("src", absolute);
    }
  });

  clone.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
    const absolute = absoluteUrl(href, baseUrl);
    if (absolute) anchor.setAttribute("href", absolute);
  });

  return sanitizeCooked(clone.innerHTML);
}

function buildPostHtml(
  author: string,
  avatar: string,
  floor: string,
  timeText: string,
  content: string,
): string {
  const avatarHtml = avatar
    ? `<img class="fs-post-avatar" src="${escapeAttr(avatar)}" alt="" loading="lazy">`
    : `<span class="fs-post-avatar fs-post-avatar-letter">${escapeHtml(firstChar(author))}</span>`;
  return `<section class="fs-post">
    <header class="fs-post-head">
      ${avatarHtml}
      <span class="fs-post-name">${escapeHtml(author)}</span>
      <span class="fs-post-floor">${escapeHtml(floor)}</span>
      <span class="fs-post-time">${escapeHtml(timeAgo(parseHupuTime(timeText)))}</span>
    </header>
    <div class="fs-post-body">${content}</div>
  </section>`;
}

export function parseThreadList(html: string): Conversation[] {
  const doc = parseHtml(html);
  if (!doc.querySelector(".bbs-sl-web-post")) {
    throw new Error("无法读取版块列表（可能需要登录）");
  }

  const items = [...doc.querySelectorAll("li.bbs-sl-web-post-body")];
  return items
    .map((item): Conversation | null => {
      const titleLink = item.querySelector("a.p-title");
      const title = normalize(titleLink?.textContent);
      const href = titleLink?.getAttribute("href") || "";
      let pathname = "";
      try {
        pathname = new URL(href, HUPU_ORIGIN).pathname;
      } catch {
        pathname = "";
      }
      const id = pathname.match(/^\/(\d{5,})(?:-\d+)?\.html$/)?.[1];
      if (!id || !title) return null;

      const datum = normalize(item.querySelector(".post-datum")?.textContent);
      const [replyText, viewText] = datum.split("/").map((part) => part.trim());
      const replies = toNumber(replyText);
      const views = toNumber(viewText);
      const author = normalize(item.querySelector(".post-auth a")?.textContent) || "匿名用户";
      const timeText = normalize(item.querySelector(".post-time")?.textContent);
      const subtitle = [`${author}`, `${replies} 回复`, `${views} 浏览`]
        .filter(Boolean)
        .join(" · ");

      return {
        id,
        title,
        subtitle,
        avatarFallback: author,
        updatedAt: parseHupuTime(timeText),
      };
    })
    .filter((conversation): conversation is Conversation => conversation !== null);
}

interface ParsedReplies {
  html: string;
  count: number;
}

function parseReplies(doc: Document, baseUrl: string, floorStart: number): ParsedReplies {
  const containers = [...doc.querySelectorAll(".post-reply-list-container")].filter(
    (container) => !container.closest('[class*="post-wrapper_light"]'),
  );

  const seen = new Set<string>();
  const posts: string[] = [];
  for (const container of containers) {
    const author =
      normalize(container.querySelector(".post-reply-list-user-info-top-name")?.textContent) ||
      "匿名用户";
    const timeText = normalize(
      container.querySelector(".post-reply-list-user-info-top-time")?.textContent,
    );
    const avatar = avatarUrl(
      container.querySelector(".reply-list-avatar img")?.getAttribute("src"),
      baseUrl,
    );
    const mainThread =
      container.querySelector('[class*="reply-list-wrapper"] .main-thread') ||
      container.querySelector(".main-thread");
    const quote = container.querySelector(
      '[class*="quote-thread"] [class*="simple-detail-content"]',
    );
    const quoteHtml = quote
      ? `<blockquote class="fs-quote">${sanitizeCooked(quote.innerHTML)}</blockquote>`
      : "";
    const content = quoteHtml + cleanContent(mainThread, baseUrl);
    const key = `${author}|${timeText}|${normalize(content).slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    posts.push(
      buildPostHtml(author, avatar, `#${floorStart + posts.length}`, timeText, content),
    );
  }

  return { html: posts.join(""), count: posts.length };
}

function totalPagesFromDoc(doc: Document): number {
  let max = 1;
  doc.querySelectorAll('[class*="hupu-rc-pagination-item-"]').forEach((item) => {
    const match = String(item.className).match(/hupu-rc-pagination-item-(\d+)/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  doc.querySelectorAll('.hupu-rc-pagination a[href]').forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const match = href.match(/-(\d+)\.html/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return max;
}

function currentPageFromDoc(doc: Document, url: URL): number {
  const active = doc.querySelector('[class*="hupu-rc-pagination-item-active"]');
  const match = String(active?.className || "").match(/hupu-rc-pagination-item-(\d+)/);
  if (match) return Number(match[1]);
  return threadPageFromUrl(url);
}

export function parseThreadView(html: string, baseUrl: string): ContentView {
  const doc = parseHtml(html);
  const postContent = doc.querySelector('[class*="post-content_bbs-post-content"]');
  if (!postContent) {
    throw new Error("无法读取帖子（可能需要登录）");
  }

  const url = new URL(baseUrl);
  const title =
    normalize(doc.querySelector('[class*="bbs-post-web-main-title"] h1')?.textContent) ||
    normalize(doc.title) ||
    "虎扑帖子";
  const provider = normalize(
    doc.querySelector('[class*="bbs-post-web-main-title-provider"]')?.textContent,
  );
  const replyTotal = toNumber(provider.match(/(\d+)\s*回复/)?.[1]);
  const lights = toNumber(provider.match(/(\d+)\s*亮/)?.[1]);
  const views = toNumber(provider.match(/(\d+)\s*浏览/)?.[1]);

  const author =
    normalize(postContent.querySelector('[class*="post-user-comp-info-top-name"]')?.textContent) ||
    "匿名用户";
  const timeText = normalize(
    postContent.querySelector('[class*="post-user-comp-info-top-time"]')?.textContent,
  );
  const avatar = avatarUrl(
    postContent.querySelector('[class*="post-user-comp-avatar-wrapper"] img')?.getAttribute("src"),
    baseUrl,
  );
  const mainThread =
    postContent.querySelector('[class*="post-content_main-post-info"] .main-thread') ||
    postContent.querySelector(".main-thread");
  const mainPost = buildPostHtml(
    author,
    avatar,
    "楼主",
    timeText,
    cleanContent(mainThread, baseUrl),
  );

  const replies = parseReplies(doc, baseUrl, 1);
  const page = currentPageFromDoc(doc, url);
  const total = totalPagesFromDoc(doc);
  const meta = [
    `${replyTotal || replies.count} 回复`,
    views > 0 ? `${views} 浏览` : "",
    lights > 0 ? `${lights} 亮` : "",
    total > 1 ? `第 ${page}/${total} 页` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title,
    subtitle: meta,
    html:
      `<h1 class="fs-topic-title">${escapeHtml(title)}</h1>` +
      `<div class="fs-topic-meta">${escapeHtml(meta)}</div>` +
      mainPost +
      replies.html,
    hasMore: page < total,
    cursor: { page, total, offset: replies.count } satisfies HupuCursor,
  };
}

export function threadIdFromUrl(url: URL): string | null {
  return url.pathname.match(/^\/(\d{5,})(?:-\d+)?\.html$/)?.[1] || null;
}

export function threadPageFromUrl(url: URL): number {
  const match = url.pathname.match(/^\/(\d{5,})(?:-(\d+))?\.html$/);
  if (!match) return 1;
  return Math.max(1, Number(match[2] || 1));
}

function isForumPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return /^\/(bxj|topic-daily)(?:-\d+)?$/.test(pathname);
}

function isSupportedPath(url: URL): boolean {
  return isForumPath(url.pathname) || threadIdFromUrl(url) !== null;
}

async function fetchHtml(path: string): Promise<{ html: string; url: string }> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return {
    html: await response.text(),
    url: response.url || new URL(path, location.href).href,
  };
}

function cursorState(value: unknown): HupuCursor {
  if (value && typeof value === "object") {
    const page = Number((value as HupuCursor).page);
    const total = Number((value as HupuCursor).total);
    const offset = Number((value as HupuCursor).offset);
    if (Number.isFinite(page) && page >= 1) {
      return {
        page,
        total: Number.isFinite(total) && total >= page ? total : page,
        offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
      };
    }
  }
  return { page: 1, total: 1, offset: 0 };
}

function listPathFromUrl(url: URL, doc: Document): string {
  if (!threadIdFromUrl(url)) {
    return url.pathname === "/" ? "/bxj" : url.pathname;
  }

  const links = [...doc.querySelectorAll('section[class*="hp-pc-breadcrumb"] a[href]')]
    .map((anchor) => {
      const href = anchor.getAttribute("href") || "";
      try {
        return new URL(href, HUPU_ORIGIN).pathname;
      } catch {
        return "";
      }
    })
    .filter((path) => path.startsWith("/") && !path.includes(".html"));
  const topic = links[links.length - 1];
  return topic && topic !== "/" ? topic : "/bxj";
}

export const hupuAdapter: SiteAdapter = {
  id: "hupu",
  label: "虎扑",
  normalTitle: "微信",

  match(url: URL): boolean {
    return url.hostname === "bbs.hupu.com";
  },

  async detect(): Promise<SiteContext | null> {
    const url = new URL(location.href);
    if (!this.match(url) || !isSupportedPath(url)) return null;
    const threadId = threadIdFromUrl(url);
    return {
      url: location.href,
      canonicalId: threadId ? `thread:${threadId}` : `forum:${url.pathname}`,
      title: document.title,
    };
  },

  initialConversationId(): string | null {
    return threadIdFromUrl(new URL(location.href));
  },

  conversationIdFromUrl: threadIdFromUrl,

  async listConversations(): Promise<Conversation[]> {
    const path = listPathFromUrl(new URL(location.href), document);
    const { html } = await fetchHtml(path);
    return parseThreadList(html);
  },

  async openConversation(id: string): Promise<ContentView> {
    const { html, url } = await fetchHtml(`/${encodeURIComponent(id)}.html`);
    return parseThreadView(html, url);
  },

  async loadMore(id: string, cursor: unknown): Promise<LoadMoreResult> {
    const state = cursorState(cursor);
    const next = state.page + 1;
    if (next > state.total) {
      return { html: "", hasMore: false, cursor: state };
    }

    const { html, url } = await fetchHtml(
      `/${encodeURIComponent(id)}-${next}.html`,
    );
    const doc = parseHtml(html);
    if (!doc.querySelector(".post-reply-list-container") && !doc.querySelector('[class*="bbs-post-web-main-title"]')) {
      throw new Error("无法读取帖子（可能需要登录）");
    }
    const total = Math.max(state.total, totalPagesFromDoc(doc));
    const replies = parseReplies(doc, url, state.offset + 1);
    return {
      html: replies.html,
      hasMore: next < total,
      cursor: {
        page: next,
        total,
        offset: state.offset + replies.count,
      } satisfies HupuCursor,
    };
  },
};

const tree: WorkNode[] = [
  {
    name: "src",
    type: "dir",
    children: [
      {
        name: "api",
        type: "dir",
        children: [
          { name: "threads.ts", type: "file", status: "M" },
          { name: "replies.ts", type: "file" },
        ],
      },
      {
        name: "services",
        type: "dir",
        children: [
          { name: "feed.ts", type: "file", status: "M" },
          { name: "moderation.ts", type: "file" },
        ],
      },
      {
        name: "components",
        type: "dir",
        children: [
          { name: "ThreadList.tsx", type: "file" },
          { name: "PostView.tsx", type: "file", status: "M" },
        ],
      },
      {
        name: "config",
        type: "dir",
        children: [{ name: "app.yaml", type: "file" }],
      },
    ],
  },
  {
    name: "scripts",
    type: "dir",
    children: [
      { name: "deploy.sh", type: "file" },
      { name: "migrate.sql", type: "file", status: "D" },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "README.md", type: "file", status: "U" },
];

export const hupuCoverStory: CoverStory = {
  workspace: "sports-service",
  branch: "main",
  branches: ["main", "develop", "release/2026.11"],
  footer: "Node 22 · pnpm · main",
  fakeDocName: "sports-spec.pdf",
  tabTitle: "sports-spec.pdf · 工作目录",
  tree,
};