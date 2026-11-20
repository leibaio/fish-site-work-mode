export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const escapeAttr = escapeHtml;

export function clamp(value: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function timeAgo(timestamp?: number): string {
  if (!timestamp) return "";
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 172_800_000) return "昨天";
  return `${new Date(ms).getMonth() + 1}月${new Date(ms).getDate()}日`;
}

export function firstChar(text: string): string {
  return (text || "?").trim().slice(0, 1) || "?";
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc
    .querySelectorAll("script,iframe,object,embed,form,input,textarea,button,link,meta,style")
    .forEach((node) => node.remove());

  doc.querySelectorAll("*").forEach((element) => {
    for (const attr of [...element.attributes]) {
      if (/^on/i.test(attr.name)) {
        element.removeAttribute(attr.name);
      } else if (/^(href|src)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value)) {
        element.removeAttribute(attr.name);
      }
    }
    if (element.tagName === "IMG") {
      element.setAttribute("loading", "lazy");
      element.setAttribute("decoding", "async");
    }
  });

  return doc.body ? doc.body.innerHTML : "";
}

/**
 * 清理站点返回的正文 HTML。
 * 比 sanitizeHtml 更严格：正文不允许携带 id、行内 style，
 * 也不允许使用外壳预留的 fs-* class，避免帖子内容盖住工作台 UI。
 */
export function sanitizeCooked(html: string): string {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc
    .querySelectorAll("script,iframe,object,embed,form,input,textarea,button,link,meta,style")
    .forEach((node) => node.remove());

  doc.querySelectorAll("*").forEach((element) => {
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase();
      if (/^on/.test(name) || name === "id" || name === "style") {
        element.removeAttribute(attr.name);
      } else if (name === "class") {
        const kept = attr.value
          .split(/\s+/)
          .filter((token) => token && !/^fs-/i.test(token));
        if (kept.length) element.setAttribute("class", kept.join(" "));
        else element.removeAttribute("class");
      } else if (/^(href|src|srcset|poster)$/.test(name) && /^\s*(javascript|data):/i.test(attr.value)) {
        element.removeAttribute(attr.name);
      }
    }
    if (element.tagName === "IMG") {
      element.setAttribute("loading", "lazy");
      element.setAttribute("decoding", "async");
    }
  });

  return doc.body ? doc.body.innerHTML : "";
}

export function isTypingTarget(event: KeyboardEvent): boolean {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const target = (path[0] as HTMLElement | undefined) || (event.target as HTMLElement | null);
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || !!target.isContentEditable;
}

export function faviconDataUri(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
    '<rect width="16" height="16" rx="3" fill="#3b82f6"/>' +
    '<path d="M3 5.2h3.6l1.1 1.4H13v5.6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="#fff" opacity=".92"/>' +
    "</svg>";
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function normalizeTimestamp(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number < 1e12 ? number * 1000 : number;
}