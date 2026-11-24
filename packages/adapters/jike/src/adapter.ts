import type {
  ContentView,
  Conversation,
  CoverStory,
  SiteAdapter,
  SiteContext,
  WorkNode,
} from "../../../core/src/index";
import {
  absoluteUrl,
  cleanElement,
  escapeAttr,
  escapeHtml,
  firstChar,
  normalizeText,
  queryAll,
  queryFirst,
  timeAgo,
  topLevel,
  waitForSelector,
} from "../../../core/src/index";

const CARD_SELECTORS = [
  '[class*="_post_"]',
  '[class*="_postCard_"]',
  '[class*="_postItem_"]',
  "article",
];

const CONTENT_SELECTORS = [
  '[class*="_text_"]',
  '[class*="_content_"]',
  '[class*="_body_"]',
];

const AUTHOR_SELECTORS = [
  '[class*="_screenName_"]',
  '[class*="_username_"]',
  'a[href^="/u/"]',
];

const AVATAR_SELECTORS = [
  'img[class*="jk-avatar"]',
  'img[class*="_avatar"]',
  '[class*="_avatar"] img',
  'img[src*="ruguoapp"]',
];

const REMOVE_UI = [
  '[class*="_action"]',
  '[class*="_operate"]',
  '[class*="_toolbar"]',
  "button",
  "script",
  "style",
  "noscript",
];

