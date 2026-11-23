import type {
  ContentView,
  Conversation,
  CoverStory,
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

interface V2exMember {
  id?: number;
  username?: string;
  avatar_normal?: string;
  avatar_large?: string;
}

interface V2exNode {
  name?: string;
  title?: string;
}

interface V2exTopic {
  id: number;
  title?: string;
  content?: string;
  content_rendered?: string;
  replies?: number;
  created?: number;
  last_touched?: number;
  last_modified?: number;
  deleted?: number;
  member?: V2exMember;
  node?: V2exNode;
}

interface V2exReply {
  id: number;
  content?: string;
  content_rendered?: string;
  created?: number;
  member?: V2exMember;
  thanks?: number;
}

function toMs(value?: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number < 1e12 ? number * 1000 : number;
}

function memberName(member?: V2exMember): string {
  return String(member?.username || "匿名用户");
}

function avatarUrl(member?: V2exMember): string {
  return String(member?.avatar_normal || member?.avatar_large || "");
}

function topicTitle(topic: V2exTopic): string {
  return String(topic.title || `#${topic.id}`).trim();
}

function nodeLabel(topic: V2exTopic): string {
  return String(topic.node?.title || topic.node?.name || "").trim();
}

const HTML_MARKER =
  /<(p|br|a|img|strong|b|em|i|u|s|del|ins|code|pre|blockquote|ul|ol|li|h[1-6]|span|div|table|thead|tbody|tr|td|th|hr|figure|figcaption|video|audio|source|iframe)\b[^>]*>/i;

function renderContent(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (HTML_MARKER.test(raw)) return sanitizeCooked(raw);
  return `<p>${escapeHtml(raw).replace(/\r?\n/g, "<br>")}</p>`;
}

export function buildPostHtml(
  member: V2exMember | undefined,
  content: string | undefined,
  created: number | undefined,
  floor: string,
  thanks = 0,
): string {
  const name = memberName(member);
  const avatar = avatarUrl(member);
  const avatarHtml = avatar
    ? `<img class="fs-post-avatar" src="${escapeAttr(avatar)}" alt="" loading="lazy">`
    : `<span class="fs-post-avatar fs-post-avatar-letter">${escapeHtml(firstChar(name))}</span>`;
  const thanksHtml = thanks > 0 ? `<span class="fs-post-floor">· 感谢 ${thanks}</span>` : "";
  return `<section class="fs-post">
    <header class="fs-post-head">
      ${avatarHtml}
      <span class="fs-post-name">${escapeHtml(name)}</span>
      <span class="fs-post-floor">${escapeHtml(floor)}</span>
      ${thanksHtml}
      <span class="fs-post-time">${escapeHtml(timeAgo(toMs(created)))}</span>
    </header>
    <div class="fs-post-body">${renderContent(content)}</div>
  </section>`;
}

export function latestToConversations(data: unknown): Conversation[] {
  const topics = Array.isArray(data) ? (data as V2exTopic[]) : [];
  return topics
    .filter((topic) => topic && !topic.deleted)
    .map((topic) => {
      const replies = Math.max(0, Number(topic.replies) || 0);
      const node = nodeLabel(topic);
      const subtitle = [`${replies} 回复`, node].filter(Boolean).join(" · ");
      return {
        id: String(topic.id),
        title: topicTitle(topic),
        subtitle,
        avatar: avatarUrl(topic.member),
        updatedAt: toMs(topic.last_touched || topic.created || topic.last_modified),
      };
    });
}

export function parseTopic(topic: V2exTopic, replies: V2exReply[]): ContentView {
  const title = topicTitle(topic);
  const list = (Array.isArray(replies) ? replies : [])
    .slice()
    .sort((a, b) => (Number(a.created) || 0) - (Number(b.created) || 0));
  const replyCount = Math.max(Number(topic.replies) || 0, list.length);
  const node = nodeLabel(topic);
  const meta = [`${replyCount} 回复`, node, timeAgo(toMs(topic.created))].filter(Boolean).join(" · ");

  const html =
    `<h1 class="fs-topic-title">${escapeHtml(title)}</h1>` +
    `<div class="fs-topic-meta">${escapeHtml(meta)}</div>` +
    buildPostHtml(
      topic.member,
      topic.content_rendered || topic.content,
      topic.created,
      "楼主",
    ) +
    list
      .map((reply, index) =>
        buildPostHtml(
          reply.member,
          reply.content_rendered || reply.content,
          reply.created,
          `#${index + 1}`,
          Number(reply.thanks) || 0,
        ),
      )
      .join("");

  return {
    title,
    subtitle: meta,
    html,
    hasMore: false,
  };
}

export function topicIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/t\/(\d+)(?:\/|$)/);
  return match ? match[1] : null;
}

