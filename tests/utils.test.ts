import { describe, expect, it } from "vitest";
import { sanitizeCooked } from "../packages/core/src";

describe("sanitizeCooked", () => {
  it("keeps normal post markup and images", () => {
    const html = sanitizeCooked(
      '<p class="lead">Hello <strong>world</strong></p><img src="/uploads/a.png" alt="a">',
    );
    expect(html).toContain('class="lead"');
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain('src="/uploads/a.png"');
    expect(html).toContain('loading="lazy"');
  });

  it("strips scripts, ids, inline styles and shell classes", () => {
    const html = sanitizeCooked(
      '<div id="fs-ball" class="fs-app quote" style="position:fixed;inset:0">' +
        '<script>alert(1)</script><span class="fs-post-body">text</span></div>',
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("fs-ball");
    expect(html).not.toContain("fs-app");
    expect(html).not.toContain("fs-post-body");
    expect(html).not.toContain("position:fixed");
    expect(html).toContain('class="quote"');
    expect(html).toContain("text");
  });

  it("removes javascript and data urls", () => {
    const html = sanitizeCooked(
      '<a href="javascript:alert(1)">x</a><img src="data:image/svg+xml,abc">',
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:image");
  });
});