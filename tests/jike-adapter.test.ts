import { describe, expect, it } from "vitest";
import {
  isJikeProfile,
  isJikeTopic,
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
});