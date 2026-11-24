import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startApp, type AppHandle, type CoverStory, type SiteAdapter } from "../packages/core/src";

const coverStory: CoverStory = {
  workspace: "community-service",
  branch: "main",
  branches: ["main", "develop"],
  footer: "Go · main",
  fakeDocName: "community-spec.pdf",
  tabTitle: "community-spec.pdf · 工作目录",
  tree: [
    {
      name: "src",
      type: "dir",
      children: [{ name: "api", type: "dir", children: [{ name: "topics.go", type: "file", status: "M" }] }],
    },
  ],
};

function mockAdapter(): SiteAdapter {
  return {
    id: "mock",
    label: "Mock",
    normalTitle: "微信",
    match: () => true,
    detect: async () => ({ url: location.href, canonicalId: "1", title: "Mock" }),
    listConversations: async () => [
      { id: "1", title: "Topic One", subtitle: "2 replies", updatedAt: Date.now() },
    ],
    openConversation: async (id: string) => ({
      title: `Topic ${id}`,
      subtitle: "2 replies",
      html: `<h1>Topic ${id}</h1><p>Hello world</p>`,
      hasMore: false,
    }),
  };
}

async function waitFor(predicate: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor timeout");
}

describe("core shell", () => {
  let handle: AppHandle | null = null;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="site">site</div>';
    document.title = "Mock Site";
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
  });

  afterEach(() => {
    if (handle) {
      handle.exitMode();
      handle.host.remove();
      handle = null;
    }
    document.documentElement.classList.remove("fs-on");
    document.getElementById("fs-hide-style")?.remove();
    localStorage.clear();
  });

  it("mounts, reads, toggles work mode and logs-only", async () => {
    handle = await startApp(mockAdapter(), coverStory);
    expect(handle).not.toBeNull();
    expect(handle!.host.style.pointerEvents).toBe("none");
    const shadow = handle!.shadow;

    await waitFor(() => !!shadow.querySelector(".fs-item-title"));
    expect(shadow.querySelector(".fs-item-title")?.textContent).toContain("Topic One");

    await waitFor(() => !!shadow.querySelector(".fs-content")?.textContent?.includes("Hello world"));
    expect(shadow.querySelector(".fs-head-title")?.textContent).toContain("Topic 1");
    expect(shadow.querySelectorAll(".fs-logline").length).toBeGreaterThan(0);

    (shadow.querySelector("#fs-brand") as HTMLButtonElement).click();
    expect(shadow.querySelector("#fs-brand")?.textContent).toBe("工作目录");
    expect(shadow.querySelector(".fs-workspace-name")?.textContent).toBe("community-service");
    expect(document.title).toContain("工作目录");

    (shadow.querySelector("#fs-brand") as HTMLButtonElement).click();
    expect(document.title).toBe("Mock Site");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "q", ctrlKey: true, altKey: true, bubbles: true }),
    );
    expect(shadow.querySelector(".fs-app")?.classList.contains("fs-logs-only")).toBe(true);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "q", ctrlKey: true, altKey: true, bubbles: true }),
    );
    expect(shadow.querySelector(".fs-app")?.classList.contains("fs-logs-only")).toBe(false);

    handle!.exitMode();
    expect((shadow.querySelector(".fs-app") as HTMLElement).style.display).toBe("none");
    expect((shadow.querySelector("#fs-ball") as HTMLElement).hidden).toBe(false);
    expect(document.documentElement.classList.contains("fs-on")).toBe(false);

    handle!.enterMode();
    expect((shadow.querySelector(".fs-app") as HTMLElement).style.display).toBe("flex");
    expect((shadow.querySelector("#fs-ball") as HTMLElement).hidden).toBe(true);
    expect(document.documentElement.classList.contains("fs-on")).toBe(true);
  });

  it("opens the conversation requested by the url even when it is not in the list", async () => {
    const opened: string[] = [];
    const adapter = mockAdapter();
    adapter.initialConversationId = () => "99";
    adapter.openConversation = async (id: string) => {
      opened.push(id);
      return {
        title: `Topic ${id}`,
        subtitle: "1 回复",
        html: `<h1>Topic ${id}</h1><p>From url</p>`,
        hasMore: false,
      };
    };

    handle = await startApp(adapter, coverStory);
    expect(handle).not.toBeNull();
    const shadow = handle!.shadow;

    await waitFor(() => opened.length === 1);
    expect(opened[0]).toBe("99");
    expect(shadow.querySelector(".fs-head-title")?.textContent).toBe("Topic 99");
  });

  it("can skip auto-opening the first conversation", async () => {
    const adapter = mockAdapter();
    adapter.autoOpenFirst = false;
    const opened = vi.fn(async () => ({
      title: "Unused",
      html: "<p>unused</p>",
      hasMore: false,
    }));
    adapter.openConversation = opened;

    handle = await startApp(adapter, coverStory);
    const shadow = handle!.shadow;
    await waitFor(() => !!shadow.querySelector(".fs-item-title"));

    expect(opened).not.toHaveBeenCalled();
    expect(shadow.querySelector(".fs-content")?.textContent).toContain("选择左侧会话");
  });

  it("loads more conversations from the sidebar", async () => {
    const adapter = mockAdapter();
    adapter.listConversations = async () => ({
      conversations: [
        { id: "1", title: "Topic One", subtitle: "1 回复", updatedAt: Date.now() },
      ],
      hasMore: true,
      cursor: { page: 2 },
    });
    const loadMore = vi.fn(async () => ({
      conversations: [
        { id: "2", title: "Topic Two", subtitle: "2 回复", updatedAt: Date.now() },
      ],
      hasMore: false,
      cursor: undefined,
    }));
    adapter.loadMoreConversations = loadMore;

    handle = await startApp(adapter, coverStory);
    const shadow = handle!.shadow;
    await waitFor(() => !!shadow.querySelector(".fs-list-more"));
    (shadow.querySelector(".fs-list-more") as HTMLButtonElement).click();

    await waitFor(() => shadow.querySelectorAll(".fs-item").length === 2);
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(loadMore).toHaveBeenCalledWith({ page: 2 });
    expect(shadow.querySelector(".fs-list-more")).toBeNull();
    expect(
      [...shadow.querySelectorAll(".fs-item-title")].map((element) => element.textContent),
    ).toContain("Topic Two");
  });

  it("opens and closes the image lightbox", async () => {
    const adapter = mockAdapter();
    adapter.openConversation = async () => ({
      title: "Topic",
      html:
        '<section class="fs-post"><div class="fs-post-body">' +
        '<img src="https://example.com/a.jpg" width="400" height="300" alt="A">' +
        "</div></section>",
      hasMore: false,
    });

    handle = await startApp(adapter, coverStory);
    const shadow = handle!.shadow;
    await waitFor(() => !!shadow.querySelector(".fs-post-body img"));

    const image = shadow.querySelector(".fs-post-body img") as HTMLImageElement;
    expect(image.classList.contains("fs-thumb-img")).toBe(true);
    image.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect((shadow.querySelector("#fs-lightbox") as HTMLElement).hidden).toBe(false);
    expect(
      (shadow.querySelector("#fs-lightbox-img") as HTMLImageElement).getAttribute("src"),
    ).toBe("https://example.com/a.jpg");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect((shadow.querySelector("#fs-lightbox") as HTMLElement).hidden).toBe(true);
  });

  it("searches conversations and restores the latest list", async () => {
    const adapter = mockAdapter();
    adapter.listConversations = async () => [
      { id: "1", title: "Latest Topic", subtitle: "latest", updatedAt: Date.now() },
    ];
    adapter.searchConversations = vi.fn(async (query: string) => ({
      conversations: [
        { id: "2", title: "Search Result", subtitle: query, updatedAt: Date.now() },
      ],
      hasMore: false,
      cursor: undefined,
    }));

    handle = await startApp(adapter, coverStory);
    const shadow = handle!.shadow;
    await waitFor(() => !(shadow.querySelector("#fs-search") as HTMLElement).hidden);

    const input = shadow.querySelector("#fs-search-input") as HTMLInputElement;
    input.value = "hello";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() =>
      [...shadow.querySelectorAll(".fs-item-title")].some(
        (element) => element.textContent === "Search Result",
      ),
    );

    expect(adapter.searchConversations).toHaveBeenCalledWith("hello");
    expect((shadow.querySelector("#fs-search-clear") as HTMLElement).hidden).toBe(false);

    (shadow.querySelector("#fs-search-clear") as HTMLButtonElement).click();
    await waitFor(() =>
      [...shadow.querySelectorAll(".fs-item-title")].some(
        (element) => element.textContent === "Latest Topic",
      ),
    );
    expect((shadow.querySelector("#fs-search-input") as HTMLInputElement).value).toBe("");
  });

  it("thumbnails and enlarges inline svg content", async () => {
    const adapter = mockAdapter();
    adapter.openConversation = async () => ({
      title: "SVG",
      html:
        '<section class="fs-post"><div class="fs-post-body">' +
        '<svg width="200" height="120"><rect width="200" height="120"></rect></svg>' +
        "</div></section>",
      hasMore: false,
    });

    handle = await startApp(adapter, coverStory);
    const shadow = handle!.shadow;
    await waitFor(() => !!shadow.querySelector(".fs-post-body svg"));

    const svg = shadow.querySelector(".fs-post-body svg") as SVGSVGElement;
    expect(svg.classList.contains("fs-thumb-svg")).toBe(true);
    svg.querySelector("rect")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect((shadow.querySelector("#fs-lightbox") as HTMLElement).hidden).toBe(false);
    expect((shadow.querySelector("#fs-lightbox-svg") as HTMLElement).hidden).toBe(false);
    expect((shadow.querySelector("#fs-lightbox-img") as HTMLElement).hidden).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect((shadow.querySelector("#fs-lightbox") as HTMLElement).hidden).toBe(true);
  });
});