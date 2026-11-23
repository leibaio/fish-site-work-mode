import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chiphellAdapter,
  forumIdFromUrl,
  parseThreadList,
  parseThreadView,
  threadIdFromUrl,
} from "../packages/adapters/chiphell/src/adapter";

const threadListHtml = `<!doctype html><html><body>
<table id="threadlisttableid">
  <tbody id="normalthread_2920766">
    <tr>
      <td class="icn"><a href="thread-2920766-1-1.html" title="thread"></a></td>
      <th class="new">
        <em>[<a href="forum.php?mod=forumdisplay&fid=146&filter=typeid&typeid=996">装机</a>]</em>
        <a href="thread-2920766-1-1.html" class="s xst">在北方冬天户外放一台电脑，天天用，有可能吗?</a>
      </th>
      <td class="by"><cite><a href="space-uid-380270.html">ris</a></cite><em><span class="xi1">2026-11-23 09:31</span></em></td>
      <td class="num"><a href="thread-2920766-1-1.html" class="xi2">3</a><em>67</em></td>
      <td class="by"><cite><a href="space-uid-1.html">lizzak</a></cite><em><a href="thread-2920766-1-1.html">2026-11-23 09:45</a></em></td>
    </tr>
  </tbody>
  <tbody id="stickthread_1">
    <tr>
      <td class="icn"></td>
      <th class="new"><a href="thread-1-1-1.html" class="s xst">版规与置顶</a></th>
      <td class="by"><cite><a>版主</a></cite><em>2026-11-20 08:00</em></td>
      <td class="num"><a class="xi2">0</a><em>999</em></td>
      <td class="by"><cite><a>版主</a></cite><em>2026-11-20 08:00</em></td>
    </tr>
  </tbody>
  <tbody id="normalthread_bad">
    <tr><th class="new"></th></tr>
  </tbody>
</table>
</body></html>`;

function postBlock(
  pid: number,
  author: string,
  floor: number,
  time: string,
  content: string,
  avatar = "./data/avatar/ris.jpg",
): string {
  return `<div id="post_${pid}">
    <table id="pid${pid}" class="plhin">
      <tr>
        <td class="pls">
          <div class="favatar">
            <div class="authi"><a href="space-uid-1.html" class="xw1">${author}</a></div>
            <div class="avatar"><a><img src="${avatar}" class="user_avatar"></a></div>
          </div>
        </td>
        <td class="plc">
          <div class="pi">
            <strong><a id="postnum${pid}" href="thread-2920306-1-1.html"><em>${floor}</em><sup>#</sup></a></strong>
            <div class="authi"><em id="authorposton${pid}">发表于 ${time}</em></div>
          </div>
          <div class="pct"><div class="pcb"><div class="t_fsz"><table><tr><td class="t_f" id="postmessage_${pid}">${content}</td></tr></table></div></div></div>
        </td>
      </tr>
    </table>
  </div>`;
}

function threadHtml(): string {
  return `<!doctype html><html><head><title>在北方冬天户外放一台电脑 - Chiphell</title></head><body>
    <div id="pgt">
      <div class="pgt"><div class="pg">
        <strong>1</strong>
        <a href="forum.php?mod=viewthread&tid=2920306&page=2">2</a>
        <a href="forum.php?mod=viewthread&tid=2920306&page=3">3</a>
        <label><input name="custompage" /><span title="共 6 页"> / 6 页</span></label>
        <a class="nxt" href="forum.php?mod=viewthread&tid=2920306&page=2">下一页</a>
      </div></div>
      <span class="y pgb"><a href="forum-146-1.html">返回列表</a></span>
    </div>
    <div id="postlist" class="pl bm">
      <table><tr>
        <td class="pls ptn pbn"><div class="hm"><span>查看:</span> <span class="xi1">69</span><span>|</span><span>回复:</span> <span class="xi1">3</span></div></td>
        <td class="plc"><h1 class="ts"><a href="forum.php?mod=forumdisplay&fid=146">[装机]</a><span id="thread_subject">在北方冬天户外放一台电脑，天天用，有可能吗?</span></h1></td>
      </tr></table>
      ${postBlock(61017267, "ris", 1, "2026-11-23 09:31", '我想在北方冬天放一台电脑<br />请问行不行？<img src="static/image/common/none.gif" file="data/attachment/forum/photo.jpg" /><script>alert(1)</script><div id="fs-ball" class="fs-app">bad</div>')}
      ${postBlock(61017359, "林雷", 2, "2026-11-23 09:40", "应该可以，注意防潮。", "./data/avatar/lin.jpg")}
      <div id="post_rate_div_61017267"></div>
    </div>
  </body></html>`;
}

