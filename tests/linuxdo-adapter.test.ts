import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPostHtml,
  conversationIdFromUrl,
  latestToConversations,
  linuxdoAdapter,
  parseTopic,
} from "../packages/adapters/linuxdo/src/adapter";

describe("linux.do adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("parses topic ids from topic urls", () => {
    expect(conversationIdFromUrl(new URL("https://linux.do/t/some-slug/123"))).toBe("123");
    expect(conversationIdFromUrl(new URL("https://linux.do/t/some-slug/123/4"))).toBe("123");
    expect(conversationIdFromUrl(new URL("https://linux.do/t/123"))).toBe("123");
    expect(conversationIdFromUrl(new URL("https://linux.do/latest"))).toBeNull();
  });

  it("maps the latest topic list to conversations", () => {
    const conversations = latestToConversations({
      users: [{ id: 7, username: "alice", avatar_template: "/user_avatar/linux.do/alice/{size}/1.png" }],
      topic_list: {
        topics: [
          {
            id: 42,
            title: "Welcome to linux.do",
            posts_count: 6,
            views: 1200,
            bumped_at: "2026-11-20T08:00:00.000Z",
            image_url: "/uploads/default/original/1X/thumb.png",
            tags: ["news"],
            unread_posts: 2,
            posters: [{ user_id: 7 }],
          },
        ],
      },
    });

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe("42");
    expect(conversations[0].title).toBe("Welcome to linux.do");
    expect(conversations[0].subtitle).toContain("5 回复");
    expect(conversations[0].subtitle).toContain("1200 浏览");
    expect(conversations[0].unread).toBe(true);
    expect(conversations[0].avatar).toContain("/uploads/default/original/1X/thumb.png");
  });

  it("parses a topic and keeps a cursor for more posts", () => {
    const view = parseTopic({
      id: 42,
      title: "Welcome to linux.do",
      posts_count: 3,
      views: 10,
      tags: ["news"],
      details: {
        participants: [{ username: "alice", avatar_template: "/avatar/{size}.png" }],
      },
      post_stream: {
        posts: [
          {
            id: 1,
            username: "alice",
            name: "Alice",
            created_at: "2026-11-20T07:00:00.000Z",
            cooked: "<p>Hello <strong>world</strong></p>",
            post_number: 1,
          },
          {
            id: 2,
            username: "bob",
            cooked: "<p>Second post</p>",
            post_number: 2,
          },
        ],
        stream: [1, 2, 3],
      },
    });

    expect(view.title).toBe("Welcome to linux.do");
    expect(view.subtitle).toContain("2 回复");
    expect(view.html).toContain("Hello <strong>world</strong>");
    expect(view.html).toContain("Second post");
    expect(view.hasMore).toBe(true);
    expect(view.cursor).toEqual([3]);
  });

  it("builds a post with a letter avatar fallback", () => {
    const html = buildPostHtml({
      id: 1,
      username: "alice",
      name: "Alice",
      cooked: "<p>Hello</p>",
      post_number: 1,
    });
    expect(html).toContain("fs-post");
    expect(html).toContain("Alice");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("fs-post-avatar");
  });

  it("loads the next post ids and keeps the remaining cursor", async () => {
    const ids = Array.from({ length: 21 }, (_, index) => index + 3);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://linux.do");
      expect(url.pathname).toBe("/t/42/posts.json");
      expect(url.searchParams.getAll("post_ids[]")).toEqual(ids.slice(0, 20).map(String));
      return new Response(
        JSON.stringify({
          post_stream: {
            posts: [{ id: 3, username: "carol", name: "Carol", cooked: "<p>Third</p>", post_number: 3 }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await linuxdoAdapter.loadMore!("42", ids);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.html).toContain("Third");
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toEqual([23]);
  });
});