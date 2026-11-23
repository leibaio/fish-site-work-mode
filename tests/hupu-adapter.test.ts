import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hupuAdapter,
  parseThreadList,
  parseThreadView,
  threadIdFromUrl,
  threadPageFromUrl,
} from "../packages/adapters/hupu/src/adapter";

const listHtml = `<!doctype html><html><body>
<div class="bbs-sl-web-post">
  <ul>
    <li class="bbs-sl-web-post-body">
      <div class="bbs-sl-web-post-layout">
        <div class="post-title"><a href="/643996231.html" class="p-title">这个英歌舞太帅了</a></div>
        <div class="post-datum">229 / 128234</div>
        <div class="post-auth"><a href="https://my.hupu.com/1">不要无脑喷</a></div>
        <div class="post-time">2026-11-23 10:09</div>
      </div>
    </li>
    <li class="bbs-sl-web-post-body">
      <div class="bbs-sl-web-post-layout">
        <div class="post-title"><a href="/644148332.html" class="p-title">学习来说，天赋真的碾压努力</a></div>
        <div class="post-datum">10 / 1128</div>
        <div class="post-auth"><a href="https://my.hupu.com/2">侧卧运河</a></div>
        <div class="post-time">11-23 10:07</div>
      </div>
    </li>
  </ul>
</div>
</body></html>`;

function mainPost(content: string): string {
  return `<div class="post-content_bbs-post-content__cy7vN">
    <div class="post-user_post-user-comp__3azJ2">
      <a class="post-user_post-user-comp-avatar-wrapper__Dg3nG"><img src="https://w1.hoopchina.com.cn/avatar/main.jpg" /></a>
      <div class="post-user_post-user-comp-info-top__GqgwV">
        <a class="post-user_post-user-comp-info-top-name__N3D4w">不要无脑喷</a>
        <span class="post-user_post-user-comp-info-top-time__k9K2U">2026-11-17 10:14:21</span>
      </div>
    </div>
    <div class="post-content_main-post-info__qCbZu">
      <div class="index_bbs-thread-comp__PC7_r bbs-thread-comp main-thread">
        ${content}
        <div class="seo-dom"><p>正文</p></div>
      </div>
    </div>
  </div>`;
}

function replyBlock(
  author: string,
  time: string,
  text: string,
  options: { quote?: string; avatar?: string; id?: number } = {},
): string {
  const avatar = options.avatar || "https://w1.hoopchina.com.cn/games/images/def_man.png";
  const quote = options.quote
    ? `<div class="index_bbs-thread-comp__PC7_r bbs-thread-comp quote-thread">
        <div class="index_quote-text__HggrH"><span>引用</span></div>
        <div class="index_simple-detail-content__3FPFA"><p>${options.quote}</p></div>
      </div>`
    : "";
  return `<div class="post-reply-list-container" data-id="${options.id || 1}">
    <div class="reply-list-avatar"><img src="${avatar}" /></div>
    <div class="reply-list-content">
      <div class="post-reply-list-user-info-top-name">${author}</div>
      <div class="post-reply-list-user-info-top-time">${time}</div>
      <div class="post-reply-list-content">
        <div class="reply-list-wrapper">
          ${quote}
          <div class="m-c"><div class="index_bbs-thread-comp__PC7_r bbs-thread-comp main-thread">
            <div class="thread-content-detail"><p>${text}</p></div>
            <div class="seo-dom"><p>${text}</p></div>
          </div></div>
        </div>
      </div>
    </div>
  </div>`;
}

function threadHtml(): string {
  return `<!doctype html><html><head><title>这个英歌舞太帅了-步行街主干道-虎扑社区</title></head><body>
    <section class="index_hp-pc-breadcrumb___Sojb">
      <span><a href="/">社区</a></span>
      <span><a href="/all-gambia">步行街</a></span>
      <span><a href="/topic-daily">步行街主干道</a></span>
      <span><a href="/643996231.html">这个英歌舞太帅了</a></span>
    </section>
    <div class="index_bbs-post-web-main-title__MJTN5">
      <div class="index_bbs-post-web-main-title-provider__uHAn9">
        <h1 class="index_name__M5qqs">这个英歌舞太帅了</h1>
        <span>231回复</span><span>/ 50亮</span><span>128321 浏览</span>
      </div>
    </div>
    <ul class="hupu-rc-pagination">
      <li class="hupu-rc-pagination-item hupu-rc-pagination-item-1 hupu-rc-pagination-item-active"><a href="643996231.html">1</a></li>
      <li class="hupu-rc-pagination-item hupu-rc-pagination-item-2"><a href="643996231-2.html">2</a></li>
      <li class="hupu-rc-pagination-item hupu-rc-pagination-item-12"><a href="643996231-12.html">12</a></li>
    </ul>
    ${mainPost('<div><video src="https://v.hoopchina.com.cn/a.mp4" poster="https://i.hoopchina.com.cn/a.jpg" controls></video></div><div class="thread-content-detail"><p>正文</p></div>')}
    <div class="post-wrapper_light__fi4Jz">
      ${replyBlock("亮点用户", "2026-11-17 12:00:00", "这是亮评")}
    </div>
    <div class="post-reply-list">
      ${replyBlock("孤竹星Q", "2026-11-17 15:27:07", '回复一<img src="https://w1.hoopchina.com.cn/img/a.png" /><script>alert(1)</script><div id="fs-ball" class="fs-app">bad</div>', { quote: "被引用内容", id: 1 })}
      ${replyBlock("另一个JR", "2026-11-17 15:30:00", "回复二", { avatar: "https://w1.hoopchina.com.cn/avatar/user.jpg", id: 2 })}
    </div>
  </body></html>`;
}

