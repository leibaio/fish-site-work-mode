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
  parseCount,
  queryAll,
  queryFirst,
  timeAgo,
  topLevel,
  waitForSelector,
} from "../../../core/src/index";

const REMOVE_UI = [
  ".comment-actions",
  ".topic-actions",
  ".comment-operations",
  ".reply-actions",
  "script",
  "style",
  "noscript",
];

function parseDoubanTime(value: string): number {
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

function firstNonEmpty(root: Element, selectors: string[]): string {
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) {
      const text = normalizeText(element.textContent);
      if (text) return text;
    }
  }
  return "";
}

function createPost(
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
      <span class="fs-post-time">${escapeHtml(timeAgo(parseDoubanTime(timeText)))}</span>
    </header>
    <div class="fs-post-body">${content}</div>
  </section>`;
}

export function topicIdFromUrl(url: URL): string | null {
  return url.pathname.match(/^\/group\/topic\/(\d+)(?:\/|$)/)?.[1] || null;
}

export function isGroupHome(url: URL): boolean {
  return url.pathname === "/group" || url.pathname === "/group/";
}

function isSupportedPath(url: URL): boolean {
  return isGroupHome(url) || topicIdFromUrl(url) !== null;
}

export function parseGroupList(doc: Document, baseUrl: string): Conversation[] {
  const items = topLevel(
    queryAll(doc, [".channel-item", ".topics .channel-item", "[class*='channel-item']"]),
  );

  return items
    .map((item): Conversation | null => {
      const link = queryFirst(item, ["h3 a", ".title a", 'a[href*="/group/topic/"]']);
      const title = normalizeText(link?.textContent);
      const href = link?.getAttribute("href") || "";
      let pathname = "";
      try {
        pathname = new URL(href, baseUrl).pathname;
      } catch {
        pathname = "";
      }
      const topicId = pathname.match(/^\/group\/topic\/(\d+)/)?.[1];
      if (!topicId || !title) return null;

      const group = firstText(item, [".source .from a", ".from a", ".source a"]);
      const timeText = firstText(item, [".pubtime", ".time", "[class*='time']"]);
      const likes = parseCount(firstText(item, [".likes", "[class*='likes']"]));
      const image = queryFirst(item, [".pic img", "img"]);
      const avatar = image
        ? absoluteUrl(image.getAttribute("data-src") || image.getAttribute("src"), baseUrl)
        : "";
      const subtitle = [group, timeText, likes > 0 ? `${likes} 喜欢` : ""]
        .filter(Boolean)
        .join(" · ");

      return {
        id: `topic:${topicId}`,
        title,
        subtitle: subtitle || "豆瓣小组",
        avatar,
        avatarFallback: group || title,
        updatedAt: parseDoubanTime(timeText),
      };
    })
    .filter((conversation): conversation is Conversation => conversation !== null);
}

interface DoubanReply {
  id: string;
  author: string;
  avatar: string;
  timeText: string;
  content: string;
  excerpt: string;
  element: Element;
}

interface DoubanTopicContext {
  topicId: string;
  title: string;
  author: string;
  avatar: string;
  timeText: string;
  bodyHtml: string;
  replies: DoubanReply[];
}

function parseReplies(doc: Document, baseUrl: string): DoubanReply[] {
  const items = topLevel(
    queryAll(doc, [
      ".comment-item",
      ".reply-item",
      "[data-cid]",
      "[class*='comment-item']",
    ]),
  );

  const replies: DoubanReply[] = [];
  for (const item of items) {
    const contentElement = queryFirst(item, [
      ".comment-content",
      ".reply-content",
      "[class*='comment-content']",
      "[class*='rich-content']",
    ]);
    const content = cleanElement(contentElement, baseUrl, REMOVE_UI);
    if (!content) continue;

    const cid =
      item.getAttribute("data-cid") ||
      item.id.match(/comment-(\d+)/)?.[1] ||
      item.getAttribute("data-id") ||
      String(replies.length + 1);
    const author =
      firstNonEmpty(item, [
        ".comment-info a",
        ".comment-author a",
        ".comment-info .name a",
        "[class*='author'] a",
        'a[href*="/people/"]',
      ]) || "匿名用户";
    const avatarElement = queryFirst(item, [
      ".comment-info img",
      ".comment-author img",
      "[class*='avatar'] img",
      ".user-face img",
    ]);
    const avatar = avatarElement
      ? absoluteUrl(
          avatarElement.getAttribute("data-src") || avatarElement.getAttribute("src"),
          baseUrl,
        )
      : "";
    const timeText = firstText(item, [".comment-time", "[class*='time']", "time"]);

    replies.push({
      id: `reply:${cid}`,
      author,
      avatar,
      timeText,
      content,
      excerpt: normalizeText(contentElement?.textContent).slice(0, 80),
      element: item,
    });
  }
  return replies;
}

export function parseTopicPage(
  doc: Document,
  baseUrl: string,
  topicId: string,
): DoubanTopicContext {
  const title = firstText(doc, [
    "#content h1",
    "h1",
    ".topic-title",
    "[class*='topic-title']",
  ]);
  const bodyElement = queryFirst(doc, [
    ".topic-content",
    "#link-report .topic-content",
    "[class*='topic-content']",
    ".rich-content",
  ]);
  if (!title && !bodyElement) {
    throw new Error("无法读取豆瓣话题（可能需要登录）");
  }

  const author =
    firstNonEmpty(doc.documentElement, [
      ".topic-author a",
      ".topic-doc .from a",
      ".topic-author",
      "[class*='topic-author']",
      'a[href*="/people/"]',
    ]) || "匿名用户";
  const avatarElement = queryFirst(doc, [
    ".topic-author img",
    ".topic-doc .avatar img",
    "[class*='topic-author'] img",
  ]);
  const avatar = avatarElement
    ? absoluteUrl(
        avatarElement.getAttribute("data-src") || avatarElement.getAttribute("src"),
        baseUrl,
      )
    : "";
  const timeText = firstText(doc, [
    ".topic-time",
    ".create-time",
    ".topic-doc .time",
    "[class*='topic-time']",
  ]);

  return {
    topicId,
    title: title || "豆瓣小组话题",
    author,
    avatar,
    timeText,
    bodyHtml: cleanElement(bodyElement, baseUrl, REMOVE_UI),
    replies: parseReplies(doc, baseUrl),
  };
}

export function topicView(topic: DoubanTopicContext): ContentView {
  const meta = [topic.author, timeAgo(parseDoubanTime(topic.timeText)), `${topic.replies.length} 回复`]
    .filter(Boolean)
    .join(" · ");
  const replies = topic.replies
    .map((reply, index) =>
      createPost(
        reply.author,
        reply.avatar,
        `#${index + 1}`,
        reply.timeText,
        reply.content,
      ),
    )
    .join("");

  return {
    title: topic.title,
    subtitle: meta,
    html:
      `<h1 class="fs-topic-title">${escapeHtml(topic.title)}</h1>` +
      `<div class="fs-topic-meta">${escapeHtml(meta)}</div>` +
      createPost(topic.author, topic.avatar, "楼主", topic.timeText, topic.bodyHtml) +
      replies,
    hasMore: false,
  };
}