function parseJikeTime(value: string): number {
  const text = normalizeText(value);
  if (!text) return 0;

  const parsed = /^\d{4}-\d{1,2}-\d{1,2}/.test(text) || /T\d{2}:\d{2}/.test(text)
    ? Date.parse(text)
    : Number.NaN;
  if (Number.isFinite(parsed)) return parsed;

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
  const monthDay = text.match(/(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (monthDay) {
    let date = new Date(
      now.getFullYear(),
      Number(monthDay[1]) - 1,
      Number(monthDay[2]),
      Number(monthDay[3] || 0),
      Number(monthDay[4] || 0),
    );
    if (date.getTime() > now.getTime() + 86_400_000) {
      date = new Date(
        now.getFullYear() - 1,
        Number(monthDay[1]) - 1,
        Number(monthDay[2]),
        Number(monthDay[3] || 0),
        Number(monthDay[4] || 0),
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

function firstNonEmpty(root: Element, selectors: string[]): string {
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) {
      const text = normalizeText(element.textContent);
      if (text) return text;
    }
  }
  return "";
}

function postIdOf(card: Element): string {
  const direct = card.getAttribute("data-post-id") || card.id;
  if (direct && /^[A-Za-z0-9]+$/.test(direct)) return direct;

  for (const link of card.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") || "";
    const match =
      href.match(/\/(?:originalPosts?|originalPost)\/([A-Za-z0-9]+)/) ||
      href.match(/\/u\/[^/]+\/(?:post|repost|comment)\/([A-Za-z0-9]+)/);
    if (match) return match[1];
  }
  return "";
}

function timeOf(card: Element): { raw: string; ms: number } {
  const time = queryFirst(card, ["time", '[class*="_date_"]', '[class*="_time_"]']);
  const raw = normalizeText(
    time?.getAttribute("datetime") || time?.getAttribute("dateTime") || time?.textContent,
  );
  return { raw, ms: parseJikeTime(raw) };
}

function findContentElement(card: Element): Element | null {
  const candidates = topLevel(queryAll(card, CONTENT_SELECTORS))
    .filter((element) => normalizeText(element.textContent).length >= 2)
    .sort(
      (a, b) => normalizeText(b.textContent).length - normalizeText(a.textContent).length,
    );
  if (candidates.length) return candidates[0];

  let best: Element | null = null;
  let bestLength = 0;
  const cardText = normalizeText(card.textContent);
  card.querySelectorAll("div, p, span, section").forEach((element) => {
    if (element.closest('[class*="_screenName_"], [class*="_avatar"], time, button')) return;
    const text = normalizeText(element.textContent);
    if (text.length > bestLength && text.length < cardText.length - 4) {
      best = element;
      bestLength = text.length;
    }
  });
  return bestLength >= 2 ? best : null;
}

function findAvatar(card: Element, baseUrl: string): string {
  const image = queryFirst(card, AVATAR_SELECTORS);
  if (!image) return "";
  return absoluteUrl(
    image.getAttribute("data-src") || image.getAttribute("src"),
    baseUrl,
  );
}

function timeAnchoredCards(doc: Document): Element[] {
  const cards = new Set<Element>();
  doc.querySelectorAll("time").forEach((time) => {
    let node: Element | null = time.parentElement;
    for (let depth = 0; depth < 8 && node; depth++, node = node.parentElement) {
      const text = normalizeText(node.textContent);
      if (text.length > 5000) break;
      if (
        text.length >= 20 &&
        node.querySelector('a[href^="/u/"]') &&
        node.querySelector("img")
      ) {
        cards.add(node);
        break;
      }
    }
  });
  return topLevel([...cards]);
}

function cardCandidates(doc: Document): Element[] {
  let cards = topLevel(queryAll(doc, CARD_SELECTORS)).filter(
    (element) => normalizeText(element.textContent).length >= 8,
  );
  if (cards.length) return cards;

  cards = timeAnchoredCards(doc).filter(
    (element) => normalizeText(element.textContent).length >= 8,
  );
  if (cards.length) return cards;

  const contentBlocks = topLevel(
    queryAll(doc, ['[class*="_text_"]', '[class*="_content_"]']),
  ).filter((element) => normalizeText(element.textContent).length >= 10);

  const fallback = new Set<Element>();
  for (const content of contentBlocks) {
    let node: Element | null = content;
    for (let depth = 0; depth < 6 && node; depth++, node = node.parentElement) {
      if (node.querySelector("time") && node.querySelector('a[href^="/u/"]')) {
        fallback.add(node);
        break;
      }
    }
  }
  return topLevel([...fallback]).filter(
    (element) => normalizeText(element.textContent).length >= 8,
  );
}

function collectMedia(card: Element, contentElement: Element | null, baseUrl: string): string {
  const avatar = queryFirst(card, AVATAR_SELECTORS);
  const seen = new Set<string>();
  const parts: string[] = [];

  card.querySelectorAll("img").forEach((image) => {
    if (image === avatar || avatar?.contains(image) || contentElement?.contains(image)) return;
    const className = String(image.className);
    if (/emoji|icon|avatar/i.test(className)) return;
    const width = Number(image.getAttribute("width") || 0);
    const height = Number(image.getAttribute("height") || 0);
    if ((width && width < 40) || (height && height < 40)) return;

    const src = absoluteUrl(
      image.getAttribute("data-src") || image.getAttribute("src"),
      baseUrl,
    );
    if (!src || seen.has(src)) return;
    seen.add(src);
    parts.push(`<p><img src="${escapeAttr(src)}" alt="" loading="lazy"></p>`);
  });

  card.querySelectorAll("video").forEach((video) => {
    if (contentElement?.contains(video)) return;
    const src = absoluteUrl(video.getAttribute("src"), baseUrl);
    if (!src) return;
    const poster = absoluteUrl(video.getAttribute("poster"), baseUrl);
    parts.push(
      `<p><video src="${escapeAttr(src)}"${poster ? ` poster="${escapeAttr(poster)}"` : ""} controls></video></p>`,
    );
  });

  return parts.join("");
}

function createPost(
  author: string,
  avatar: string,
  floor: string,
  timeMs: number,
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
      <span class="fs-post-time">${escapeHtml(timeAgo(timeMs))}</span>
    </header>
    <div class="fs-post-body">${content}</div>
  </section>`;
}

export interface JikeParsedList {
  conversations: Conversation[];
  elements: Map<string, Element>;
}

export function parseJikeList(
  doc: Document,
  baseUrl: string,
  urlPostId?: string,
): JikeParsedList {
  const cards = cardCandidates(doc);
  const conversations: Conversation[] = [];
  const elements = new Map<string, Element>();

  cards.forEach((card, index) => {
    const linkId = postIdOf(card);
    const id = linkId
      ? `post:${linkId}`
      : urlPostId && index === 0
        ? `post:${urlPostId}`
        : `jike:${index}`;
    const author = firstNonEmpty(card, AUTHOR_SELECTORS) || "即刻用户";
    const content = findContentElement(card);
    const text = normalizeText(content?.textContent);
    const time = timeOf(card);
    const excerpt = text.slice(0, 80);
    conversations.push({
      id,
      title: author,
      subtitle: excerpt || timeAgo(time.ms) || "即刻",
      avatar: findAvatar(card, baseUrl),
      avatarFallback: author,
      updatedAt: time.ms,
    });
    elements.set(id, card);
  });

  return { conversations, elements };
}

export function jikeView(card: Element, baseUrl: string): ContentView {
  const author = firstNonEmpty(card, AUTHOR_SELECTORS) || "即刻用户";
  const avatar = findAvatar(card, baseUrl);
  const contentElement = findContentElement(card);
  const text = normalizeText(contentElement?.textContent);
  const time = timeOf(card);
  const title = author || text.slice(0, 30) || "即刻";
  const body =
    cleanElement(contentElement, baseUrl, REMOVE_UI) ||
    cleanElement(card, baseUrl, REMOVE_UI);
  const media = collectMedia(card, contentElement, baseUrl);
  const content = body + media;

  const meta = [
    timeAgo(time.ms),
    text ? `${text.length} 字` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title,
    subtitle: meta || "即刻",
    html:
      `<h1 class="fs-topic-title">${escapeHtml(title)}</h1>` +
      `<div class="fs-topic-meta">${escapeHtml(meta || "即刻")}</div>` +
      createPost(author, avatar, "动态", time.ms, content),
    hasMore: false,
  };
}

export function postIdFromUrl(url: URL): string | null {
  return (
    url.pathname.match(/^\/(?:originalPosts?|originalPost)\/([A-Za-z0-9]+)/)?.[1] ||
    url.pathname.match(/^\/u\/[^/]+\/(?:post|repost|comment)\/([A-Za-z0-9]+)/)?.[1] ||
    null
  );
}

export function isJikeProfile(url: URL): boolean {
  return /^\/u\/[^/]+\/?$/.test(url.pathname);
}

export function isJikeTopic(url: URL): boolean {
  return /^\/topic\/[^/]+\/?$/.test(url.pathname);
}

function isFeedPath(pathname: string): boolean {
  return pathname === "/" || /^\/(following|explore)\/?$/.test(pathname);
}

function isSupportedPath(url: URL): boolean {
  return (
    isFeedPath(url.pathname) ||
    postIdFromUrl(url) !== null ||
    isJikeProfile(url) ||
    isJikeTopic(url)
  );
}

let cardElements = new Map<string, Element>();

function findCardByPostId(postId: string): Element | null {
  for (const link of document.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") || "";
    if (!href.includes(postId)) continue;
    const card = link.closest(CARD_SELECTORS.join(", "));
    if (card) return card;
  }
  return null;
}

export const jikeAdapter: SiteAdapter = {
  id: "jike",
  label: "即刻",
  normalTitle: "微信",

  match(url: URL): boolean {
    return url.hostname === "web.okjike.com";
  },

  async detect(): Promise<SiteContext | null> {
    const url = new URL(location.href);
    if (!this.match(url) || !isSupportedPath(url)) return null;
    return {
      url: location.href,
      canonicalId: postIdFromUrl(url) ? `post:${postIdFromUrl(url)}` : url.pathname,
      title: document.title,
    };
  },

  initialConversationId(): string | null {
    const postId = postIdFromUrl(new URL(location.href));
    return postId ? `post:${postId}` : null;
  },

  async listConversations(): Promise<Conversation[]> {
    cardElements = new Map();
    await waitForSelector(CARD_SELECTORS, 8000);
    const url = new URL(location.href);
    const postId = postIdFromUrl(url);
    const parsed = parseJikeList(document, location.href, postId || undefined);
    cardElements = parsed.elements;
    if (parsed.conversations.length) return parsed.conversations;
    console.info("[工作台][即刻] 未找到动态卡片", {
      post: document.querySelectorAll('[class*="_post_"]').length,
      postCard: document.querySelectorAll('[class*="_postCard_"]').length,
      postItem: document.querySelectorAll('[class*="_postItem_"]').length,
      time: document.querySelectorAll("time").length,
      userLinks: document.querySelectorAll('a[href^="/u/"]').length,
      href: location.href,
    });
    throw new Error("未找到即刻内容（可能需要登录；控制台已输出页面结构计数）");
  },

  async openConversation(id: string): Promise<ContentView> {
    let element = cardElements.get(id);
    if (!element || !element.isConnected) {
      if (id.startsWith("post:")) {
        element = findCardByPostId(id.slice("post:".length)) || undefined;
      }
    }
    if (!element && id.startsWith("post:")) {
      const postId = postIdFromUrl(new URL(location.href));
      if (postId && id === `post:${postId}`) {
        element = cardCandidates(document)[0];
      }
    }
    if (!element || !element.isConnected) {
      throw new Error("内容已刷新，请重新打开即刻页面");
    }
    return jikeView(element, location.href);
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
          { name: "feed.ts", type: "file", status: "M" },
          { name: "posts.ts", type: "file" },
        ],
      },
      {
        name: "services",
        type: "dir",
        children: [
          { name: "timeline.ts", type: "file", status: "M" },
          { name: "moderation.ts", type: "file" },
        ],
      },
      {
        name: "components",
        type: "dir",
        children: [
          { name: "Feed.tsx", type: "file" },
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

export const jikeCoverStory: CoverStory = {
  workspace: "product-service",
  branch: "main",
  branches: ["main", "develop", "release/2026.11"],
  footer: "Node 22 · pnpm · main",
  fakeDocName: "product-notes.pdf",
  tabTitle: "product-notes.pdf · 工作目录",
  tree,
};