function pageTwoHtml(): string {
  return `<!doctype html><html><body>
    <ul class="hupu-rc-pagination">
      <li class="hupu-rc-pagination-item hupu-rc-pagination-item-1"><a href="643996231.html">1</a></li>
      <li class="hupu-rc-pagination-item hupu-rc-pagination-item-2 hupu-rc-pagination-item-active"><a href="643996231-2.html">2</a></li>
      <li class="hupu-rc-pagination-item hupu-rc-pagination-item-12"><a href="643996231-12.html">12</a></li>
    </ul>
    <div class="post-reply-list">
      ${replyBlock("第三页用户", "2026-11-17 16:00:00", "第二页内容", { id: 3 })}
    </div>
  </body></html>`;
}

describe("Hupu adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses thread ids and page numbers", () => {
    expect(threadIdFromUrl(new URL("https://bbs.hupu.com/643996231.html"))).toBe("643996231");
    expect(threadIdFromUrl(new URL("https://bbs.hupu.com/643996231-2.html"))).toBe("643996231");
    expect(threadIdFromUrl(new URL("https://bbs.hupu.com/bxj"))).toBeNull();
    expect(threadPageFromUrl(new URL("https://bbs.hupu.com/643996231.html"))).toBe(1);
    expect(threadPageFromUrl(new URL("https://bbs.hupu.com/643996231-2.html"))).toBe(2);
  });

  it("maps forum rows to conversations", () => {
    const conversations = parseThreadList(listHtml);

    expect(conversations).toHaveLength(2);
    expect(conversations[0].id).toBe("643996231");
    expect(conversations[0].title).toBe("这个英歌舞太帅了");
    expect(conversations[0].subtitle).toBe("不要无脑喷 · 229 回复 · 128234 浏览");
    expect(conversations[0].avatarFallback).toBe("不要无脑喷");
    expect(conversations[0].updatedAt).toBe(new Date(2026, 10, 23, 10, 9).getTime());
    expect(conversations[1].updatedAt).toBeGreaterThan(0);
  });

  it("parses a thread, filters highlight replies and keeps video", () => {
    const view = parseThreadView(threadHtml(), "https://bbs.hupu.com/643996231.html");

    expect(view.title).toBe("这个英歌舞太帅了");
    expect(view.subtitle).toBe("231 回复 · 128321 浏览 · 50 亮 · 第 1/12 页");
    expect(view.html).toContain("楼主");
    expect(view.html).toContain("不要无脑喷");
    expect(view.html).toContain("<video");
    expect(view.html).toContain("https://v.hoopchina.com.cn/a.mp4");
    expect(view.html).toContain("https://i.hoopchina.com.cn/a.jpg");
    expect(view.html).not.toContain("亮点用户");
    expect(view.html).toContain("孤竹星Q");
    expect(view.html).toContain("另一个JR");
    expect(view.html).toContain("#1");
    expect(view.html).toContain("#2");
    expect(view.html).toContain("被引用内容");
    expect(view.html).toContain("https://w1.hoopchina.com.cn/avatar/user.jpg");
    expect(view.html).toContain("https://w1.hoopchina.com.cn/img/a.png");
    expect(view.html).not.toContain("<script>");
    expect(view.html).not.toContain("fs-ball");
    expect(view.html).not.toContain("fs-app");
    expect(view.html.split("正文").length - 1).toBe(1);
    expect(view.hasMore).toBe(true);
    expect(view.cursor).toEqual({ page: 1, total: 12, offset: 2 });
  });

  it("loads the next page and continues the floor numbers", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://bbs.hupu.com");
      expect(url.pathname).toBe("/643996231-2.html");
      return new Response(pageTwoHtml(), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await hupuAdapter.loadMore!("643996231", {
      page: 1,
      total: 12,
      offset: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.html).toContain("第二页内容");
    expect(result.html).toContain("#3");
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toEqual({ page: 2, total: 12, offset: 3 });
  });
});