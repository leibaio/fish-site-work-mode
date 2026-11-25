import { afterEach, describe, expect, it, vi } from "vitest";
import {
  doubanAdapter,
  galleryItemToConversation,
  galleryItemView,
  isGroupHome,
  parseGroupList,
  parseTopicPage,
  replyView,
  topicIdFromUrl,
  topicView,
} from "../packages/adapters/douban/src/adapter";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const groupHtml = `<!doctype html><html><body>
  <div class="topics">
    <div class="channel-item">
      <div class="likes">77<br>喜欢</div>
      <div class="bd">
        <h3><a href="https://www.douban.com/group/topic/506267390/?_spm_id=MjQ2MzA0OTY5">巴东柑橘小镇</a></h3>
        <div class="block"><div class="pic"><div class="pic-wrap"><img src="https://img9.doubanio.com/view/group_topic/small/public/p1.jpg"></div></div><p></p></div>
        <div class="source">
          <span class="from">来自<a href="https://www.douban.com/group/692275/">村庄爱好者小组</a></span>
          <span class="pubtime">今天10:53</span>
        </div>
      </div>
    </div>
    <div class="channel-item">
      <div class="likes">118<br>喜欢</div>
      <div class="bd">
        <h3><a href="https://www.douban.com/group/topic/506341158/">光在作画</a></h3>
        <div class="source">
          <span class="from">来自<a href="https://www.douban.com/group/699356/">无用美学小组</a></span>
          <span class="pubtime">昨天10:42</span>
        </div>
      </div>
    </div>
  </div>
</body></html>`;

const topicHtml = `<!doctype html><html><body>
  <div id="content">
    <h1>话题标题</h1>
    <div class="topic-doc">
      <div class="topic-author"><a href="/people/1/">楼主甲</a><img src="https://img1.doubanio.com/avatar/a.jpg"></div>
      <div class="topic-time">2026-11-20 10:00</div>
      <div class="topic-content"><div class="rich-content"><p>话题正文 <script>alert(1)</script><div id="fs-ball" class="fs-app">bad</div></p></div></div>
    </div>
    <div id="comments">
      <div class="comment-item" data-cid="111">
        <div class="comment-info"><a href="/people/2/">回复者A</a><span class="comment-time">2026-11-21 11:00</span></div>
        <div class="comment-content"><p>回复一</p><img src="https://img2.doubanio.com/reply/r.jpg"></div>
      </div>
      <div class="comment-item" data-cid="222">
        <div class="comment-info"><a href="/people/3/">回复者B</a><span class="comment-time">2026-11-22 12:00</span></div>
        <div class="comment-content">回复二</div>
      </div>
    </div>
  </div>
</body></html>`;

