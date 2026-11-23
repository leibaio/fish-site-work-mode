import { describe, expect, it } from "vitest";
import {
  parseWeiboList,
  statusMidFromUrl,
  weiboView,
} from "../packages/adapters/weibo/src/adapter";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const feedHtml = `<!doctype html><html><head><title>微博</title></head><body>
  <article mid="5000000000000001" class="Feed_wrap_x">
    <div class="avatar"><img src="//tvax1.sinaimg.cn/avatar1.jpg"></div>
    <a href="//weibo.com/u/123">作者甲</a>
    <div class="detail_wbtext_x"><p>微博正文一 <a href="//weibo.com/u/456">@某人</a><script>alert(1)</script><div id="fs-ball" class="fs-app">bad</div></p></div>
    <div class="picture"><img src="//wx1.sinaimg.cn/pic1.jpg"></div>
    <span class="time">11-23 10:00</span>
  </article>
  <article mid="5000000000000002" class="Feed_wrap_x">
    <div class="avatar"><img src="//tvax1.sinaimg.cn/avatar2.jpg"></div>
    <a href="//weibo.com/u/789">作者乙</a>
    <div class="detail_wbtext_x"><p>微博正文二</p></div>
    <span class="time">11-23 11:00</span>
  </article>
</body></html>`;

describe("Weibo adapter", () => {
  it("parses status mids from urls", () => {
    expect(statusMidFromUrl(new URL("https://weibo.com/1234567890/Nabc123"))).toBe("Nabc123");
    expect(statusMidFromUrl(new URL("https://weibo.com/1234567890"))).toBeNull();
    expect(statusMidFromUrl(new URL("https://weibo.com/"))).toBeNull();
  });

  it("maps visible feed cards to conversations", () => {
    const doc = parse(feedHtml);
    const parsed = parseWeiboList(doc, "https://weibo.com/");

    expect(parsed.conversations).toHaveLength(2);
    expect(parsed.conversations[0].id).toBe("5000000000000001");
    expect(parsed.conversations[0].title).toBe("作者甲");
    expect(parsed.conversations[0].subtitle).toContain("微博正文一");
    expect(parsed.conversations[0].avatar).toBe("https://tvax1.sinaimg.cn/avatar1.jpg");
    expect(parsed.conversations[0].updatedAt).toBe(new Date(2026, 10, 23, 10, 0).getTime());
    expect(parsed.elements.get("5000000000000001")?.tagName).toBe("ARTICLE");
  });

  it("builds a status view with text, image and sanitized content", () => {
    const doc = parse(feedHtml);
    const parsed = parseWeiboList(doc, "https://weibo.com/");
    const card = parsed.elements.get("5000000000000001")!;
    const view = weiboView(card, "https://weibo.com/");

    expect(view.title).toBe("作者甲");
    expect(view.html).toContain("微博正文一");
    expect(view.html).toContain("https://wx1.sinaimg.cn/pic1.jpg");
    expect((view.html.match(/avatar1\.jpg/g) || []).length).toBe(1);
    expect(view.html).not.toContain("<script>");
    expect(view.html).not.toContain("fs-app");
    expect(view.hasMore).toBe(false);
  });

  it("handles a simple text-only status", () => {
    const doc = parse(feedHtml);
    const parsed = parseWeiboList(doc, "https://weibo.com/");
    const card = parsed.elements.get("5000000000000002")!;
    const view = weiboView(card, "https://weibo.com/");

    expect(view.title).toBe("作者乙");
    expect(view.html).toContain("微博正文二");
    expect(view.html).toContain("作者乙");
  });
});