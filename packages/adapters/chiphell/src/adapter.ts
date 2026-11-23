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

const DEFAULT_FORUM_ID = "146";

interface ThreadCursor {
  page: number;
  total: number;
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

function parseDiscuzTime(value: string): number {
  const text = normalize(value).replace(/^发表于\s*/, "");
  if (!text) return 0;

  const absolute = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (absolute) {
    return new Date(
      Number(absolute[1]),
      Number(absolute[2]) - 1,
      Number(absolute[3]),
      Number(absolute[4]),
      Number(absolute[5]),
      Number(absolute[6] || 0),
    ).getTime();
  }

  const relative = text.match(/(\d+)\s*(分钟|小时|天)前/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit =
      relative[2] === "分钟" ? 60_000 : relative[2] === "小时" ? 3_600_000 : 86_400_000;
    return Date.now() - amount * unit;
  }
  if (text.includes("刚刚")) return Date.now();
  if (text.includes("昨天")) return Date.now() - 86_400_000;
  if (text.includes("前天")) return Date.now() - 172_800_000;
  return 0;
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

function cleanContent(html: string, baseUrl: string): string {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

  doc.querySelectorAll("img").forEach((image) => {
    const real =
      image.getAttribute("zoomfile") ||
      image.getAttribute("file") ||
      image.getAttribute("data-original");
    if (real) image.setAttribute("src", real);
    const src = image.getAttribute("src");
    if (src) image.setAttribute("src", absoluteUrl(src, baseUrl));
    image.removeAttribute("file");
    image.removeAttribute("zoomfile");
    image.removeAttribute("data-original");
  });

  doc.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
    const absolute = absoluteUrl(href, baseUrl);
    if (absolute) anchor.setAttribute("href", absolute);
  });