export function nodeNameFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/go\/([^/]+?)(?:\/|$)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function listApiPath(pathname: string): string {
  const node = nodeNameFromPath(pathname);
  if (node) return `/api/topics/show.json?node_name=${encodeURIComponent(node)}`;
  return "/api/topics/latest.json";
}

function isSupportedPath(pathname: string): boolean {
  if (!pathname || pathname === "/") return true;
  return (
    /^\/recent(?:\/|$)/.test(pathname) ||
    /^\/t\/\d+(?:\/|$)/.test(pathname) ||
    /^\/go\/[^/]+(?:\/|$)/.test(pathname)
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { accept: "application/json, text/plain, */*" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as T & { error?: string; errors?: string[] };
  if (data && !Array.isArray(data) && (data.error || (Array.isArray(data.errors) && data.errors.length))) {
    throw new Error(data.error || data.errors?.join("；") || "接口返回错误");
  }
  return data;
}

const VIEW_CACHE_MS = 60_000;
const viewCache = new Map<string, { at: number; view: ContentView }>();

export function conversationIdFromUrl(url: URL): string | null {
  return topicIdFromPath(url.pathname);
}

export const v2exAdapter: SiteAdapter = {
  id: "v2ex",
  label: "V2EX",
  normalTitle: "微信",

  match(url: URL): boolean {
    return url.hostname === "v2ex.com" || url.hostname === "www.v2ex.com";
  },

  async detect(): Promise<SiteContext | null> {
    const url = new URL(location.href);
    if (!this.match(url) || !isSupportedPath(url.pathname)) return null;
    return {
      url: location.href,
      canonicalId:
        topicIdFromPath(url.pathname) || nodeNameFromPath(url.pathname) || "latest",
      title: document.title,
    };
  },

  initialConversationId(): string | null {
    return topicIdFromPath(new URL(location.href).pathname);
  },

  conversationIdFromUrl,

  async listConversations(): Promise<Conversation[]> {
    return latestToConversations(await fetchJson<unknown>(listApiPath(location.pathname)));
  },

  async openConversation(id: string): Promise<ContentView> {
    const cached = viewCache.get(id);
    if (cached && Date.now() - cached.at < VIEW_CACHE_MS) return cached.view;

    const topics = await fetchJson<V2exTopic[]>(`/api/topics/show.json?id=${encodeURIComponent(id)}`);
    const replies = await fetchJson<V2exReply[]>(
      `/api/replies/show.json?topic_id=${encodeURIComponent(id)}`,
    );
    const topic = Array.isArray(topics) ? topics[0] : null;
    if (!topic) throw new Error("主题不存在或已删除");
    if (topic.deleted) throw new Error("主题已被删除");
    const view = parseTopic(topic, Array.isArray(replies) ? replies : []);
    viewCache.set(id, { at: Date.now(), view });
    return view;
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
          { name: "sanitize.ts", type: "file" },
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
      { name: "migrate.sql", type: "file", status: "D" },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "README.md", type: "file", status: "U" },
];

export const v2exCoverStory: CoverStory = {
  workspace: "content-service",
  branch: "main",
  branches: ["main", "develop", "release/2026.11"],
  footer: "Node 22 · pnpm · main",
  fakeDocName: "content-spec.pdf",
  tabTitle: "content-spec.pdf · 工作目录",
  tree,
};