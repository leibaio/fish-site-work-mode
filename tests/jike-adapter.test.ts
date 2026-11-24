import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiPostView,
  isJikeProfile,
  isJikeTopic,
  jikeAdapter,
  jikeView,
  parseJikeList,
  postIdFromUrl,
} from "../packages/adapters/jike/src/adapter";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const feedHtml = `<!doctype html><html><body>
  <div class="_post_abc">
    <a href="/u/alice"><img class="jk-avatar _avatar_x" src="https://cdnv2.ruguoapp.com/a.jpg"></a>
    <a class="_screenName_x" href="/u/alice">Alice</a>
    <time datetime="2026-11-24T10:00:00.000Z">11-24</time>
    <div class="_content_x"><p>第一条即刻 <script>alert(1)</script><div id="fs-ball" class="fs-app">bad</div></p><img src="https://cdnv2.ruguoapp.com/pic.jpg" width="800" height="600"></div>
    <a href="/originalPost/abc123">打开</a>
  </div>
  <div class="_postCard_def">
    <a href="/u/bob"><img class="jk-avatar _avatar_x" src="https://cdnv2.ruguoapp.com/b.jpg"></a>
    <a class="_screenName_x" href="/u/bob">Bob</a>
    <time datetime="2026-11-24T09:00:00.000Z">11-24</time>
    <div class="_content_x"><p>第二条即刻</p></div>
    <a href="/u/bob/post/def456">打开</a>
  </div>
</body></html>`;

