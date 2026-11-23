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
  firstText,
  normalizeText,
  queryAll,
  queryFirst,
  timeAgo,
  topLevel,
  waitForSelector,
} from "../../../core/src/index";

const PRIMARY_CARD_SELECTORS = [
  "article",
  '[action-type="feed_list_item"]',
  "[mid]",
  "[data-mid]",
];

const FALLBACK_CARD_SELECTORS = [
  '[class*="Feed_wrap"]',
  '[class*="vue-recycle-scroller__item-view"]',
  '[class*="woo-feed"]',
];

const TEXT_SELECTORS = [
  '[node-type="feed_list_content"]',
  '[class*="detail_wbtext"]',
  '[class*="wbtext"]',
  '[class*="feed-content"]',
  '[class*="wbpro-feed"]',
  '[class*="Feed_wrap"] [class*="content"]',
];

const AUTHOR_SELECTORS = [
  'a[href*="/u/"]',
  'a[href*="/n/"]',
  '[class*="name"] a',
  '[class*="user"] a',
  '[class*="name"]',
];

const AVATAR_SELECTORS = [
  '[class*="avatar"] img',
  'img[src*="tvax"]',
  'img[src*="sinaimg"]',
];

const TIME_SELECTORS = [
  '[class*="time"]',
  '[class*="date"]',
  'a[href*="/status/"]',
  "time",
];

const REMOVE_UI = [
  '[class*="toolbar"]',
  '[class*="operate"]',
  '[class*="action"]',
  "script",
  "style",
  "noscript",
];

