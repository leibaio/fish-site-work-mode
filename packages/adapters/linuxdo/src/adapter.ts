import type {
  ContentView,
  Conversation,
  CoverStory,
  LoadMoreResult,
  SiteAdapter,
  SiteContext,
  WorkNode,
} from "../../../core/src/index";
import { escapeAttr, escapeHtml, firstChar, sanitizeCooked, timeAgo } from "../../../core/src/index";

interface DiscourseUser {
  id: number;
  username: string;
  name?: string;
  avatar_template?: string;
}

interface DiscourseTopic {
  id: number;
  title?: string;
  fancy_title?: string;
  posts_count?: number;
  views?: number;
  last_posted_at?: string;
  bumped_at?: string;
  created_at?: string;
  image_url?: string;
  category_id?: number;
  tags?: string[];
  unseen?: boolean;
  unread?: boolean;
  unread_posts?: number;
  posters?: Array<{ user_id: number }>;
}

interface DiscourseLatest {
  users?: DiscourseUser[];
  topic_list?: { topics?: DiscourseTopic[] };
}

interface DiscoursePost {
  id: number;
  username: string;
  name?: string;
  avatar_template?: string;
  created_at?: string;
  cooked?: string;
  post_number?: number;
  reply_to_post_number?: number | null;
}

interface DiscourseTopicDetail {
  id: number;
  title?: string;
  fancy_title?: string;
  posts_count?: number;
  views?: number;
  category_id?: number;
  tags?: string[];
  details?: {
    participants?: Array<{ username: string; name?: string; avatar_template?: string }>;
  };
  post_stream?: { posts?: DiscoursePost[]; stream?: number[] };
}

function absoluteUrl(value?: string): string {
  if (!value) return "";
  try {
    return new URL(value, location.origin).href;
  } catch {
    return "";
  }
}

function avatarUrl(template?: string, size = 96): string {
  if (!template) return "";
  const value = template.replace("{size}", String(size));
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return absoluteUrl(value);
}

function topicTitle(topic: DiscourseTopic): string {
  return String(topic.title || topic.fancy_title || `#${topic.id}`).trim();
}

function toTimestamp(value?: string): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function topicAvatar(topic: DiscourseTopic, users: Map<number, DiscourseUser>): string {
  if (topic.image_url) return absoluteUrl(topic.image_url);
  const posterId = topic.posters?.[0]?.user_id;
  const user = posterId ? users.get(posterId) : undefined;
  return avatarUrl(user?.avatar_template);
}

export function latestToConversations(data: DiscourseLatest): Conversation[] {
  const users = new Map<number, DiscourseUser>((data.users ?? []).map((user) => [user.id, user]));
  const topics = data.topic_list?.topics ?? [];
  return topics.map((topic) => {
    const replies = Math.max(0, Number(topic.posts_count || 1) - 1);
    const views = Number(topic.views);
    const parts = [`${replies} 回复`];
    if (Number.isFinite(views) && views > 0) parts.push(`${views} 浏览`);
    if (topic.tags && topic.tags.length) parts.push(topic.tags.map((tag) => `#${tag}`).join(" "));
    return {
      id: String(topic.id),
      title: topicTitle(topic),
      subtitle: parts.join(" · "),
      avatar: topicAvatar(topic, users),
      updatedAt: toTimestamp(topic.bumped_at || topic.last_posted_at || topic.created_at),
      unread: Boolean(topic.unseen || topic.unread || Number(topic.unread_posts || 0) > 0),
    };
  });
}

function postAvatar(post: DiscoursePost, participants: Map<string, string>): string {
  return avatarUrl(post.avatar_template) || participants.get(post.username) || "";
}

export function buildPostHtml(post: DiscoursePost, participants = new Map<string, string>()): string {
  const name = post.name || post.username || "匿名用户";
  const avatar = postAvatar(post, participants);
  const avatarHtml = avatar
    ? `<img class="fs-post-avatar" src="${escapeAttr(avatar)}" alt="" loading="lazy">`
    : `<span class="fs-post-avatar fs-post-avatar-letter">${escapeHtml(firstChar(name))}</span>`;
  const replyTo = post.reply_to_post_number
    ? `<span class="fs-post-floor">回复 #${escapeHtml(post.reply_to_post_number)}</span>`
    : "";
  return `<section class="fs-post">
    <header class="fs-post-head">
      ${avatarHtml}
      <span class="fs-post-name">${escapeHtml(name)}</span>
      <span class="fs-post-floor">#${escapeHtml(post.post_number ?? "")}</span>
      ${replyTo}
      <span class="fs-post-time">${escapeHtml(timeAgo(toTimestamp(post.created_at)))}</span>
    </header>
    <div class="fs-post-body">${sanitizeCooked(post.cooked || "")}</div>
  </section>`;
}