  return sanitizeCooked(doc.body ? doc.body.innerHTML : "");
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
      <span class="fs-post-floor">#${escapeHtml(floor)}</span>
      <span class="fs-post-time">${escapeHtml(timeAgo(parseDiscuzTime(timeText)))}</span>
    </header>
    <div class="fs-post-body">${content}</div>
  </section>`;
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function totalPagesFromDoc(doc: Document): number {
  const label = doc.querySelector(".pg label span[title*='页']");
  const text = label ? `${label.getAttribute("title") || ""} ${label.textContent || ""}` : "";
  const match = text.match(/共\s*(\d+)\s*页/) || text.match(/\/\s*(\d+)\s*页/);
  if (match) return Math.max(1, Number(match[1]));

  let max = 1;
  doc.querySelectorAll(".pg a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const query = href.match(/[?&]page=(\d+)/);
    const path = href.match(/thread-\d+-(\d+)-\d+\.html/);
    const page = Number(query?.[1] || path?.[1] || 0);
    if (page > max) max = page;
  });
  return max;
}

function currentPageFromDoc(doc: Document): number {
  const page = toNumber(doc.querySelector(".pg strong")?.textContent);
  return page > 0 ? page : 1;
}

function parseThreadPosts(doc: Document, baseUrl: string): string {
  const posts = [...doc.querySelectorAll('#postlist > div[id^="post_"]')].filter((element) =>
    /^post_\d+$/.test(element.id),
  );

  return posts
    .map((post, index) => {
      const author =
        normalize(post.querySelector(".authi a.xw1")?.textContent) || "匿名用户";
      const avatarSrc =
        post.querySelector(".avatar img")?.getAttribute("src") ||
        post.querySelector(".avatar img")?.getAttribute("file") ||
        "";
      const avatar = absoluteUrl(avatarSrc, baseUrl);
      const floor =
        normalize(post.querySelector('[id^="postnum"] em')?.textContent) || String(index + 1);
      const timeText = normalize(post.querySelector('[id^="authorposton"]')?.textContent);
      const contentElement =
        post.querySelector('td.t_f[id^="postmessage_"]') || post.querySelector(".t_f");
      const content = cleanContent(contentElement?.innerHTML || "", baseUrl);
      return buildPostHtml(author, avatar, floor, timeText, content);
    })
    .join("");
}

export function parseThreadList(html: string): Conversation[] {
  const doc = parseHtml(html);
  if (!doc.querySelector("#threadlisttableid")) {
    throw new Error("无法读取版块列表（可能需要登录）");
  }

  const rows = [
    ...doc.querySelectorAll("tbody[id^='normalthread_'], tbody[id^='stickthread_']"),
  ];

  return rows
    .map((row): Conversation | null => {
      const id = row.id.match(/_(\d+)$/)?.[1];
      const titleLink = row.querySelector("a.xst");
      const title = normalize(titleLink?.textContent);
      if (!id || !title) return null;

      const author =
        normalize(row.querySelector("td.by cite a")?.textContent) || "匿名用户";
      const byCells = row.querySelectorAll("td.by");
      const posted = normalize(byCells[0]?.querySelector("em")?.textContent);
      const lastReply = normalize(byCells[1]?.querySelector("em")?.textContent);
      const numCell = row.querySelector("td.num");
      const replies = toNumber(numCell?.querySelector("a.xi2")?.textContent);
      const views = toNumber(numCell?.querySelector("em")?.textContent);
      const tag = normalize(row.querySelector("th.new em a")?.textContent);
      const subtitle = [
        author,
        `${replies} 回复`,
        `${views} 查看`,
        tag ? `[${tag}]` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      return {
        id,
        title,
        subtitle,
        avatarFallback: author,
        updatedAt: parseDiscuzTime(lastReply || posted),
      };
    })
    .filter((conversation): conversation is Conversation => conversation !== null);
}

export function parseThreadView(html: string, baseUrl: string): ContentView {
  const doc = parseHtml(html);
  if (!doc.querySelector("#postlist")) {
    throw new Error("无法读取帖子（可能需要登录）");
  }

  const title =
    normalize(doc.querySelector("#thread_subject")?.textContent) ||
    normalize(doc.title.split(" - ")[0]) ||
    "Chiphell 帖子";
  const metaText = normalize(doc.querySelector("#postlist .pls .hm")?.textContent);
  const views = toNumber(metaText.match(/查看:\s*(\d+)/)?.[1]);
  const replies = toNumber(metaText.match(/回复:\s*(\d+)/)?.[1]);
  const page = currentPageFromDoc(doc);
  const total = totalPagesFromDoc(doc);
  const postsHtml = parseThreadPosts(doc, baseUrl);
  const meta = [
    `${replies} 回复`,
    `${views} 查看`,
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
      postsHtml,
    hasMore: page < total,
    cursor: { page, total } satisfies ThreadCursor,
  };
}

export function threadIdFromUrl(url: URL): string | null {
  const path = url.pathname.match(/^\/thread-(\d+)-\d+-\d+\.html$/);
  if (path) return path[1];
  if (url.pathname === "/forum.php" && url.searchParams.get("mod") === "viewthread") {
    return url.searchParams.get("tid");
  }
  return null;
}

export function forumIdFromUrl(url: URL): string | null {
  const path = url.pathname.match(/^\/forum-(\d+)-\d+\.html$/);
  if (path) return path[1];
  if (url.pathname === "/forum.php" && url.searchParams.get("mod") === "forumdisplay") {
    return url.searchParams.get("fid");
  }
  return null;
}

function forumIdFromDocument(doc: Document): string | null {
  const back = doc.querySelector("#pgt .pgb a[href*='forum-'], .pgb a[href*='forum-']");
  const path = back?.getAttribute("href")?.match(/forum-(\d+)-\d+\.html/);
  if (path) return path[1];

  const link = doc.querySelector('a[href*="mod=forumdisplay"][href*="fid="]');
  const query = link?.getAttribute("href")?.match(/fid=(\d+)/);
  return query ? query[1] : null;
}

function isSupportedPath(url: URL): boolean {
  if (url.pathname === "/" || url.pathname === "") return true;
  if (/^\/forum-\d+-\d+\.html$/.test(url.pathname)) return true;
  if (/^\/thread-\d+-\d+-\d+\.html$/.test(url.pathname)) return true;
  if (url.pathname === "/forum.php") {
    const mod = url.searchParams.get("mod");
    return mod === "forumdisplay" || mod === "viewthread";
  }
  return false;
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

function cursorState(value: unknown): ThreadCursor {
  if (value && typeof value === "object") {
    const page = Number((value as ThreadCursor).page);
    const total = Number((value as ThreadCursor).total);
    if (Number.isFinite(page) && page >= 1) {
      return { page, total: Number.isFinite(total) && total >= page ? total : page };
    }
  }
  return { page: 1, total: 1 };
}

export const chiphellAdapter: SiteAdapter = {
  id: "chiphell",
  label: "Chiphell",
  normalTitle: "微信",

  match(url: URL): boolean {
    return url.hostname === "chiphell.com" || url.hostname === "www.chiphell.com";
  },

  async detect(): Promise<SiteContext | null> {
    const url = new URL(location.href);
    if (!this.match(url) || !isSupportedPath(url)) return null;
    const threadId = threadIdFromUrl(url);
    const forumId = forumIdFromUrl(url);
    return {
      url: location.href,
      canonicalId: threadId || (forumId ? `forum:${forumId}` : "home"),
      title: document.title,
    };
  },

  initialConversationId(): string | null {
    return threadIdFromUrl(new URL(location.href));
  },

  conversationIdFromUrl: threadIdFromUrl,

  async listConversations(): Promise<Conversation[]> {
    const url = new URL(location.href);
    let forumId = forumIdFromUrl(url);
    if (!forumId && threadIdFromUrl(url)) forumId = forumIdFromDocument(document);
    const targetForum = forumId || DEFAULT_FORUM_ID;
    const { html } = await fetchHtml(`/forum-${targetForum}-1.html`);
    return parseThreadList(html);
  },

  async openConversation(id: string): Promise<ContentView> {
    const { html, url } = await fetchHtml(
      `/thread-${encodeURIComponent(id)}-1-1.html`,
    );
    return parseThreadView(html, url);
  },

  async loadMore(id: string, cursor: unknown): Promise<LoadMoreResult> {
    const state = cursorState(cursor);
    const next = state.page + 1;
    if (next > state.total) {
      return { html: "", hasMore: false, cursor: state };
    }

    const { html, url } = await fetchHtml(
      `/forum.php?mod=viewthread&tid=${encodeURIComponent(id)}&page=${next}`,
    );
    const doc = parseHtml(html);
    if (!doc.querySelector("#postlist")) {
      throw new Error("无法读取帖子（可能需要登录）");
    }
    const total = Math.max(state.total, totalPagesFromDoc(doc));
    return {
      html: parseThreadPosts(doc, url),
      hasMore: next < total,
      cursor: { page: next, total } satisfies ThreadCursor,
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
          { name: "threads.go", type: "file", status: "M" },
          { name: "posts.go", type: "file" },
        ],
      },
      {
        name: "service",
        type: "dir",
        children: [
          { name: "feed.go", type: "file", status: "M" },
          { name: "moderation.go", type: "file" },
        ],
      },
      {
        name: "config",
        type: "dir",
        children: [{ name: "config.yaml", type: "file" }],
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
  { name: "go.mod", type: "file" },
  { name: "README.md", type: "file", status: "U" },
];

export const chiphellCoverStory: CoverStory = {
  workspace: "hardware-service",
  branch: "main",
  branches: ["main", "develop", "release/2026.11"],
  footer: "Go 1.23 · Docker · main",
  fakeDocName: "hardware-spec.pdf",
  tabTitle: "hardware-spec.pdf · 工作目录",
  tree,
};