describe("Jike adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("parses post, profile and topic urls", () => {
    expect(postIdFromUrl(new URL("https://web.okjike.com/originalPost/abc123"))).toBe("abc123");
    expect(postIdFromUrl(new URL("https://web.okjike.com/originalPosts/abc123"))).toBe("abc123");
    expect(postIdFromUrl(new URL("https://web.okjike.com/u/alice/post/def456"))).toBe("def456");
    expect(postIdFromUrl(new URL("https://web.okjike.com/u/alice"))).toBeNull();
    expect(isJikeProfile(new URL("https://web.okjike.com/u/alice"))).toBe(true);
    expect(isJikeTopic(new URL("https://web.okjike.com/topic/123"))).toBe(true);
  });

  it("maps visible post cards to conversations", () => {
    const parsed = parseJikeList(parse(feedHtml), "https://web.okjike.com/");

    expect(parsed.conversations).toHaveLength(2);
    expect(parsed.conversations[0].id).toBe("post:abc123");
    expect(parsed.conversations[0].title).toBe("Alice");
    expect(parsed.conversations[0].subtitle).toContain("第一条即刻");
    expect(parsed.conversations[0].avatar).toBe("https://cdnv2.ruguoapp.com/a.jpg");
    expect(parsed.conversations[0].updatedAt).toBe(Date.parse("2026-11-24T10:00:00.000Z"));
    expect(parsed.conversations[1].id).toBe("post:def456");
    expect(parsed.elements.get("post:abc123")?.classList.contains("_post_abc")).toBe(true);
  });

  it("builds a post view with sanitized content and image", () => {
    const doc = parse(feedHtml);
    const parsed = parseJikeList(doc, "https://web.okjike.com/");
    const card = parsed.elements.get("post:abc123")!;
    const view = jikeView(card, "https://web.okjike.com/");

    expect(view.title).toBe("Alice");
    expect(view.html).toContain("第一条即刻");
    expect(view.html).toContain("https://cdnv2.ruguoapp.com/pic.jpg");
    expect(view.html).not.toContain("<script>");
    expect(view.html).not.toContain("fs-app");
    expect(view.hasMore).toBe(false);
  });

  it("uses the url post id for the first card on a detail page", () => {
    const doc = parse(`<div class="_postCard_x">
      <a class="_screenName_x">Alice</a>
      <div class="_content_x">详情页动态</div>
    </div>`);
    const parsed = parseJikeList(doc, "https://web.okjike.com/originalPost/xyz789", "xyz789");
    expect(parsed.conversations[0].id).toBe("post:xyz789");
  });

  it("falls back to time-anchored cards when class names change", () => {
    const doc = parse(`<div class="unknown-card">
      <a href="/u/carol"><img src="https://cdnv2.ruguoapp.com/c.jpg"></a>
      <a href="/u/carol">Carol</a>
      <time datetime="2026-11-24T08:00:00.000Z">11-24</time>
      <div class="body">这是一条没有预期 class 的即刻正文</div>
    </div>`);
    const parsed = parseJikeList(doc, "https://web.okjike.com/");

    expect(parsed.conversations).toHaveLength(1);
    expect(parsed.conversations[0].title).toBe("Carol");
    expect(parsed.conversations[0].subtitle).toContain("没有预期");
  });

  it("loads the recommend feed through the page auth token", async () => {
    localStorage.setItem("JK_ACCESS_TOKEN", "token-123");
    localStorage.setItem("JK_DEVICE_ID", "device-456");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/1.0/recommendFeed/list");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as { limit: number };
      expect(body.limit).toBe(20);
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-jike-access-token"]).toBe("token-123");
      expect(headers["x-jike-device-id"]).toBe("device-456");
      expect(headers.platform).toBe("web");
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "p1",
              content: "推荐内容",
              createdAt: "2026-11-24T10:00:00.000Z",
              user: {
                screenName: "Alice",
                avatarImage: { thumbnailUrl: "https://cdnv2.ruguoapp.com/a.jpg" },
              },
              pictures: [{ picUrl: "https://cdnv2.ruguoapp.com/p.jpg" }],
            },
          ],
          loadMoreKey: "next-key",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await jikeAdapter.listConversations();
    if (Array.isArray(page)) throw new Error("expected a conversation page");

    expect(page.conversations).toHaveLength(1);
    expect(page.conversations[0].id).toBe("post:p1");
    expect(page.conversations[0].title).toBe("Alice");
    expect(page.conversations[0].subtitle).toContain("推荐内容");
    expect(page.hasMore).toBe(true);
    expect(page.cursor).toEqual({
      kind: "feed",
      path: "/1.0/recommendFeed/list",
      loadMoreKey: "next-key",
    });
  });

  it("searches through the integrate endpoint", async () => {
    localStorage.setItem("JK_ACCESS_TOKEN", "token-123");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/1.0/search/integrate");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as { keywords: string };
      expect(body.keywords).toBe("hello");
      return new Response(
        JSON.stringify({
          data: [
            {
              type: "ORIGINAL_POST",
              id: "p2",
              content: "搜索结果内容",
              createdAt: "2026-11-24T09:00:00.000Z",
              user: { screenName: "Bob" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await jikeAdapter.searchConversations!("hello");

    expect(page.conversations).toHaveLength(1);
    expect(page.conversations[0].id).toBe("post:p2");
    expect(page.conversations[0].title).toBe("Bob");
    expect(page.hasMore).toBe(false);
  });

  it("loads more recommend posts with the cursor", async () => {
    localStorage.setItem("JK_ACCESS_TOKEN", "token-123");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/1.0/recommendFeed/list");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as { loadMoreKey: string };
      expect(body.loadMoreKey).toBe("next-key");
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "p3",
              content: "更多内容",
              user: { screenName: "Carol" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await jikeAdapter.loadMoreConversations!({
      kind: "feed",
      path: "/1.0/recommendFeed/list",
      loadMoreKey: "next-key",
    });

    expect(page.conversations[0].id).toBe("post:p3");
    expect(page.hasMore).toBe(false);
  });

  it("renders an api post with pictures and a repost", () => {
    const view = apiPostView(
      {
        id: "p4",
        content: "我的转发评论",
        createdAt: "2026-11-24T08:00:00.000Z",
        user: { screenName: "Dave" },
        pictures: [{ picUrl: "https://cdnv2.ruguoapp.com/d.jpg" }],
        target: {
          content: "被转发的原文",
          pictures: [{ picUrl: "https://cdnv2.ruguoapp.com/t.jpg" }],
        },
      },
      "https://web.okjike.com/",
    );

    expect(view.title).toBe("Dave");
    expect(view.html).toContain("我的转发评论");
    expect(view.html).toContain("被转发的原文");
    expect(view.html).toContain("https://cdnv2.ruguoapp.com/d.jpg");
    expect(view.html).toContain("https://cdnv2.ruguoapp.com/t.jpg");
    expect(view.html).toContain("fs-quote");
  });
});