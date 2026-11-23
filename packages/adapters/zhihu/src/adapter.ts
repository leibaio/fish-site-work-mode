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

const ANSWER_SELECTORS = [
  ".AnswerItem",
  '[data-za-detail-view-path-module="AnswerItem"]',
  '[itemprop="suggestedAnswer"]',
  '[itemprop="acceptedAnswer"]',
  ".List-item .ContentItem.AnswerItem",
];

const FEED_SELECTORS = [
  ".TopstoryItem",
  ".FeedItem",
  '[data-za-detail-view-path-module="FeedItem"]',
  '[data-za-detail-view-path-module="AnswerItem"]',
  ".HotItem",
  '[data-za-detail-view-path-module="HotItem"]',
];

const QUESTION_TITLE_SELECTORS = [
  "h1.QuestionHeader-title",
  ".QuestionHeader-title",
  ".QuestionItem-title",
];

const AUTHOR_SELECTORS = [
  ".AuthorInfo-name",
  ".UserLink-link",
  '[itemprop="author"] [itemprop="name"]',
  'a[href*="/people/"]',
];

const AVATAR_SELECTORS = [
  ".AuthorInfo-avatar img",
  "img.Avatar",
  ".AuthorInfo-content img",
  'a[href*="/people/"] img',
];

const RICH_SELECTORS = [
  ".RichText",
  ".RichContent-inner",
  '[itemprop="text"]',
  ".QuestionRichText",
];

const VOTE_SELECTORS = [
  ".VoteButton--up",
  'button[class*="VoteButton"]',
  'button[aria-label*="赞同"]',
];

const TIME_SELECTORS = [".ContentItem-time", "time", '[class*="ContentItem-time"]'];

const QUESTION_DESC_SELECTORS = [
  ".QuestionRichText",
  ".QuestionHeader-detail",
  '[itemprop="text"]',
];

const REMOVE_UI = [
  ".ContentItem-actions",
  ".RichContent-actions",
  ".AnswerItem-actions",
  ".VoteButton",
  ".ContentItem-time",
  ".ContentItem-status",
  ".RecommendList",
  ".Post-Sub",
  ".ContentItem-more",
  ".ContentItem-rightButton",
  ".RichContent-collapsedText",
  "script",
  "style",
  "noscript",
];