describe("Douban adapter", () => {
  it("parses group and topic urls", () => {
    expect(isGroupHome(new URL("https://www.douban.com/group/"))).toBe(true);
    expect(isGroupHome(new URL("https://www.douban.com/group"))).toBe(true);
    expect(topicIdFromUrl(new URL("https://www.douban.com/group/topic/506267390/"))).toBe("506267390");
    expect(topicIdFromUrl(new URL("https://www.douban.com/group/topic/506267390"))).toBe("506267390");
    expect(topicIdFromUrl(new URL("https://www.douban.com/group/"))).toBeNull();
  });

  it("maps group homepage cards to conversations", () => {
    const conversations = parseGroupList(parse(groupHtml), "https://www.douban.com/group/");

    expect(conversations).toHaveLength(2);
    expect(conversations[0].id).toBe("topic:506267390");
    expect(conversations[0].title).toBe("巴东柑橘小镇");
    expect(conversations[0].subtitle).toContain("村庄爱好者小组");
    expect(conversations[0].subtitle).toContain("77 喜欢");
    expect(conversations[0].avatar).toBe("https://img9.doubanio.com/view/group_topic/small/public/p1.jpg");
    expect(conversations[0].updatedAt).toBeGreaterThan(0);
  });

  it("parses a topic with the original post and replies", () => {
    const topic = parseTopicPage(
      parse(topicHtml),
      "https://www.douban.com/group/topic/506267390/",
      "506267390",
    );

    expect(topic.title).toBe("话题标题");
    expect(topic.author).toBe("楼主甲");
    expect(topic.avatar).toBe("https://img1.doubanio.com/avatar/a.jpg");
    expect(topic.bodyHtml).toContain("话题正文");
    expect(topic.bodyHtml).not.toContain("<script>");
    expect(topic.bodyHtml).not.toContain("fs-app");
    expect(topic.replies).toHaveLength(2);
    expect(topic.replies[0].id).toBe("reply:111");
    expect(topic.replies[0].author).toBe("回复者A");
    expect(topic.replies[0].content).toContain("回复一");
    expect(topic.replies[0].content).toContain("https://img2.doubanio.com/reply/r.jpg");
    expect(topic.replies[1].author).toBe("回复者B");

    const view = topicView(topic);
    expect(view.title).toBe("话题标题");
    expect(view.subtitle).toContain("2 回复");
    expect(view.html).toContain("楼主");
    expect(view.html).toContain("#1");
    expect(view.html).toContain("#2");

    const reply = replyView(topic, topic.replies[0]);
    expect(reply.title).toBe("话题标题");
    expect(reply.html).toContain("回复一");
    expect(reply.html).toContain("回复者A");
  });

  it("maps gallery hot items to conversations and views", () => {
    const item = {
      target_type: "topic",
      target: {
        title: "",
        abstract: "海住山寺，山城之秋。\n第二段",
        card_subtitle: "Amber 96赞 · 5回复",
        create_time: "2026-11-23 20:59:46",
        uri: "douban://douban.com/group/topic/506590885?_spm_id=abc",
        owner: {
          name: "Amber",
          avatar: "https://img9.doubanio.com/icon/a.jpg",
        },
        photos: [
          { large: { url: "https://img2.doubanio.com/view/group_topic/l/public/p1.jpg" } },
        ],
        gallery_topic: { name: "山中风景", uri: "douban://douban.com/gallery/topic/109780" },
      },
    };

    const conversation = galleryItemToConversation(
      item,
      0,
      "https://www.douban.com/gallery/",
    );
    expect(conversation?.id).toBe("gallery:506590885");
    expect(conversation?.title).toContain("海住山寺");
    expect(conversation?.subtitle).toContain("Amber");
    expect(conversation?.avatar).toBe("https://img9.doubanio.com/icon/a.jpg");

    const view = galleryItemView(item, "https://www.douban.com/gallery/");
    expect(view.title).toContain("海住山寺");
    expect(view.html).toContain("第二段");
    expect(view.html).toContain("https://img2.doubanio.com/view/group_topic/l/public/p1.jpg");
    expect(view.html).toContain("https://www.douban.com/group/topic/506590885");
    expect(view.html).toContain("打开原帖");
  });

  it("loads the gallery feed through the public rexxar api", async () => {
    window.history.replaceState({}, "", "/gallery/");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/rexxar/api/v2/gallery/hot_items");
      expect(url.searchParams.get("start")).toBe("0");
      expect(url.searchParams.get("count")).toBe("20");
      return new Response(
        JSON.stringify({
          start: 0,
          count: 20,
          total: 40,
          items: [
            {
              target_type: "topic",
              target: {
                abstract: "Gallery item",
                card_subtitle: "Amber 96赞",
                create_time: "2026-11-23 20:59:46",
                uri: "douban://douban.com/group/topic/506590885",
                owner: { name: "Amber" },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await doubanAdapter.listConversations();
    if (Array.isArray(page)) throw new Error("expected a conversation page");

    expect(page.conversations).toHaveLength(1);
    expect(page.conversations[0].id).toBe("gallery:506590885");
    expect(page.hasMore).toBe(true);
    expect(page.cursor).toEqual({ kind: "gallery", start: 1 });
  });
});