export function replyView(topic: DoubanTopicContext, reply: DoubanReply): ContentView {
  const meta = [reply.author, timeAgo(parseDoubanTime(reply.timeText)), "回复"]
    .filter(Boolean)
    .join(" · ");
  return {
    title: topic.title,
    subtitle: meta,
    html:
      `<h1 class="fs-topic-title">${escapeHtml(topic.title)}</h1>` +
      `<div class="fs-topic-meta">${escapeHtml(meta)}</div>` +
      createPost(reply.author, reply.avatar, "回复", reply.timeText, reply.content),
    hasMore: false,
  };
}

async function fetchTopicDoc(topicId: string): Promise<{ doc: Document; url: string }> {
  const response = await fetch(`/group/topic/${encodeURIComponent(topicId)}/`, {
    credentials: "include",
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc.querySelector(".topic-content, .topic-doc, .comment-item")) {
    throw new Error("无法读取豆瓣话题（可能需要登录）");
  }
  return {
    doc,
    url: response.url || new URL(`/group/topic/${topicId}/`, location.href).href,
  };
}

let replyElements = new Map<string, Element>();
let topicContext: DoubanTopicContext | null = null;

function liveTopicContext(): DoubanTopicContext {
  const topicId = topicIdFromUrl(new URL(location.href));
  if (!topicId) throw new Error("当前不是豆瓣小组话题页");
  if (topicContext?.topicId === topicId) return topicContext;
  const context = parseTopicPage(document, location.href, topicId);
  topicContext = context;
  replyElements = new Map(context.replies.map((reply) => [reply.id, reply.element]));
  return context;
}

export const doubanAdapter: SiteAdapter = {
  id: "douban",
  label: "豆瓣",
  normalTitle: "微信",

  match(url: URL): boolean {
    return url.hostname === "douban.com" || url.hostname === "www.douban.com";
  },

  async detect(): Promise<SiteContext | null> {
    const url = new URL(location.href);
    if (!this.match(url) || !isSupportedPath(url)) return null;
    const topicId = topicIdFromUrl(url);
    return {
      url: location.href,
      canonicalId: topicId ? `topic:${topicId}` : "group",
      title: document.title,
    };
  },

  autoOpenFirst: false,

  initialConversationId(): string | null {
    const topicId = topicIdFromUrl(new URL(location.href));
    return topicId ? `topic:${topicId}` : null;
  },

  async listConversations(): Promise<Conversation[]> {
    replyElements = new Map();
    topicContext = null;
    const url = new URL(location.href);
    const topicId = topicIdFromUrl(url);

    if (!topicId) {
      await waitForSelector([".channel-item", ".topics .channel-item"], 6000);
      const conversations = parseGroupList(document, location.href);
      if (conversations.length) return conversations;
      throw new Error("未找到豆瓣小组内容（可能需要登录）");
    }

    await waitForSelector([".topic-content", ".topic-doc", ".comment-item", "h1"], 8000);
    const topic = liveTopicContext();
    const replies = topic.replies.map(
      (reply, index): Conversation => ({
        id: reply.id,
        title: reply.author,
        subtitle: reply.excerpt || `回复 #${index + 1}`,
        avatar: reply.avatar,
        avatarFallback: reply.author,
        updatedAt: parseDoubanTime(reply.timeText),
      }),
    );

    return [
      {
        id: `topic:${topicId}`,
        title: topic.title,
        subtitle: [topic.author, timeAgo(parseDoubanTime(topic.timeText)), "楼主"]
          .filter(Boolean)
          .join(" · "),
        avatar: topic.avatar,
        avatarFallback: topic.author,
        updatedAt: parseDoubanTime(topic.timeText),
      },
      ...replies,
    ];
  },

  async openConversation(id: string): Promise<ContentView> {
    const url = new URL(location.href);
    const liveTopicId = topicIdFromUrl(url);

    if (id.startsWith("reply:")) {
      if (!liveTopicId) throw new Error("回复只能在豆瓣话题页打开");
      const topic = liveTopicContext();
      const reply = topic.replies.find((item) => item.id === id);
      if (!reply) throw new Error("回复不在当前页面，请刷新豆瓣页面后重试");
      return replyView(topic, reply);
    }

    const topicId = id.startsWith("topic:") ? id.slice("topic:".length) : id;
    if (liveTopicId === topicId) {
      return topicView(liveTopicContext());
    }

    try {
      const fetched = await fetchTopicDoc(topicId);
      const parsed = parseTopicPage(fetched.doc, fetched.url, topicId);
      return topicView(parsed);
    } catch {
      const target = `${location.origin}/group/topic/${encodeURIComponent(topicId)}/`;
      if (location.href !== target) {
        location.assign(target);
        throw new Error("正在打开豆瓣话题…");
      }
      throw new Error("无法读取豆瓣话题（可能需要登录）");
    }
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
          { name: "topics.ts", type: "file", status: "M" },
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
          { name: "TopicList.tsx", type: "file" },
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
      { name: "export.sql", type: "file", status: "D" },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "README.md", type: "file", status: "U" },
];

export const doubanCoverStory: CoverStory = {
  workspace: "editorial-service",
  branch: "main",
  branches: ["main", "develop", "release/2026.11"],
  footer: "Node 22 · pnpm · main",
  fakeDocName: "editorial-notes.pdf",
  tabTitle: "editorial-notes.pdf · 工作目录",
  tree,
};