function parseZhihuTime(value: string): number {
  const text = normalizeText(value).replace(/^(发布于|编辑于)\s*/, "");
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

function questionTitle(doc: Document): string {
  const title = firstText(doc, QUESTION_TITLE_SELECTORS);
  if (title) return title;
  return (
    normalizeText(doc.title).replace(/\s*[-–|]\s*知乎.*$/, "").trim() || "知乎"
  );
}

function itemTitle(element: Element): string {
  return (
    firstText(element, [
      ".ContentItem-title",
      ".QuestionItem-title",
      ".HotItem-title",
      ".HotItem-content h2",
      "h2",
      "h1",
    ]) ||
    excerptOf(element) ||
    "知乎"
  );
}

function excerptOf(element: Element): string {
  const rich = queryFirst(element, [
    ...RICH_SELECTORS,
    ".HotItem-excerpt",
    ".HotItem-content",
  ]);
  return normalizeText(rich?.textContent).slice(0, 90);
}

function authorOf(element: Element): string {
  return firstText(element, AUTHOR_SELECTORS) || "匿名用户";
}

function avatarOf(element: Element, baseUrl: string): string {
  const image = queryFirst(element, AVATAR_SELECTORS);
  if (!image) return "";
  return absoluteUrl(
    image.getAttribute("data-src") || image.getAttribute("src"),
    baseUrl,
  );
}

function votesOf(element: Element): number {
  return parseCount(firstText(element, VOTE_SELECTORS));
}

function timeTextOf(element: Element): string {
  return firstText(element, TIME_SELECTORS);
}

function answerIdOf(element: Element, index: number): string {
  const ownId = element.id.match(/^answer-(\d+)/);
  if (ownId) return ownId[1];

  const zopElement = element.matches("[data-zop]")
    ? element
    : element.querySelector("[data-zop]");
  const zop = zopElement?.getAttribute("data-zop");
  if (zop) {
    try {
      const data = JSON.parse(zop) as { itemId?: string | number; id?: string | number };
      const itemId = data.itemId || data.id;
      if (itemId) return String(itemId);
    } catch {
      // 忽略无法解析的 data-zop
    }
  }

  const link = element.querySelector('a[href*="/answer/"]')?.getAttribute("href") || "";
  const match = link.match(/\/answer\/(\d+)/);
  if (match) return match[1];
  return `i${index}`;
}

function buildPost(
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
      <span class="fs-post-time">${escapeHtml(timeAgo(parseZhihuTime(timeText)))}</span>
    </header>
    <div class="fs-post-body">${content}</div>
  </section>`;
}

export interface ZhihuParsedList {
  conversations: Conversation[];
  elements: Map<string, Element>;
}

export function parseAnswerList(doc: Document, baseUrl: string): ZhihuParsedList {
  const elements = topLevel(queryAll(doc, ANSWER_SELECTORS));
  const conversations: Conversation[] = [];
  const map = new Map<string, Element>();

  elements.forEach((element, index) => {
    const id = `answer:${answerIdOf(element, index)}`;
    const author = authorOf(element);
    const excerpt = excerptOf(element);
    const votes = votesOf(element);
    const timeText = timeTextOf(element);
    conversations.push({
      id,
      title: author,
      subtitle: excerpt || (votes > 0 ? `${votes} 赞同` : "知乎回答"),
      avatar: avatarOf(element, baseUrl),
      avatarFallback: author,
      updatedAt: parseZhihuTime(timeText),
    });
    map.set(id, element);
  });

  return { conversations, elements: map };
}

export function parseFeedList(doc: Document, baseUrl: string): ZhihuParsedList {
  const elements = topLevel(queryAll(doc, FEED_SELECTORS));
  const conversations: Conversation[] = [];
  const map = new Map<string, Element>();

  elements.forEach((element, index) => {
    const title = itemTitle(element);
    const excerpt = excerptOf(element);
    const author = authorOf(element);
    if (!title && !excerpt) return;

    const id = `feed:${index}`;
    const subtitle = [author, excerpt && excerpt !== title ? excerpt : ""]
      .filter(Boolean)
      .join(" · ");
    conversations.push({
      id,
      title: title || author,
      subtitle: subtitle || "知乎内容",
      avatar: avatarOf(element, baseUrl),
      avatarFallback: author,
      updatedAt: parseZhihuTime(timeTextOf(element)),
    });
    map.set(id, element);
  });

  return { conversations, elements: map };
}

export function answerView(doc: Document, element: Element, baseUrl: string): ContentView {
  const title = questionTitle(doc) || "知乎回答";
  const author = authorOf(element);
  const avatar = avatarOf(element, baseUrl);
  const votes = votesOf(element);
  const timeText = timeTextOf(element);
  const rich = queryFirst(element, RICH_SELECTORS);
  const content =
    cleanElement(rich, baseUrl, REMOVE_UI) || cleanElement(element, baseUrl, REMOVE_UI);
  const meta = [
    votes > 0 ? `${votes} 赞同` : "",
    timeText ? timeAgo(parseZhihuTime(timeText)) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title,
    subtitle: meta || "知乎回答",
    html:
      `<h1 class="fs-topic-title">${escapeHtml(title)}</h1>` +
      `<div class="fs-topic-meta">${escapeHtml(meta || "知乎回答")}</div>` +
      buildPost(author, avatar, "回答", timeText, content),
    hasMore: false,
  };
}

export function questionView(doc: Document, baseUrl: string): ContentView {
  const title = questionTitle(doc) || "知乎问题";
  const header = queryFirst(doc, [
    ".QuestionHeader",
    '[data-za-detail-view-path-module="QuestionHeader"]',
    ".QuestionHeader-main",
  ]);
  const description = cleanElement(
    header ? queryFirst(header, QUESTION_DESC_SELECTORS) : queryFirst(doc, QUESTION_DESC_SELECTORS),
    baseUrl,
    REMOVE_UI,
  );
  const answers = topLevel(queryAll(doc, ANSWER_SELECTORS));
  const posts: string[] = [];
  if (description) {
    posts.push(buildPost("问题描述", "", "问题", "", description));
  }
  answers.forEach((element, index) => {
    const content = cleanElement(queryFirst(element, RICH_SELECTORS), baseUrl, REMOVE_UI);
    posts.push(
      buildPost(
        authorOf(element),
        avatarOf(element, baseUrl),
        `回答 ${index + 1}`,
        timeTextOf(element),
        content,
      ),
    );
  });
  const meta = `${answers.length} 个回答`;

  return {
    title,
    subtitle: meta,
    html:
      `<h1 class="fs-topic-title">${escapeHtml(title)}</h1>` +
      `<div class="fs-topic-meta">${escapeHtml(meta)}</div>` +
      posts.join(""),
    hasMore: false,
  };
}

export function feedView(doc: Document, element: Element, baseUrl: string): ContentView {
  const title = itemTitle(element) || "知乎";
  const author = authorOf(element);
  const avatar = avatarOf(element, baseUrl);
  const votes = votesOf(element);
  const timeText = timeTextOf(element);
  const rich = queryFirst(element, [...RICH_SELECTORS, ".HotItem-excerpt", ".HotItem-content"]);
  const content =
    cleanElement(rich, baseUrl, REMOVE_UI) || cleanElement(element, baseUrl, REMOVE_UI);
  const meta = [
    author,
    votes > 0 ? `${votes} 赞同` : "",
    timeText ? timeAgo(parseZhihuTime(timeText)) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title,
    subtitle: meta || "知乎",
    html:
      `<h1 class="fs-topic-title">${escapeHtml(title)}</h1>` +
      `<div class="fs-topic-meta">${escapeHtml(meta || "知乎")}</div>` +
      buildPost(author, avatar, "内容", timeText, content),
    hasMore: false,
  };
}

export function questionIdFromUrl(url: URL): string | null {
  return url.pathname.match(/^\/question\/(\d+)/)?.[1] || null;
}

export function answerIdFromUrl(url: URL): string | null {
  return url.pathname.match(/^\/question\/\d+\/answer\/(\d+)/)?.[1] || null;
}

function isQuestionPage(url: URL): boolean {
  return /^\/question\/\d+/.test(url.pathname);
}

function isSupportedPath(url: URL): boolean {
  if (url.pathname === "/" || /^\/hot(?:\/|$)/.test(url.pathname)) return true;
  return /^\/question\/\d+(?:\/answer\/\d+)?(?:\/|$)/.test(url.pathname);
}

let answerElements = new Map<string, Element>();
let feedElements = new Map<string, Element>();

function findAnswerElement(answerId: string): Element | null {
  const byId = document.getElementById(`answer-${answerId}`);
  if (byId) {
    return byId.closest(ANSWER_SELECTORS.join(", ")) || byId;
  }
  const link = document.querySelector(`a[href*="/answer/${answerId}"]`);
  return link?.closest(ANSWER_SELECTORS.join(", ")) || null;
}

export const zhihuAdapter: SiteAdapter = {
  id: "zhihu",
  label: "知乎",
  normalTitle: "微信",

  match(url: URL): boolean {
    return url.hostname === "zhihu.com" || url.hostname === "www.zhihu.com";
  },

  async detect(): Promise<SiteContext | null> {
    const url = new URL(location.href);
    if (!this.match(url) || !isSupportedPath(url)) return null;
    const answerId = answerIdFromUrl(url);
    const questionId = questionIdFromUrl(url);
    return {
      url: location.href,
      canonicalId: answerId
        ? `answer:${answerId}`
        : questionId
          ? `question:${questionId}`
          : "home",
      title: document.title,
    };
  },

  initialConversationId(): string | null {
    const answerId = answerIdFromUrl(new URL(location.href));
    return answerId ? `answer:${answerId}` : null;
  },

  async listConversations(): Promise<Conversation[]> {
    const url = new URL(location.href);
    answerElements = new Map();
    feedElements = new Map();

    if (isQuestionPage(url)) {
      await waitForSelector(ANSWER_SELECTORS, 6000);
      const parsed = parseAnswerList(document, location.href);
      answerElements = parsed.elements;
      if (parsed.conversations.length) return parsed.conversations;

      const questionId = questionIdFromUrl(url);
      if (questionId) {
        return [
          {
            id: `question:${questionId}`,
            title: questionTitle(document),
            subtitle: "问题描述",
            avatarFallback: "问",
            updatedAt: 0,
          },
        ];
      }
      return [];
    }

    await waitForSelector(FEED_SELECTORS, 8000);
    const parsed = parseFeedList(document, location.href);
    feedElements = parsed.elements;
    if (parsed.conversations.length) return parsed.conversations;
    throw new Error("未找到知乎内容（请确认已登录，且页面已加载）");
  },

  async openConversation(id: string): Promise<ContentView> {
    if (id.startsWith("answer:")) {
      const answerId = id.slice("answer:".length);
      const element = answerElements.get(id) || findAnswerElement(answerId);
      if (!element) throw new Error("回答不在当前页面，请刷新知乎页面后重试");
      return answerView(document, element, location.href);
    }
    if (id.startsWith("question:")) {
      return questionView(document, location.href);
    }

    const element = feedElements.get(id);
    if (!element || !element.isConnected) {
      throw new Error("内容已刷新，请重新打开知乎页面");
    }
    return feedView(document, element, location.href);
  },
};

const tree: WorkNode[] = [
  {
    name: "research",
    type: "dir",
    children: [
      {
        name: "analysis",
        type: "dir",
        children: [
          { name: "topics.py", type: "file", status: "M" },
          { name: "answers.py", type: "file" },
        ],
      },
      {
        name: "notes",
        type: "dir",
        children: [{ name: "summary.md", type: "file" }],
      },
      {
        name: "config",
        type: "dir",
        children: [{ name: "settings.yaml", type: "file" }],
      },
    ],
  },
  {
    name: "scripts",
    type: "dir",
    children: [
      { name: "collect.py", type: "file" },
      { name: "export.sql", type: "file", status: "D" },
    ],
  },
  { name: "pyproject.toml", type: "file" },
  { name: "README.md", type: "file", status: "U" },
];

export const zhihuCoverStory: CoverStory = {
  workspace: "research-service",
  branch: "main",
  branches: ["main", "develop", "release/2026.11"],
  footer: "Python 3.12 · uv · main",
  fakeDocName: "research-notes.pdf",
  tabTitle: "research-notes.pdf · 工作目录",
  tree,
};