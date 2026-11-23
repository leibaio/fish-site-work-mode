import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conversationIdFromUrl,
  latestToConversations,
  listApiPath,
  nodeNameFromPath,
  parseTopic,
  v2exAdapter,
} from "../packages/adapters/v2ex/src/adapter";

describe("V2EX adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses topic ids from urls", () => {
    expect(conversationIdFromUrl(new URL("https://www.v2ex.com/t/1259011"))).toBe("1259011");
    expect(conversationIdFromUrl(new URL("https://www.v2ex.com/t/1259011#reply4"))).toBe("1259011");
    expect(conversationIdFromUrl(new URL("https://www.v2ex.com/t/1259011?p=2"))).toBe("1259011");
    expect(conversationIdFromUrl(new URL("https://www.v2ex.com/go/tech"))).toBeNull();
    expect(conversationIdFromUrl(new URL("https://www.v2ex.com/"))).toBeNull();
  });

  it("parses node names and picks the list endpoint", () => {
    expect(nodeNameFromPath("/go/tech")).toBe("tech");
    expect(nodeNameFromPath("/go/tech/")).toBe("tech");
    expect(nodeNameFromPath("/t/1259011")).toBeNull();
    expect(listApiPath("/")).toBe("/api/topics/latest.json");
    expect(listApiPath("/t/1259011")).toBe("/api/topics/latest.json");
    expect(listApiPath("/go/tech")).toBe("/api/topics/show.json?node_name=tech");
  });

  it("maps latest topics to conversations", () => {
    const conversations = latestToConversations([
      {
        id: 1259011,
        title: "你们 Agy 的 Neon 的速度怎么样",
        replies: 4,
        created: 1795397341,
        last_touched: 1795398341,
        member: {
          username: "alice",
          avatar_normal: "https://cdn.v2ex.com/avatar/a_normal.png",
        },
        node: { name: "tech", title: "技术" },
      },
      {
        id: 1259012,
        title: "deleted topic",
        deleted: 1,
      },
    ]);

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe("1259011");
    expect(conversations[0].subtitle).toBe("4 回复 · 技术");
    expect(conversations[0].avatar).toContain("a_normal.png");
    expect(conversations[0].updatedAt).toBe(1795398341000);
  });

  it("renders the topic and replies with floors and thanks", () => {
    const view = parseTopic(
      {
        id: 1259011,
        title: "你们 Agy 的 Neon 的速度怎么样",
        replies: 2,
        created: 1795397341,
        member: { username: "alice", avatar_normal: "https://cdn.v2ex.com/a.png" },
        node: { name: "tech", title: "技术" },
        content_rendered: "<p>Hello <strong>world</strong></p>",
      },
      [
        {
          id: 1,
          created: 1795397400,
          content_rendered: "谷歌故意的应该，为了限流",
          thanks: 3,
          member: { username: "bob" },
        },
        {
          id: 2,
          created: 1795397500,
          content_rendered:
            '<p>second</p><script>alert(1)</script><div id="fs-ball" class="fs-app">third</div>',
          member: { username: "carol" },
        },
      ],
    );

    expect(view.title).toBe("你们 Agy 的 Neon 的速度怎么样");
    expect(view.subtitle).toContain("2 回复");
    expect(view.html).toContain("Hello <strong>world</strong>");
    expect(view.html).toContain("楼主");
    expect(view.html).toContain("#1");
    expect(view.html).toContain("#2");
    expect(view.html).toContain("感谢 3");
    expect(view.html).toContain("<p>谷歌故意的应该，为了限流</p>");
    expect(view.html).not.toContain("<script>");
    expect(view.html).not.toContain("fs-ball");
    expect(view.html).not.toContain("fs-app");
    expect(view.html).toContain("third");
    expect(view.hasMore).toBe(false);
  });

  it("loads a topic through the two public api endpoints", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://www.v2ex.com");
      if (url.pathname === "/api/topics/show.json") {
        expect(url.searchParams.get("id")).toBe("1259011");
        return new Response(
          JSON.stringify([
            {
              id: 1259011,
              title: "Topic",
              replies: 1,
              created: 1795397341,
              member: { username: "alice" },
              content_rendered: "<p>Hello</p>",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/api/replies/show.json") {
        expect(url.searchParams.get("topic_id")).toBe("1259011");
        return new Response(
          JSON.stringify([
            { id: 1, created: 1795397400, content_rendered: "reply", member: { username: "bob" } },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = await v2exAdapter.openConversation("1259011");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(view.title).toBe("Topic");
    expect(view.html).toContain("Hello");
    expect(view.html).toContain("reply");
  });
});