export function parseTopic(data: DiscourseTopicDetail): ContentView {
  const posts = (data.post_stream?.posts ?? []).slice().sort((a, b) => (a.post_number ?? 0) - (b.post_number ?? 0));
  const participants = new Map<string, string>(
    (data.details?.participants ?? []).map((participant) => [
      participant.username,
      avatarUrl(participant.avatar_template),
    ]),
  );
  const title = String(data.title || data.fancy_title || "未命名话题").trim();
  const replies = Math.max(0, Number(data.posts_count || 1) - 1);
  const views = Number(data.views);
  const meta = [`${replies} 回复`];
  if (Number.isFinite(views) && views > 0) meta.push(`${views} 浏览`);
  if (data.tags && data.tags.length) meta.push(data.tags.map((tag) => `#${tag}`).join(" "));

  const html =
    `<h1 class="fs-topic-title">${escapeHtml(title)}</h1>` +
    `<div class="fs-topic-meta">${escapeHtml(meta.join(" · "))}</div>` +
    posts.map((post) => buildPostHtml(post, participants)).join("");

  const stream = data.post_stream?.stream ?? [];
  const loaded = new Set(posts.map((post) => post.id));
  const remaining = stream.filter((id) => !loaded.has(id));

  return {
    title,
    subtitle: meta.join(" · "),
    html,
    hasMore: remaining.length > 0,
    cursor: remaining,
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { accept: "application/json, text/plain, */*" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as T & { error?: string; errors?: string[] };
  if (data && (data.error || (Array.isArray(data.errors) && data.errors.length))) {
    throw new Error(data.error || data.errors?.join("；") || "接口返回错误");
  }
  return data;
}

export function conversationIdFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "t") return null;
  const candidate = /^\d+$/.test(parts[1] || "") ? parts[1] : parts[2];
  return candidate && /^\d+$/.test(candidate) ? candidate : null;
}

function isSupportedPath(pathname: string): boolean {
  return !/^\/(login|signup|admin|u|my|search|badges|groups|about|faq|guidelines|tos|privacy)(\/|$)/i.test(
    pathname,
  );
}

export const linuxdoAdapter: SiteAdapter = {
  id: "linuxdo",
  label: "linux.do",
  normalTitle: "微信",

  match(url: URL): boolean {
    return url.hostname === "linux.do" || url.hostname.endsWith(".linux.do");
  },

  async detect(): Promise<SiteContext | null> {
    const url = new URL(location.href);
    if (!this.match(url) || !isSupportedPath(url.pathname)) return null;
    return {
      url: location.href,
      canonicalId: conversationIdFromUrl(url) || "latest",
      title: document.title,
    };
  },

  initialConversationId(): string | null {
    return conversationIdFromUrl(new URL(location.href));
  },

  conversationIdFromUrl,

  async listConversations(): Promise<Conversation[]> {
    const data = await fetchJson<DiscourseLatest>("/latest.json?page=1");
    return latestToConversations(data);
  },

  async openConversation(id: string): Promise<ContentView> {
    const data = await fetchJson<DiscourseTopicDetail>(`/t/${encodeURIComponent(id)}.json`);
    return parseTopic(data);
  },

  async loadMore(id: string, cursor: unknown): Promise<LoadMoreResult> {
    const ids = Array.isArray(cursor)
      ? cursor.map(Number).filter((value) => Number.isInteger(value) && value > 0)
      : [];
    const chunk = ids.slice(0, 20);
    if (!chunk.length) return { html: "", hasMore: false, cursor: [] };

    const params = new URLSearchParams();
    for (const postId of chunk) params.append("post_ids[]", String(postId));
    const data = await fetchJson<{ post_stream?: { posts?: DiscoursePost[] } }>(
      `/t/${encodeURIComponent(id)}/posts.json?${params.toString()}`,
    );
    const posts = (data.post_stream?.posts ?? [])
      .slice()
      .sort((a, b) => (a.post_number ?? 0) - (b.post_number ?? 0));
    const remaining = ids.slice(chunk.length);
    return {
      html: posts.map((post) => buildPostHtml(post)).join(""),
      hasMore: remaining.length > 0,
      cursor: remaining,
    };
  },

  createLogProvider(): null {
    return null;
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
          { name: "topics.go", type: "file", status: "M" },
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

export const linuxdoCoverStory: CoverStory = {
  workspace: "community-service",
  branch: "main",
  branches: ["main", "develop", "release/2026.11"],
  footer: "Go 1.23 · Docker · main",
  fakeDocName: "community-spec.pdf",
  tabTitle: "community-spec.pdf · 工作目录",
  tree,
};