function pageTwoHtml(): string {
  return `<!doctype html><html><body>
    <div class="pg"><a href="forum.php?mod=viewthread&tid=2920306&page=1">1</a><strong>2</strong><a href="forum.php?mod=viewthread&tid=2920306&page=3">3</a><label><span title="共 6 页"> / 6 页</span></label></div>
    <div id="postlist">
      ${postBlock(61018000, "page2user", 30, "2026-11-23 10:00", "第二页内容")}
    </div>
  </body></html>`;
}

describe("Chiphell adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses thread and forum ids from urls", () => {
    expect(threadIdFromUrl(new URL("https://www.chiphell.com/thread-2920306-1-1.html"))).toBe("2920306");
    expect(
      threadIdFromUrl(new URL("https://www.chiphell.com/forum.php?mod=viewthread&tid=2920306&page=2")),
    ).toBe("2920306");
    expect(threadIdFromUrl(new URL("https://www.chiphell.com/forum-146-1.html"))).toBeNull();

    expect(forumIdFromUrl(new URL("https://www.chiphell.com/forum-146-1.html"))).toBe("146");
    expect(
      forumIdFromUrl(new URL("https://www.chiphell.com/forum.php?mod=forumdisplay&fid=146&page=2")),
    ).toBe("146");
    expect(forumIdFromUrl(new URL("https://www.chiphell.com/thread-2920306-1-1.html"))).toBeNull();
  });

  it("maps forum rows to conversations", () => {
    const conversations = parseThreadList(threadListHtml);

    expect(conversations).toHaveLength(2);
    expect(conversations[0].id).toBe("2920766");
    expect(conversations[0].title).toContain("在北方冬天");
    expect(conversations[0].subtitle).toContain("ris");
    expect(conversations[0].subtitle).toContain("3 回复");
    expect(conversations[0].subtitle).toContain("67 查看");
    expect(conversations[0].subtitle).toContain("[装机]");
    expect(conversations[0].avatarFallback).toBe("ris");
    expect(conversations[0].updatedAt).toBe(new Date(2026, 10, 23, 9, 45).getTime());
    expect(conversations[1].id).toBe("1");
  });

  it("parses a thread with posts, floors and pagination", () => {
    const view = parseThreadView(
      threadHtml(),
      "https://www.chiphell.com/thread-2920306-1-1.html",
    );

    expect(view.title).toBe("在北方冬天户外放一台电脑，天天用，有可能吗?");
    expect(view.subtitle).toContain("3 回复");
    expect(view.subtitle).toContain("69 查看");
    expect(view.subtitle).toContain("第 1/6 页");
    expect(view.html).toContain("ris");
    expect(view.html).toContain("林雷");
    expect(view.html).toContain("#1");
    expect(view.html).toContain("#2");
    expect(view.html).toContain("https://www.chiphell.com/data/avatar/ris.jpg");
    expect(view.html).toContain("https://www.chiphell.com/data/attachment/forum/photo.jpg");
    expect(view.html).not.toContain("none.gif");
    expect(view.html).not.toContain("<script>");
    expect(view.html).not.toContain("fs-ball");
    expect(view.html).not.toContain("fs-app");
    expect(view.hasMore).toBe(true);
    expect(view.cursor).toEqual({ page: 1, total: 6 });
  });

  it("loads the next page and preserves the cursor", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://www.chiphell.com");
      expect(url.pathname).toBe("/forum.php");
      expect(url.searchParams.get("mod")).toBe("viewthread");
      expect(url.searchParams.get("tid")).toBe("2920306");
      expect(url.searchParams.get("page")).toBe("2");
      return new Response(pageTwoHtml(), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await chiphellAdapter.loadMore!("2920306", { page: 1, total: 6 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.html).toContain("第二页内容");
    expect(result.html).toContain("#30");
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toEqual({ page: 2, total: 6 });
  });
});