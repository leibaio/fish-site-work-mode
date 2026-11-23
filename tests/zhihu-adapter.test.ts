import { describe, expect, it } from "vitest";
import {
  answerIdFromUrl,
  answerView,
  feedView,
  parseAnswerList,
  parseFeedList,
  questionIdFromUrl,
  questionView,
} from "../packages/adapters/zhihu/src/adapter";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const answerHtml = `<!doctype html><html><head><title>测试问题 - 知乎</title></head><body>
  <div class="QuestionHeader">
    <h1 class="QuestionHeader-title">测试问题？</h1>
    <div class="QuestionRichText">问题描述内容</div>
  </div>
  <div class="AnswerItem" data-zop='{"type":"answer","itemId":"111"}'>
    <div class="AuthorInfo-content">
      <div class="AuthorInfo-avatar"><img src="//pic1.zhimg.com/a.jpg"></div>
      <span class="AuthorInfo-name">作者A</span>
    </div>
    <div class="RichText ztext"><p>回答一 <img data-original="//pic2.zhimg.com/x.jpg" src="data:image/svg+xml,abc"><script>alert(1)</script><div id="fs-ball" class="fs-app">bad</div></p></div>
    <button class="VoteButton VoteButton--up">1.2 万 赞同</button>
    <div class="ContentItem-time">发布于 2026-11-20 10:00</div>
  </div>
  <div class="AnswerItem" data-zop='{"type":"answer","itemId":"222"}'>
    <div class="AuthorInfo-content">
      <div class="AuthorInfo-avatar"><img src="//pic1.zhimg.com/b.jpg"></div>
      <span class="AuthorInfo-name">作者B</span>
    </div>
    <div class="RichText ztext"><p>回答二</p></div>
    <button class="VoteButton VoteButton--up">赞同</button>
    <div class="ContentItem-time">编辑于 2026-11-21 11:00</div>
  </div>
</body></html>`;

const feedHtml = `<!doctype html><html><head><title>知乎 - 有问题，就会有答案</title></head><body>
  <div class="TopstoryItem">
    <h2 class="ContentItem-title">推荐问题一</h2>
    <div class="AuthorInfo-name">推荐作者一</div>
    <img class="Avatar" src="//pic3.zhimg.com/a.jpg">
    <div class="RichText"><p>推荐摘要一</p></div>
    <div class="ContentItem-time">2026-11-21 09:00</div>
  </div>
  <div class="TopstoryItem">
    <h2 class="ContentItem-title">推荐问题二</h2>
    <div class="AuthorInfo-name">推荐作者二</div>
    <div class="RichText"><p>推荐摘要二</p></div>
    <div class="ContentItem-time">2026-11-22 09:00</div>
  </div>
</body></html>`;

describe("Zhihu adapter", () => {
  it("parses question and answer ids from urls", () => {
    expect(questionIdFromUrl(new URL("https://www.zhihu.com/question/123"))).toBe("123");
    expect(questionIdFromUrl(new URL("https://www.zhihu.com/question/123/answer/456"))).toBe("123");
    expect(answerIdFromUrl(new URL("https://www.zhihu.com/question/123/answer/456"))).toBe("456");
    expect(answerIdFromUrl(new URL("https://www.zhihu.com/question/123"))).toBeNull();
    expect(questionIdFromUrl(new URL("https://www.zhihu.com/"))).toBeNull();
  });

  it("lists answers from the live question document", () => {
    const doc = parse(answerHtml);
    const parsed = parseAnswerList(doc, "https://www.zhihu.com/question/1");

    expect(parsed.conversations).toHaveLength(2);
    expect(parsed.conversations[0].id).toBe("answer:111");
    expect(parsed.conversations[0].title).toBe("作者A");
    expect(parsed.conversations[0].subtitle).toContain("回答一");
    expect(parsed.conversations[0].avatar).toBe("https://pic1.zhimg.com/a.jpg");
    expect(parsed.conversations[0].updatedAt).toBeGreaterThan(0);
    expect(parsed.elements.get("answer:111")?.classList.contains("AnswerItem")).toBe(true);
  });

  it("builds an answer view with sanitized rich content", () => {
    const doc = parse(answerHtml);
    const element = doc.querySelector(".AnswerItem")!;
    const view = answerView(doc, element, "https://www.zhihu.com/question/1");

    expect(view.title).toBe("测试问题？");
    expect(view.html).toContain("作者A");
    expect(view.html).toContain("12000 赞同");
    expect(view.html).toContain("https://pic2.zhimg.com/x.jpg");
    expect(view.html).not.toContain("<script>");
    expect(view.html).not.toContain("fs-ball");
    expect(view.html).not.toContain("fs-app");
    expect(view.hasMore).toBe(false);
  });

  it("builds a question view with description and answers", () => {
    const doc = parse(answerHtml);
    const view = questionView(doc, "https://www.zhihu.com/question/1");

    expect(view.title).toBe("测试问题？");
    expect(view.subtitle).toBe("2 个回答");
    expect(view.html).toContain("问题描述内容");
    expect(view.html).toContain("作者A");
    expect(view.html).toContain("作者B");
    expect(view.html).toContain("回答 1");
    expect(view.html).toContain("回答 2");
  });

  it("lists and opens feed items", () => {
    const doc = parse(feedHtml);
    const parsed = parseFeedList(doc, "https://www.zhihu.com/");

    expect(parsed.conversations).toHaveLength(2);
    expect(parsed.conversations[0].id).toBe("feed:0");
    expect(parsed.conversations[0].title).toBe("推荐问题一");
    expect(parsed.conversations[0].subtitle).toContain("推荐作者一");
    expect(parsed.conversations[0].avatar).toBe("https://pic3.zhimg.com/a.jpg");

    const view = feedView(doc, parsed.elements.get("feed:0")!, "https://www.zhihu.com/");
    expect(view.title).toBe("推荐问题一");
    expect(view.html).toContain("推荐摘要一");
    expect(view.html).toContain("推荐作者一");
  });
});