function parseWeiboTime(value: string): number {
  const text = normalizeText(value);
  if (!text) return 0;

  const full = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (full) {
    return new Date(
      Number(full[1]),
      Number(full[2]) - 1,
      Number(full[3]),
      Number(full[4] || 0),
      Number(full[5] || 0),
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

function findTextElement(card: Element): Element | null {
  for (const selector of TEXT_SELECTORS) {
    const candidates = [...card.querySelectorAll(selector)];
    if (!candidates.length) continue;
    const best = candidates.sort(
      (a, b) => normalizeText(b.textContent).length - normalizeText(a.textContent).length,
    )[0];
    if (normalizeText(best.textContent).length >= 2) return best;
  }

  let best: Element | null = null;
  let bestLength = 0;
  const cardText = normalizeText(card.textContent);
  card.querySelectorAll("div, p, section, span").forEach((element) => {
    const className = String(element.className);
    if (/time|date|name|author|avatar|action|toolbar|operate|footer/i.test(className)) {
      return;
    }
    const text = normalizeText(element.textContent);
    if (text.length > bestLength && text.length < cardText.length) {
      best = element;
      bestLength = text.length;
    }
  });
  return bestLength >= 2 ? best : null;
}

function findAuthor(card: Element): string {
  for (const selector of AUTHOR_SELECTORS) {
    const elements = [...card.querySelectorAll(selector)];
    for (const element of elements) {
      const text = normalizeText(element.textContent);
      if (text) return text;
    }
  }
  return "微博用户";
}

function findAvatar(card: Element, baseUrl: string): string {
  const image = queryFirst(card, AVATAR_SELECTORS);
  if (!image) return "";
  return absoluteUrl(
    image.getAttribute("data-src") || image.getAttribute("src"),
    baseUrl,
  );
}

function findTimeText(card: Element): string {
  const direct = firstText(card, TIME_SELECTORS);
  if (direct) return direct;

  for (const link of card.querySelectorAll("a[href]")) {
    const text = normalizeText(link.textContent);
    if (
      /^\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{2})?$/.test(text) ||
      /^\d{1,2}:\d{2}$/.test(text) ||
      /^\d+\s*(分钟|小时)前$/.test(text) ||
      /^(今天|昨天)\s*\d{1,2}:\d{2}$/.test(text)
    ) {
      return text;
    }
  }
  return "";
}

function midOf(card: Element): string {
  const direct = card.getAttribute("mid") || card.getAttribute("data-mid");
  if (direct) return direct;

  const links = [...card.querySelectorAll('a[href*="weibo.com/"], a[href*="/status/"]')];
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const match =
      href.match(/\/status\/([A-Za-z0-9]+)/) ||
      href.match(/weibo\.com\/\d{5,}\/([A-Za-z0-9]+)/);
    if (match) return match[1];
  }
  return "";
}

function cardCandidates(doc: Document): Element[] {
  let candidates = topLevel(queryAll(doc, PRIMARY_CARD_SELECTORS)).filter(
    (element) => normalizeText(element.textContent).length >= 8,
  );
  if (!candidates.length) {
    candidates = topLevel(queryAll(doc, FALLBACK_CARD_SELECTORS)).filter(
      (element) => normalizeText(element.textContent).length >= 8,
    );
  }
  return candidates;
}

export interface WeiboParsedList {
  conversations: Conversation[];
  elements: Map<string, Element>;
}

export function parseWeiboList(doc: Document, baseUrl: string): WeiboParsedList {
  const cards = cardCandidates(doc);
  const conversations: Conversation[] = [];
  const elements = new Map<string, Element>();

  cards.forEach((card, index) => {
    const mid = midOf(card);
    const id = mid || `weibo:${index}`;
    const author = findAuthor(card);
    const textElement = findTextElement(card);
    const text = normalizeText(textElement?.textContent);
    const avatarElement = queryFirst(card, AVATAR_SELECTORS);
    const hasMedia =
      !!card.querySelector("video") ||
      [...card.querySelectorAll("img")].some(
        (image) =>
          image !== avatarElement &&
          !avatarElement?.contains(image) &&
          /sinaimg/i.test(image.getAttribute("src") || ""),
      );
    if (!text && !hasMedia) return;

    const excerpt = text.slice(0, 80);
    const timeText = findTimeText(card);
    conversations.push({
      id,
      title: author,
      subtitle: excerpt || timeText || "微博",
      avatar: findAvatar(card, baseUrl),
      avatarFallback: author,
      updatedAt: parseWeiboTime(timeText),
    });
    elements.set(id, card);
  });

  return { conversations, elements };
}

function createPost(
  author: string,
  avatar: string,
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
      <span class="fs-post-floor">微博</span>
      <span class="fs-post-time">${escapeHtml(timeAgo(parseWeiboTime(timeText)))}</span>
    </header>
    <div class="fs-post-body">${content}</div>
  </section>`;
}

function collectMedia(card: Element, textElement: Element | null, baseUrl: string): string {
  const avatarElement = queryFirst(card, AVATAR_SELECTORS);
  const avatarSrc = avatarElement
    ? absoluteUrl(
        avatarElement.getAttribute("data-src") || avatarElement.getAttribute("src"),
        baseUrl,
      )
    : "";
  const seen = new Set<string>();
  const parts: string[] = [];

  card.querySelectorAll("img").forEach((image) => {
    if (textElement?.contains(image) || avatarElement?.contains(image) || image === avatarElement) {
      return;
    }
    const src = absoluteUrl(
      image.getAttribute("data-src") || image.getAttribute("src"),
      baseUrl,
    );
    if (!src || src === avatarSrc || !/sinaimg|weibo\.cn/i.test(src)) return;
    if (seen.has(src)) return;
    seen.add(src);
    parts.push(`<p><img src="${escapeAttr(src)}" alt="" loading="lazy"></p>`);
  });

  card.querySelectorAll("video").forEach((video) => {
    if (textElement?.contains(video)) return;
    const src = absoluteUrl(video.getAttribute("src"), baseUrl);
    if (!src) return;
    const poster = absoluteUrl(video.getAttribute("poster"), baseUrl);
    parts.push(
      `<p><video src="${escapeAttr(src)}"${poster ? ` poster="${escapeAttr(poster)}"` : ""} controls></video></p>`,
    );
  });

  return parts.join("");
}

export function weiboView(card: Element, baseUrl: string): ContentView {
  const author = findAuthor(card);
  const avatar = findAvatar(card, baseUrl);
  const textElement = findTextElement(card);
  const text = normalizeText(textElement?.textContent);
  const timeText = findTimeText(card);
  const title = author !== "微博用户" ? author : text.slice(0, 30) || "微博";

  const textHtml = cleanElement(textElement, baseUrl, REMOVE_UI);
  const mediaHtml = collectMedia(card, textElement, baseUrl);
  const retweet = queryFirst(card, [
    '[class*="retweet"]',
    '[class*="repost"]',
    '[class*="forward"]',
    '[class*="expand"]',
  ]);
  const retweetHtml =
    retweet && normalizeText(retweet.textContent).length > 10
      ? `<blockquote class="fs-quote">${cleanElement(retweet, baseUrl, REMOVE_UI)}</blockquote>`
      : "";
  const content = textHtml + mediaHtml + retweetHtml;

  if (!content) {
    throw new Error("无法读取微博内容");
  }

  const meta = [
    timeText ? timeAgo(parseWeiboTime(timeText)) : "",
    text ? `${text.length} 字` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title,
    subtitle: meta || "微博",
    html:
      `<h1 class="fs-topic-title">${escapeHtml(title)}</h1>` +
      `<div class="fs-topic-meta">${escapeHtml(meta || "微博")}</div>` +
      createPost(author, avatar, timeText, content),
    hasMore: false,
  };
}

function isSupportedPath(pathname: string): boolean {
  if (pathname === "/" || /^\/hot(?:\/|$)/.test(pathname)) return true;
  if (/^\/u\/\d+/.test(pathname)) return true;
  if (/^\/n\/[^/]+/.test(pathname)) return true;
  if (/^\/\d{5,}(?:\/|$)/.test(pathname)) return true;
  if (/^\/\d{5,}\/[A-Za-z0-9]+/.test(pathname)) return true;
  return false;
}

export function statusMidFromUrl(url: URL): string | null {
  return url.pathname.match(/^\/\d{5,}\/([A-Za-z0-9]+)/)?.[1] || null;
}

let cardElements = new Map<string, Element>();

function findCardById(id: string): Element | null {
  if (id.startsWith("weibo:")) return null;
  return (
    document.querySelector(`[mid="${id}"]`) ||
    document.querySelector(`[data-mid="${id}"]`)
  );
}

export const weiboAdapter: SiteAdapter = {
  id: "weibo",
  label: "微博",
  normalTitle: "微信",

  match(url: URL): boolean {
    return url.hostname === "weibo.com" || url.hostname === "www.weibo.com";
  },

  async detect(): Promise<SiteContext | null> {
    const url = new URL(location.href);
    if (!this.match(url) || !isSupportedPath(url.pathname)) return null;
    return {
      url: location.href,
      canonicalId: url.pathname === "/" ? "home" : url.pathname,
      title: document.title,
    };
  },

  initialConversationId(): string | null {
    return statusMidFromUrl(new URL(location.href));
  },

  async listConversations(): Promise<Conversation[]> {
    cardElements = new Map();
    await waitForSelector([...PRIMARY_CARD_SELECTORS, ...FALLBACK_CARD_SELECTORS], 8000);
    let parsed = parseWeiboList(document, location.href);
    if (!parsed.conversations.length) {
      await waitForSelector(["[mid]", "[data-mid]"], 3000);
      parsed = parseWeiboList(document, location.href);
    }
    cardElements = parsed.elements;
    if (parsed.conversations.length) return parsed.conversations;
    throw new Error("未找到微博内容（请确认已登录，且时间线已加载）");
  },

  async openConversation(id: string): Promise<ContentView> {
    const element = cardElements.get(id) || findCardById(id);
    if (!element || !element.isConnected) {
      throw new Error("内容已刷新，请重新打开微博页面");
    }
    return weiboView(element, location.href);
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
          { name: "timeline.ts", type: "file", status: "M" },
          { name: "statuses.ts", type: "file" },
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
          { name: "Timeline.tsx", type: "file" },
          { name: "StatusView.tsx", type: "file", status: "M" },
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

export const weiboCoverStory: CoverStory = {
  workspace: "media-service",
  branch: "main",
  branches: ["main", "develop", "release/2026.11"],
  footer: "Node 22 · pnpm · main",
  fakeDocName: "media-spec.pdf",
  tabTitle: "media-spec.pdf · 工作目录",
  tree,
};