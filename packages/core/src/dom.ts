import { sanitizeCooked } from "./utils";

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCount(value: unknown): number {
  const text = String(value ?? "").replace(/[,\s]/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)\s*(万|w|k)?/i);
  if (!match) return 0;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return 0;
  const unit = match[2]?.toLowerCase();
  if (unit === "万" || unit === "w") return Math.round(number * 10_000);
  if (unit === "k") return Math.round(number * 1000);
  return Math.round(number);
}

export function absoluteUrl(value: string | null | undefined, base: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("data:") || raw.toLowerCase().startsWith("javascript:")) return "";
  try {
    return new URL(raw, base).href;
  } catch {
    return "";
  }
}

export function queryFirst<T extends Element = Element>(
  root: ParentNode,
  selectors: string[],
): T | null {
  for (const selector of selectors) {
    const element = root.querySelector<T>(selector);
    if (element) return element;
  }
  return null;
}

export function queryAll<T extends Element = Element>(
  root: ParentNode,
  selectors: string[],
): T[] {
  const found = new Set<T>();
  for (const selector of selectors) {
    root.querySelectorAll<T>(selector).forEach((element) => found.add(element));
  }
  return [...found];
}

export function textOf(root: ParentNode, selectors: string[]): string {
  return normalizeText(queryFirst(root, selectors)?.textContent);
}

export function firstText(root: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    const text = normalizeText(root.querySelector(selector)?.textContent);
    if (text) return text;
  }
  return "";
}

export function topLevel(elements: Element[]): Element[] {
  return elements.filter(
    (element) => !elements.some((other) => other !== element && other.contains(element)),
  );
}

export async function waitForSelector(
  selectors: string[],
  timeout = 6000,
): Promise<Element | null> {
  if (typeof document === "undefined") return null;
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const element = queryFirst(document, selectors);
      if (element) {
        resolve(element);
        return;
      }
      if (Date.now() - started >= timeout) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 150);
    };
    tick();
  });
}

export function absolutizeMedia(root: Element, baseUrl: string): void {
  root.querySelectorAll("img").forEach((image) => {
    const real =
      image.getAttribute("data-src") ||
      image.getAttribute("data-original") ||
      image.getAttribute("data-actualsrc") ||
      image.getAttribute("data-lazy-src");
    if (real) image.setAttribute("src", real);

    const src = image.getAttribute("src");
    if (src) {
      const absolute = absoluteUrl(src, baseUrl);
      if (absolute) image.setAttribute("src", absolute);
      else image.removeAttribute("src");
    }
    image.removeAttribute("data-src");
    image.removeAttribute("data-original");
    image.removeAttribute("data-actualsrc");
    image.removeAttribute("data-lazy-src");
  });

  root.querySelectorAll("video").forEach((video) => {
    for (const name of ["src", "poster"]) {
      const value = video.getAttribute(name);
      if (!value) continue;
      const absolute = absoluteUrl(value, baseUrl);
      if (absolute) video.setAttribute(name, absolute);
    }
  });

  root.querySelectorAll("source").forEach((source) => {
    const src = source.getAttribute("src");
    if (!src) return;
    const absolute = absoluteUrl(src, baseUrl);
    if (absolute) source.setAttribute("src", absolute);
  });

  root.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
    const absolute = absoluteUrl(href, baseUrl);
    if (absolute) anchor.setAttribute("href", absolute);
  });
}

export function cleanElement(
  element: Element | null,
  baseUrl: string,
  removeSelectors: string[] = [],
): string {
  if (!element) return "";
  const clone = element.cloneNode(true) as Element;
  for (const selector of removeSelectors) {
    clone.querySelectorAll(selector).forEach((node) => node.remove());
  }
  absolutizeMedia(clone, baseUrl);
  return sanitizeCooked(clone.innerHTML);
}