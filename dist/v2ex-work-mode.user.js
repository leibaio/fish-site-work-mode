// ==UserScript==
// @name         工作台 · V2EX
// @namespace    fish-site-work-mode
// @version      0.3.0
// @description  把 V2EX 变成工作台：左栏话题、中间阅读区、右侧运行日志，支持工作目录伪装。
// @author       leibaio
// @license      MIT
// @homepageURL  https://github.com/leibaio/fish-site-work-mode
// @supportURL   https://github.com/leibaio/fish-site-work-mode/issues
// @updateURL    https://raw.githubusercontent.com/leibaio/fish-site-work-mode/main/dist/v2ex-work-mode.user.js
// @downloadURL  https://raw.githubusercontent.com/leibaio/fish-site-work-mode/main/dist/v2ex-work-mode.user.js
// @match        https://v2ex.com/*
// @match        https://www.v2ex.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==


"use strict";
(() => {
  // packages/core/src/logs.ts
  var TEMPLATES = [
    () => ({ level: "INFO", service: "api-gateway", message: `POST /api/v2/orders 200 ${rand(8, 120)}ms trace=${hex(12)}` }),
    () => ({ level: "INFO", service: "api-gateway", message: `GET /api/v2/topics?page=${rand(1, 20)} 200 ${rand(10, 60)}ms` }),
    () => ({ level: "DEBUG", service: "auth-service", message: `token refresh uid=${rand(1e3, 9999)} exp=3600s` }),
    () => ({ level: "INFO", service: "content-service", message: `topic ${rand(1e4, 99999)} cached ttl=300s` }),
    () => ({ level: "DEBUG", service: "redis", message: `GET feed:${rand(1e3, 9999)} hit=1 ttl=${rand(60, 600)}` }),
    () => ({ level: "INFO", service: "search-service", message: `query "${pickWord()}" hits=${rand(2, 200)} took=${rand(5, 80)}ms` }),
    () => ({ level: "INFO", service: "ci-runner", message: `[build ${rand(4700, 4999)}] npm test — ${rand(180, 400)} passed` }),
    () => ({ level: "INFO", service: "deploy", message: `staging ${hex(7)} rolled out ${rand(1, 4)}/4` }),
    () => ({ level: "WARN", service: "inventory", message: `stock below threshold sku=SKU-${rand(1e3, 9999)}` }),
    () => ({ level: "INFO", service: "payment", message: `settlement batch=${rand(100, 999)} amount=¥${rand(10, 999)}.${rand(10, 99)}` }),
    () => ({ level: "DEBUG", service: "mysql", message: `SELECT id,status FROM orders WHERE id=? (${rand(2, 40)}ms)` }),
    () => ({ level: "ERROR", service: "payment", message: `upstream bank timeout retry=${rand(1, 3)}/3` })
  ];
  var WORDS = ["orders", "refund", "inventory", "session", "report", "invoice", "coupon", "shipment"];
  function rand(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  function hex(length) {
    const chars = "0123456789abcdef";
    let output = "";
    for (let i = 0; i < length; i++) output += chars[Math.floor(Math.random() * 16)];
    return output;
  }
  function pickWord() {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
  }
  var SimulatedLogProvider = class {
    constructor() {
      this.id = "simulated";
      this.label = "模拟日志";
    }
    start(sink) {
      let stopped = false;
      sink.status("sim");
      const append = (count) => {
        if (stopped) return;
        for (let i = 0; i < count; i++) {
          const entry = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]();
          sink.line({ ...entry, ts: Date.now() - rand(0, 8e3) });
        }
      };
      append(140);
      const timer = window.setInterval(() => append(1), 2200);
      return () => {
        stopped = true;
        window.clearInterval(timer);
      };
    }
  };

  // packages/core/src/storage.ts
  function createStore(prefix) {
    const fullKey = (key) => `${prefix}:${key}`;
    return {
      get(key, fallback) {
        const name = fullKey(key);
        try {
          if (typeof GM_getValue === "function") {
            const value = GM_getValue(name, fallback);
            return value === void 0 || value === null ? fallback : value;
          }
        } catch {
        }
        try {
          const raw = localStorage.getItem(name);
          if (raw === null) return fallback;
          return JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        const name = fullKey(key);
        try {
          if (typeof GM_setValue === "function") {
            GM_setValue(name, value);
            return;
          }
        } catch {
        }
        try {
          localStorage.setItem(name, JSON.stringify(value));
        } catch {
        }
      }
    };
  }
  function registerMenu(name, callback) {
    try {
      if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand(name, callback);
    } catch {
    }
  }

  // packages/core/src/styles.ts
  var STYLES = `
:host { all: initial; pointer-events: none; }
* { box-sizing: border-box; }

.fs-app {
  position: fixed; inset: 0; display: flex; background: #ededed; color: #191919;
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  pointer-events: auto;
}

/* ---------- 左栏 ---------- */
.fs-side {
  width: 280px; flex: 0 0 280px; background: #f7f7f7; display: flex; flex-direction: column;
  min-height: 0;
}
.fs-side-head { height: 56px; flex: 0 0 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; }
.fs-brand {
  border: 0; background: transparent; padding: 2px 0; color: #191919; cursor: pointer;
  font: 600 15px/1.4 inherit; letter-spacing: .5px;
}
.fs-brand:hover { color: #07c160; }
.fs-refresh {
  border: 0; background: transparent; color: #8b8b8b; cursor: pointer; font-size: 15px;
  padding: 4px 6px; border-radius: 4px; line-height: 1;
}
.fs-refresh:hover { background: #ececec; color: #555; }
.fs-list { flex: 1; overflow: auto; padding-bottom: 8px; }
.fs-item { display: flex; align-items: center; gap: 10px; padding: 9px 14px; cursor: pointer; }
.fs-item:hover { background: #ececec; }
.fs-item.active { background: #dcdcdc; }
.fs-avatar {
  width: 40px; height: 40px; flex: 0 0 40px; border-radius: 4px; object-fit: cover; background: #d8d8d8;
  display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px; overflow: hidden;
}
.fs-avatar-letter { background: #c9c9c9; }
.fs-item-main { flex: 1; min-width: 0; }
.fs-item-title { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fs-item-sub { margin-top: 3px; font-size: 12px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fs-item-time { align-self: flex-start; margin-top: 2px; font-size: 11px; color: #b3b3b3; }
.fs-item-unread { width: 7px; height: 7px; border-radius: 50%; background: #fa5151; flex: 0 0 7px; }
.fs-side-foot {
  height: 34px; flex: 0 0 34px; display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: #aaa; border-top: 1px solid #ececec;
}

/* ---------- 分隔条 ---------- */
.fs-resizer {
  width: 1px; flex: 0 0 1px; position: relative; cursor: col-resize; background: #e2e2e2;
  touch-action: none;
}
.fs-resizer::after { content: ""; position: absolute; top: 0; bottom: 0; left: -3px; right: -3px; cursor: col-resize; }
.fs-resizer:hover, .fs-resizer.fs-dragging { background: #07c160; }

/* ---------- 中间阅读区 ---------- */
.fs-main { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #fff; }
.fs-head {
  height: 60px; flex: 0 0 60px; display: flex; align-items: center; gap: 10px; padding: 0 18px;
  background: #f7f7f7; border-bottom: 1px solid #e7e7e7;
}
.fs-head-cover { width: 32px; height: 32px; flex: 0 0 32px; border-radius: 4px; object-fit: cover; background: #ddd; display: flex; align-items: center; justify-content: center; overflow: hidden; color: #fff; font-size: 14px; }
.fs-head-cover img { width: 100%; height: 100%; object-fit: cover; }
.fs-doc-icon { width: 32px; height: 32px; border-radius: 4px; background: #e8f0fe; color: #3b82f6; font: 700 9px/32px Consolas, monospace; text-align: center; letter-spacing: .5px; }
.fs-head-main { min-width: 0; flex: 0 1 auto; }
.fs-head-title {
  font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer;
}
.fs-head-title:hover { color: #07c160; }
.fs-head-sub {
  margin-top: 1px; font-size: 12px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fs-spacer { flex: 1; }
.fs-head-btn {
  border: 0; background: transparent; color: #666; cursor: pointer; padding: 5px 8px;
  border-radius: 4px; font: 12px/1.4 inherit;
}
.fs-head-btn:hover { background: #e9e9e9; color: #111; }
.fs-exit {
  border: 0; background: transparent; color: #666; cursor: pointer; font-size: 17px;
  padding: 6px 9px; border-radius: 4px; line-height: 1;
}
.fs-exit:hover { background: #e9e9e9; color: #111; }
.fs-content { flex: 1; overflow: auto; background: #fff; }
.fs-doc { max-width: 880px; margin: 0 auto; padding: 36px 48px 90px; }
.fs-empty { color: #999; text-align: center; padding: 70px 20px; font-size: 13px; line-height: 2; }
.fs-list .fs-empty { padding: 20px 12px; font-size: 12px; }
.fs-topic-title { margin: 0 0 8px; font-size: 24px; line-height: 1.4; font-weight: 600; }
.fs-topic-meta { margin-bottom: 20px; color: #999; font-size: 12px; }
.fs-post { padding: 18px 0; border-bottom: 1px solid #f0f0f0; }
.fs-post:last-child { border-bottom: 0; }
.fs-post-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: #999; font-size: 12px; }
.fs-post-avatar { width: 28px; height: 28px; flex: 0 0 28px; border-radius: 4px; object-fit: cover; background: #ddd; }
.fs-post-avatar-letter {
  display: flex; align-items: center; justify-content: center;
  background: #e5e5e5; color: #888; font-size: 12px;
}
.fs-post-name { color: #333; font-size: 13px; font-weight: 600; }
.fs-post-floor { color: #aaa; }
.fs-post-time { margin-left: auto; color: #b3b3b3; }
.fs-post-body { color: #222; font-size: 16px; line-height: 1.85; overflow-wrap: anywhere; }
.fs-post-body p { margin: 0 0 1em; }
.fs-post-body img { max-width: 100%; height: auto; border-radius: 4px; }
.fs-post-body pre {
  margin: 1em 0; padding: 12px; overflow: auto; border-radius: 6px; background: #f6f8fa;
  font: 12px/1.6 Consolas, "SFMono-Regular", Menlo, monospace;
}
.fs-post-body code { font-family: Consolas, "SFMono-Regular", Menlo, monospace; font-size: .92em; }
.fs-post-body :not(pre) > code { padding: 1px 4px; border-radius: 3px; background: #f2f2f2; }
.fs-post-body blockquote {
  margin: .8em 0; padding: .2em 0 .2em 1em; border-left: 3px solid #e2e2e2; color: #666;
}
.fs-post-body table { border-collapse: collapse; max-width: 100%; }
.fs-post-body th, .fs-post-body td { padding: 4px 8px; border: 1px solid #e5e5e5; }
.fs-post-body a { color: #576b95; text-decoration: none; }
.fs-post-body a:hover { text-decoration: underline; }
.fs-more {
  display: block; margin: 22px auto 0; padding: 7px 18px; border: 1px solid #ddd; border-radius: 6px;
  background: #fff; color: #555; font-size: 12px; cursor: pointer;
}
.fs-more:hover { background: #f5f5f5; }
.fs-loading { padding: 30px; text-align: center; color: #999; font-size: 13px; }

/* ---------- 日志栏 ---------- */
.fs-logpane {
  width: 340px; flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0;
  background: #fbfbfb;
}
.fs-loghead {
  height: 34px; flex: 0 0 34px; display: flex; align-items: center; gap: 7px; padding: 0 12px;
  border-bottom: 1px solid #ececec; color: #8a8f98; font-size: 11px; letter-spacing: .5px;
}
.fs-dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: #07c160; box-shadow: 0 0 0 3px rgba(7,193,96,.12); }
.fs-log-status { margin-left: auto; color: #b0b5bd; font: 10px Consolas, monospace; }
.fs-log-status.live { color: #07c160; }
.fs-log-status.unauth { color: #c0392b; }
.fs-log-status.offline { color: #b7791f; }
.fs-logbody {
  flex: 1; min-height: 0; overflow: hidden; padding: 6px 12px 10px;
  color: #8a8f98; font: 11px/1.7 Consolas, "SFMono-Regular", Menlo, monospace;
}
.fs-logline { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fs-log-time { color: #b0b5bd; }
.fs-log-level { display: inline-block; min-width: 38px; }
.fs-log-info { color: #3f8f5f; }
.fs-log-debug { color: #9aa0a8; }
.fs-log-warn { color: #b7791f; }
.fs-log-error { color: #c0392b; }
.fs-log-service { display: inline-block; min-width: 92px; color: #6b7c93; }
.fs-log-message { color: #6b7280; }

/* ---------- 工作目录 ---------- */
.fs-tree { padding: 4px 0 10px; }
.fs-workspace {
  display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; cursor: pointer;
  color: #333; font: 600 11px Consolas, "SFMono-Regular", Menlo, monospace;
}
.fs-workspace:hover { background: #ececec; }
.fs-workspace-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.fs-branch {
  display: flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px 0 20px; cursor: pointer;
  color: #666; font: 11px Consolas, "SFMono-Regular", Menlo, monospace;
}
.fs-branch:hover { background: #ececec; }
.fs-branch-name { color: #333; }
.fs-branch-count { margin-left: auto; color: #b7791f; }
.fs-branch-menu {
  margin: 2px 10px 8px; padding: 3px 0; border: 1px solid #e2e2e2; border-radius: 4px;
  background: #fff; box-shadow: 0 6px 18px rgba(0,0,0,.08);
}
.fs-branch-item { padding: 4px 10px; color: #555; font: 11px Consolas, monospace; cursor: pointer; }
.fs-branch-item:hover { background: #f2f2f2; }
.fs-branch-item.active { color: #07c160; }
.fs-node {
  display: flex; align-items: center; gap: 5px; height: 26px; padding-right: 10px; cursor: pointer;
  color: #555; font: 12px/1.4 Consolas, "SFMono-Regular", Menlo, monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fs-node:hover { background: #ececec; }
.fs-node.active { background: #dcdcdc; color: #111; }
.fs-caret { width: 10px; flex: 0 0 10px; color: #9a9a9a; font-size: 10px; text-align: center; }
.fs-node-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.fs-dir .fs-node-name { color: #333; }
.fs-file .fs-node-name { color: #666; }
.fs-ft {
  width: 16px; height: 16px; flex: 0 0 16px; border-radius: 2px; text-align: center;
  color: #fff; font: 9px/16px Consolas, monospace;
}
.fs-ft-go { background: #00add8; }
.fs-ft-ts { background: #3178c6; }
.fs-ft-js { background: #d9c93b; color: #333; }
.fs-ft-yaml { background: #8e6bbf; }
.fs-ft-md { background: #7a8089; }
.fs-ft-sh { background: #2f9e44; }
.fs-ft-json { background: #8a8f98; }
.fs-ft-sql { background: #336791; }
.fs-ft-txt { background: #b0b5bd; }
.fs-git { flex: 0 0 auto; margin-left: 2px; font: 10px Consolas, monospace; }
.fs-git-m { color: #d19a66; }
.fs-git-u { color: #07c160; }
.fs-git-d { color: #c0392b; }

/* ---------- 只看日志 ---------- */
.fs-app.fs-logs-only .fs-main,
.fs-app.fs-logs-only .fs-log-resizer { display: none; }
.fs-app.fs-logs-only .fs-logpane { flex: 1 1 auto; width: auto !important; }

/* ---------- 悬浮球 / toast ---------- */
.fs-ball {
  position: fixed; right: 24px; bottom: 24px; width: 48px; height: 48px; border-radius: 50%;
  background: #07c160; color: #fff; font-size: 18px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.22); user-select: none; pointer-events: auto;
}
.fs-ball[hidden] { display: none; }
.fs-toast {
  position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); padding: 8px 14px;
  border-radius: 6px; background: rgba(0,0,0,.76); color: #fff; font-size: 12px;
  opacity: 0; pointer-events: none; transition: opacity .18s ease;
}
.fs-toast.show { opacity: 1; }
`;

  // packages/core/src/utils.ts
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  var escapeAttr = escapeHtml;
  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }
  function timeAgo(timestamp) {
    if (!timestamp) return "";
    const ms = timestamp < 1e12 ? timestamp * 1e3 : timestamp;
    const diff = Date.now() - ms;
    if (diff < 6e4) return "刚刚";
    if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
    if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
    if (diff < 1728e5) return "昨天";
    return `${new Date(ms).getMonth() + 1}月${new Date(ms).getDate()}日`;
  }
  function firstChar(text) {
    return (text || "?").trim().slice(0, 1) || "?";
  }
  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("script,iframe,object,embed,form,input,textarea,button,link,meta,style").forEach((node) => node.remove());
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
  function sanitizeCooked(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("script,iframe,object,embed,form,input,textarea,button,link,meta,style").forEach((node) => node.remove());
    doc.querySelectorAll("*").forEach((element) => {
      for (const attr of [...element.attributes]) {
        const name = attr.name.toLowerCase();
        if (/^on/.test(name) || name === "id" || name === "style") {
          element.removeAttribute(attr.name);
        } else if (name === "class") {
          const kept = attr.value.split(/\s+/).filter((token) => token && !/^fs-/i.test(token));
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
  function isTypingTarget(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const target = path[0] || event.target;
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || !!target.isContentEditable;
  }
  function faviconDataUri() {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#3b82f6"/><path d="M3 5.2h3.6l1.1 1.4H13v5.6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="#fff" opacity=".92"/></svg>';
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  // packages/core/src/shell.ts
  var ROOT_ID = "fs-host";
  var HIDE_STYLE_ID = "fs-hide-style";
  var MIN_WIDTH = 1e3;
  var LOG_LABELS = {
    connecting: "连接中",
    live: "实时",
    sim: "模拟",
    unauth: "未登录",
    offline: "离线"
  };
  function logClock(timestamp) {
    const date = new Date(timestamp ?? Date.now());
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(
      date.getMilliseconds()
    ).padStart(3, "0")}`;
  }
  function avatarMarkup(avatar, title, className, fallback) {
    if (avatar) {
      return `<img class="${className}" src="${escapeAttr(avatar)}" alt="" loading="lazy">`;
    }
    return `<span class="${className} fs-avatar-letter">${escapeHtml(firstChar(fallback || title))}</span>`;
  }
  function fileBadge(name) {
    const extension = String(name).split(".").pop()?.toLowerCase() ?? "";
    const map = {
      go: ["GO", "go"],
      ts: ["TS", "ts"],
      tsx: ["TS", "ts"],
      js: ["JS", "js"],
      jsx: ["JS", "js"],
      yaml: ["Y", "yaml"],
      yml: ["Y", "yaml"],
      md: ["M", "md"],
      sh: ["SH", "sh"],
      json: ["{}", "json"],
      sql: ["SQL", "sql"],
      xml: ["X", "txt"],
      toml: ["T", "txt"]
    };
    const found = map[extension] ?? ["·", "txt"];
    return { label: found[0], cls: found[1] };
  }
  async function startApp(adapter, coverStory, options = {}) {
    if (!adapter.match(new URL(location.href))) return null;
    if (document.getElementById(ROOT_ID)) return null;
    if (document.readyState === "loading") {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
    }
    if (!document.body) return null;
    const minWidth = options.minWidth ?? MIN_WIDTH;
    if (window.innerWidth < minWidth) return null;
    let ctx = null;
    try {
      ctx = await adapter.detect();
    } catch {
      ctx = null;
    }
    if (!ctx) return null;
    const store = createStore(options.storagePrefix || `fishwm:${adapter.id}`);
    const state = {
      enabled: store.get("enabled", true) !== false,
      workMode: store.get("workMode", false) === true,
      logsOnly: store.get("logsOnly", false) === true,
      leftWidth: clamp(store.get("leftWidth", 280), 220, 460),
      logWidth: clamp(store.get("logWidth", 340), 220, 1800),
      branch: coverStory.branch,
      branchMenuOpen: false,
      workCollapsed: false,
      workExpanded: /* @__PURE__ */ new Set(),
      workSelected: "",
      conversations: [],
      currentId: "",
      currentView: null,
      listError: "",
      dataLoaded: false,
      openToken: 0
    };
    const workIndex = /* @__PURE__ */ new Map();
    const indexTree = (nodes, base = "") => {
      for (const node of nodes) {
        const path = base ? `${base}/${node.name}` : node.name;
        workIndex.set(path, node);
        if (node.children) indexTree(node.children, path);
      }
    };
    indexTree(coverStory.tree);
    for (const [path, node] of workIndex) {
      if (node.type === "dir") state.workExpanded.add(path);
    }
    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
    <style>${STYLES}</style>
    <div class="fs-app" id="fs-app">
      <aside class="fs-side" id="fs-side">
        <div class="fs-side-head">
          <button class="fs-brand" id="fs-brand"></button>
          <button class="fs-refresh" id="fs-refresh" title="刷新">↻</button>
        </div>
        <div class="fs-list" id="fs-list"></div>
        <div class="fs-side-foot" id="fs-side-foot"></div>
      </aside>
      <div class="fs-resizer" id="fs-left-resizer"></div>
      <main class="fs-main" id="fs-main">
        <header class="fs-head">
          <span class="fs-head-cover" id="fs-head-cover"></span>
          <div class="fs-head-main">
            <div class="fs-head-title" id="fs-head-title" title="点击切换阅读区 / 日志（Ctrl+Alt+Q）"></div>
            <div class="fs-head-sub" id="fs-head-sub"></div>
          </div>
          <span class="fs-spacer"></span>
          <button class="fs-head-btn" id="fs-log-btn" title="切换阅读区 / 日志（Ctrl+Alt+Q）">日志</button>
          <button class="fs-exit" id="fs-exit" title="退出工作模式">⏏</button>
        </header>
        <div class="fs-content" id="fs-content"></div>
      </main>
      <div class="fs-resizer fs-log-resizer" id="fs-log-resizer"></div>
      <aside class="fs-logpane" id="fs-logpane">
        <div class="fs-loghead"><span class="fs-dot"></span>运行日志<span class="fs-log-status" id="fs-log-status">模拟</span></div>
        <div class="fs-logbody" id="fs-logbody"></div>
      </aside>
    </div>
    <div class="fs-ball" id="fs-ball" hidden>鱼</div>
    <div class="fs-toast" id="fs-toast"></div>
  `;
    document.body.appendChild(host);
    const must = (selector) => {
      const element = shadow.querySelector(selector);
      if (!element) throw new Error(`missing element: ${selector}`);
      return element;
    };
    const app = must("#fs-app");
    const side = must("#fs-side");
    const brand = must("#fs-brand");
    const refreshBtn = must("#fs-refresh");
    const list = must("#fs-list");
    const sideFoot = must("#fs-side-foot");
    const headCover = must("#fs-head-cover");
    const headTitle = must("#fs-head-title");
    const headSub = must("#fs-head-sub");
    const logBtn = must("#fs-log-btn");
    const exitBtn = must("#fs-exit");
    const content = must("#fs-content");
    const leftResizer = must("#fs-left-resizer");
    const logResizer = must("#fs-log-resizer");
    const logPane = must("#fs-logpane");
    const logBody = must("#fs-logbody");
    const logStatus = must("#fs-log-status");
    const ball = must("#fs-ball");
    const toastEl = must("#fs-toast");
    let originalTitle = document.title;
    let originalFavicons = [];
    let createdFavicon = null;
    let logStarted = false;
    let stopLogs = null;
    let toastTimer = 0;
    const conversationById = (id) => state.conversations.find((conversation) => conversation.id === id);
    function toast(message) {
      toastEl.textContent = message;
      toastEl.classList.add("show");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
    }
    function appendLog(entry) {
      const line = document.createElement("div");
      line.className = "fs-logline";
      const level = String(entry.level || "INFO").toLowerCase();
      line.innerHTML = `<span class="fs-log-time">${logClock(entry.ts)}</span><span class="fs-log-level fs-log-${escapeAttr(level)}">${escapeHtml(entry.level)}</span><span class="fs-log-service">${escapeHtml(entry.service)}</span><span class="fs-log-message">${escapeHtml(entry.message)}</span>`;
      logBody.appendChild(line);
      while (logBody.childElementCount > 400 && logBody.firstElementChild) {
        logBody.firstElementChild.remove();
      }
      logBody.scrollTop = logBody.scrollHeight;
    }
    function startLogFeed() {
      if (logStarted) return;
      logStarted = true;
      const provider = adapter.createLogProvider?.() ?? new SimulatedLogProvider();
      const sink = {
        line: appendLog,
        status: (status) => {
          logStatus.textContent = LOG_LABELS[status] ?? status;
          logStatus.className = `fs-log-status ${status}`;
        }
      };
      stopLogs = provider.start(sink);
    }
    function stopLogFeed() {
      if (stopLogs) stopLogs();
      stopLogs = null;
      logStarted = false;
    }
    function applyWidths() {
      side.style.width = `${state.leftWidth}px`;
      side.style.flexBasis = `${state.leftWidth}px`;
      state.logWidth = clamp(state.logWidth, 220, maxLogWidth());
      logPane.style.width = `${state.logWidth}px`;
    }
    function maxLogWidth() {
      const total = app.clientWidth || window.innerWidth;
      return Math.max(220, total - state.leftWidth - 60);
    }
    function setSiteHidden(hidden) {
      document.documentElement.classList.toggle("fs-on", hidden);
    }
    function injectHideStyle() {
      if (document.getElementById(HIDE_STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = HIDE_STYLE_ID;
      style.textContent = `
      html.fs-on body > *:not(#${ROOT_ID}) {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      html.fs-on body { overflow: hidden !important; }
    `;
      (document.head || document.documentElement).appendChild(style);
    }
    function collectFavicons() {
      if (originalFavicons.length) return;
      originalFavicons = [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')].map(
        (el) => ({ el, href: el.getAttribute("href") })
      );
    }
    function applyFavicon(fake) {
      collectFavicons();
      if (fake) {
        if (originalFavicons.length) {
          for (const item of originalFavicons) item.el.setAttribute("href", faviconDataUri());
        } else if (!createdFavicon) {
          const link = document.createElement("link");
          link.rel = "icon";
          link.href = faviconDataUri();
          (document.head || document.documentElement).appendChild(link);
          createdFavicon = link;
        }
        return;
      }
      for (const item of originalFavicons) {
        if (item.href == null) item.el.removeAttribute("href");
        else item.el.setAttribute("href", item.href);
      }
      if (createdFavicon) {
        createdFavicon.remove();
        createdFavicon = null;
      }
    }
    function updateTabTitle() {
      if (!state.enabled) return;
      if (state.workMode) {
        document.title = coverStory.tabTitle;
        applyFavicon(true);
      } else {
        document.title = originalTitle;
        applyFavicon(false);
      }
    }
    function restoreTabTitle() {
      document.title = originalTitle;
      applyFavicon(false);
    }
    function setBrandAndFoot() {
      brand.textContent = state.workMode ? "工作目录" : adapter.normalTitle;
      brand.title = state.workMode ? "点击恢复会话列表" : "点击切换工作目录";
      sideFoot.textContent = state.workMode ? coverStory.footer : "最近会话";
    }
    function renderTree(nodes, depth, base) {
      return nodes.map((node) => {
        const path = base ? `${base}/${node.name}` : node.name;
        const pad = 8 + depth * 14;
        const status = node.status ? `<span class="fs-git fs-git-${escapeAttr(String(node.status).toLowerCase())}">${escapeHtml(
          node.status
        )}</span>` : "";
        if (node.type === "dir") {
          const open = state.workExpanded.has(path);
          return `<div class="fs-node fs-dir" data-path="${escapeAttr(path)}" style="padding-left:${pad}px" title="${escapeAttr(
            node.name
          )}">
            <span class="fs-caret">${open ? "▾" : "▸"}</span><span class="fs-node-name">${escapeHtml(node.name)}</span>
          </div>${open ? renderTree(node.children ?? [], depth + 1, path) : ""}`;
        }
        const badge = fileBadge(node.name);
        const active = state.workSelected === path ? " active" : "";
        return `<div class="fs-node fs-file${active}" data-path="${escapeAttr(path)}" style="padding-left:${pad + 12}px" title="${escapeAttr(node.name)}">
          <span class="fs-ft fs-ft-${badge.cls}">${badge.label}</span><span class="fs-node-name">${escapeHtml(
          node.name
        )}</span>${status}
        </div>`;
      }).join("");
    }
    function renderWorkTree() {
      const branches = coverStory.branches.length ? coverStory.branches : [coverStory.branch];
      const menu = state.branchMenuOpen ? `<div class="fs-branch-menu">${branches.map(
        (branch) => `<div class="fs-branch-item${branch === state.branch ? " active" : ""}" data-branch="${escapeAttr(
          branch
        )}">${escapeHtml(branch)}</div>`
      ).join("")}</div>` : "";
      list.innerHTML = `<div class="fs-tree">
      <div class="fs-workspace" id="fs-workspace">
        <span class="fs-caret">${state.workCollapsed ? "▸" : "▾"}</span>
        <span class="fs-workspace-name">${escapeHtml(coverStory.workspace)}</span>
      </div>
      ${state.workCollapsed ? "" : `<div class="fs-branch" id="fs-branch">
              <span class="fs-branch-name">${escapeHtml(state.branch)}</span>
              <span class="fs-caret">▾</span>
              <span class="fs-branch-count">3 changes</span>
            </div>${menu}${renderTree(coverStory.tree, 0, "")}`}
    </div>`;
    }
    function renderConversationList() {
      if (!state.conversations.length) {
        const label = state.listError ? "加载失败" : state.dataLoaded ? "暂无话题" : "加载中…";
        list.innerHTML = `<div class="fs-empty"${state.listError ? ` title="${escapeAttr(state.listError)}"` : ""}>${label}</div>`;
        return;
      }
      list.innerHTML = state.conversations.map((conversation) => {
        const active = conversation.id === state.currentId ? " active" : "";
        const subtitle = conversation.subtitle || "";
        return `<div class="fs-item${active}" data-id="${escapeAttr(conversation.id)}" title="${escapeAttr(
          conversation.title
        )}">
          ${avatarMarkup(conversation.avatar, conversation.title, "fs-avatar", conversation.avatarFallback)}
          <div class="fs-item-main">
            <div class="fs-item-title">${escapeHtml(conversation.title)}</div>
            <div class="fs-item-sub">${escapeHtml(subtitle)}</div>
          </div>
          ${conversation.unread ? `<span class="fs-item-unread"></span>` : `<span class="fs-item-time">${escapeHtml(timeAgo(conversation.updatedAt))}</span>`}
        </div>`;
      }).join("");
    }
    function renderSidebar() {
      setBrandAndFoot();
      if (state.workMode) renderWorkTree();
      else renderConversationList();
    }
    function renderHead() {
      const conversation = conversationById(state.currentId);
      const title = state.workMode ? coverStory.fakeDocName : state.currentView?.title || conversation?.title || ctx?.title || "选择一个话题";
      const subtitle = state.workMode ? "工作文档" : state.currentView?.subtitle || conversation?.subtitle || "选择左侧会话开始阅读";
      if (state.workMode) {
        headCover.innerHTML = `<span class="fs-doc-icon">DOC</span>`;
      } else {
        const avatar = conversation?.avatar;
        headCover.innerHTML = avatar ? `<img src="${escapeAttr(avatar)}" alt="" loading="lazy">` : escapeHtml(firstChar(conversation?.avatarFallback || title));
      }
      headTitle.textContent = title;
      headSub.textContent = subtitle;
    }
    function renderContent2() {
      const view = state.currentView;
      if (!view) {
        content.innerHTML = `<div class="fs-empty">${state.listError ? `加载失败：${escapeHtml(state.listError)}` : "选择左侧会话开始阅读"}</div>`;
        return;
      }
      const more = view.hasMore && adapter.loadMore ? `<button class="fs-more" type="button">加载更多回复</button>` : "";
      content.innerHTML = `<div class="fs-doc">${sanitizeHtml(view.html)}${more}</div>`;
      const moreButton = content.querySelector(".fs-more");
      if (moreButton) {
        moreButton.addEventListener("click", () => void handleLoadMore(moreButton));
      }
      content.scrollTop = 0;
    }
    async function handleLoadMore(button) {
      const view = state.currentView;
      if (!view || !adapter.loadMore) return;
      const id = state.currentId;
      button.disabled = true;
      button.textContent = "加载中…";
      try {
        const result = await adapter.loadMore(id, view.cursor);
        if (state.currentId !== id || state.currentView !== view) return;
        const doc = content.querySelector(".fs-doc");
        if (!doc) return;
        const temp = document.createElement("div");
        temp.innerHTML = sanitizeHtml(result.html);
        while (temp.firstChild) doc.insertBefore(temp.firstChild, button);
        view.hasMore = result.hasMore;
        view.cursor = result.cursor;
        if (!result.hasMore) button.remove();
        else {
          button.disabled = false;
          button.textContent = "加载更多回复";
        }
      } catch (error) {
        button.disabled = false;
        button.textContent = "加载失败，重试";
        toast(`加载更多失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    async function openConversation(id) {
      if (!id) return;
      const token = ++state.openToken;
      state.currentId = id;
      renderSidebar();
      renderHead();
      content.innerHTML = `<div class="fs-loading">正在加载…</div>`;
      try {
        const view = await adapter.openConversation(id);
        if (token !== state.openToken) return;
        state.currentView = view;
        store.set("lastId", id);
        if (!state.conversations.some((conversation) => conversation.id === id)) {
          state.conversations.unshift({ id, title: view.title, subtitle: view.subtitle });
        }
        renderSidebar();
        renderHead();
        renderContent2();
      } catch (error) {
        if (token !== state.openToken) return;
        state.currentView = null;
        renderHead();
        content.innerHTML = `<div class="fs-empty">加载失败：${escapeHtml(
          error instanceof Error ? error.message : String(error)
        )}</div>`;
        toast("话题加载失败");
      }
    }
    async function ensureData() {
      if (state.dataLoaded) return;
      state.dataLoaded = true;
      try {
        state.conversations = await adapter.listConversations();
        state.listError = "";
      } catch (error) {
        state.dataLoaded = false;
        state.listError = error instanceof Error ? error.message : String(error);
        state.conversations = [];
        toast(`话题列表加载失败：${state.listError}`);
      }
      renderSidebar();
      const preferred = adapter.initialConversationId?.(ctx) || store.get("lastId", "");
      const inList = preferred && state.conversations.some((conversation) => conversation.id === preferred);
      const first = state.conversations[0]?.id ?? "";
      const id = inList ? preferred : preferred || first;
      if (id) {
        await openConversation(id);
      } else {
        renderContent2();
      }
    }
    async function refreshConversations() {
      try {
        state.conversations = await adapter.listConversations();
        state.listError = "";
        renderSidebar();
        if (!state.currentId && state.conversations[0]) {
          await openConversation(state.conversations[0].id);
        }
        toast("已刷新");
      } catch (error) {
        toast(`刷新失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    function applyLogsOnly() {
      app.classList.toggle("fs-logs-only", state.logsOnly);
      if (state.logsOnly) logBody.scrollTop = logBody.scrollHeight;
    }
    function toggleLogsOnly() {
      state.logsOnly = !state.logsOnly;
      store.set("logsOnly", state.logsOnly);
      applyLogsOnly();
    }
    function toggleWorkMode() {
      state.workMode = !state.workMode;
      store.set("workMode", state.workMode);
      updateTabTitle();
      renderSidebar();
      renderHead();
    }
    function exitMode() {
      state.enabled = false;
      store.set("enabled", false);
      stopLogFeed();
      setSiteHidden(false);
      app.style.display = "none";
      ball.hidden = false;
      restoreTabTitle();
    }
    function enterMode() {
      state.enabled = true;
      store.set("enabled", true);
      app.style.display = "flex";
      ball.hidden = true;
      setSiteHidden(true);
      updateTabTitle();
      startLogFeed();
      void ensureData();
    }
    function applyViewport() {
      if (window.innerWidth < minWidth) {
        app.style.display = "none";
        setSiteHidden(false);
        ball.hidden = true;
        return;
      }
      if (state.enabled) {
        app.style.display = "flex";
        ball.hidden = true;
        setSiteHidden(true);
      } else {
        app.style.display = "none";
        ball.hidden = false;
        setSiteHidden(false);
      }
    }
    function bindResizer(handle, getWidth, min, max, invert, onMove, onEnd) {
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = getWidth();
        const previousCursor = document.documentElement.style.cursor;
        const previousSelect = document.documentElement.style.userSelect;
        handle.classList.add("fs-dragging");
        document.documentElement.style.cursor = "col-resize";
        document.documentElement.style.userSelect = "none";
        const move = (moveEvent) => {
          const delta = (moveEvent.clientX - startX) * (invert ? -1 : 1);
          onMove(clamp(startWidth + delta, min, max()));
        };
        const finish = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", finish);
          window.removeEventListener("pointercancel", finish);
          handle.classList.remove("fs-dragging");
          document.documentElement.style.cursor = previousCursor;
          document.documentElement.style.userSelect = previousSelect;
          onEnd();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish, { once: true });
        window.addEventListener("pointercancel", finish, { once: true });
      });
    }
    function onKeydown(event) {
      if (!event.ctrlKey || !event.altKey || event.shiftKey || event.repeat) return;
      const key = String(event.key || "").toLowerCase();
      if (key !== "q" && event.code !== "KeyQ") return;
      if (!state.enabled) return;
      if (app.style.display === "none") return;
      if (isTypingTarget(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleLogsOnly();
    }
    function onContentClick(event) {
      const target = event.target;
      const anchor = target?.closest?.("a") ?? null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const url = new URL(href, location.href);
      if (adapter.conversationIdFromUrl) {
        const id = adapter.conversationIdFromUrl(url);
        if (id) {
          event.preventDefault();
          void openConversation(id);
          return;
        }
      }
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noreferrer");
    }
    list.addEventListener("click", (event) => {
      const target = event.target;
      if (!target) return;
      if (state.workMode) {
        const branchItem = target.closest(".fs-branch-item");
        if (branchItem) {
          state.branch = branchItem.getAttribute("data-branch") || coverStory.branch;
          state.branchMenuOpen = false;
          renderSidebar();
          return;
        }
        if (target.closest("#fs-branch")) {
          state.branchMenuOpen = !state.branchMenuOpen;
          renderSidebar();
          return;
        }
        if (target.closest("#fs-workspace")) {
          state.workCollapsed = !state.workCollapsed;
          state.branchMenuOpen = false;
          renderSidebar();
          return;
        }
        const node = target.closest(".fs-node");
        if (node) {
          const path = node.getAttribute("data-path") || "";
          const item2 = workIndex.get(path);
          if (item2) {
            if (item2.type === "dir") {
              if (state.workExpanded.has(path)) state.workExpanded.delete(path);
              else state.workExpanded.add(path);
            } else {
              state.workSelected = path;
            }
            renderSidebar();
          }
        }
        return;
      }
      const item = target.closest(".fs-item");
      if (item) {
        const id = item.getAttribute("data-id");
        if (id) void openConversation(id);
      }
    });
    brand.addEventListener("click", toggleWorkMode);
    refreshBtn.addEventListener("click", () => {
      if (state.workMode) {
        renderSidebar();
        return;
      }
      void refreshConversations();
    });
    headTitle.addEventListener("click", toggleLogsOnly);
    logBtn.addEventListener("click", toggleLogsOnly);
    exitBtn.addEventListener("click", exitMode);
    ball.addEventListener("click", enterMode);
    content.addEventListener("click", onContentClick);
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", () => {
      applyViewport();
      state.logWidth = clamp(state.logWidth, 220, maxLogWidth());
      logPane.style.width = `${state.logWidth}px`;
    });
    bindResizer(
      leftResizer,
      () => state.leftWidth,
      220,
      () => 460,
      false,
      (width) => {
        state.leftWidth = width;
        side.style.width = `${width}px`;
        side.style.flexBasis = `${width}px`;
      },
      () => {
        store.set("leftWidth", state.leftWidth);
        state.logWidth = clamp(state.logWidth, 220, maxLogWidth());
        logPane.style.width = `${state.logWidth}px`;
        store.set("logWidth", state.logWidth);
      }
    );
    bindResizer(
      logResizer,
      () => state.logWidth,
      220,
      () => maxLogWidth(),
      true,
      (width) => {
        state.logWidth = width;
        logPane.style.width = `${width}px`;
      },
      () => store.set("logWidth", state.logWidth)
    );
    injectHideStyle();
    applyWidths();
    applyLogsOnly();
    renderSidebar();
    renderHead();
    renderContent2();
    if (state.enabled) {
      app.style.display = "flex";
      ball.hidden = true;
      setSiteHidden(true);
      updateTabTitle();
      startLogFeed();
      void ensureData();
    } else {
      app.style.display = "none";
      ball.hidden = false;
      setSiteHidden(false);
    }
    registerMenu("进入/退出工作模式", () => {
      if (state.enabled) exitMode();
      else enterMode();
    });
    registerMenu("切换阅读区 / 日志（Ctrl+Alt+Q）", () => {
      if (state.enabled) toggleLogsOnly();
    });
    registerMenu("刷新话题列表", () => void refreshConversations());
    return {
      state,
      host,
      shadow,
      openConversation,
      toggleLogsOnly,
      toggleWorkMode,
      enterMode,
      exitMode
    };
  }

  // packages/adapters/v2ex/src/adapter.ts
  function toMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return number < 1e12 ? number * 1e3 : number;
  }
  function memberName(member) {
    return String(member?.username || "匿名用户");
  }
  function avatarUrl(member) {
    return String(member?.avatar_normal || member?.avatar_large || "");
  }
  function topicTitle(topic) {
    return String(topic.title || `#${topic.id}`).trim();
  }
  function nodeLabel(topic) {
    return String(topic.node?.title || topic.node?.name || "").trim();
  }
  var HTML_MARKER = /<(p|br|a|img|strong|b|em|i|u|s|del|ins|code|pre|blockquote|ul|ol|li|h[1-6]|span|div|table|thead|tbody|tr|td|th|hr|figure|figcaption|video|audio|source|iframe)\b[^>]*>/i;
  function renderContent(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (HTML_MARKER.test(raw)) return sanitizeCooked(raw);
    return `<p>${escapeHtml(raw).replace(/\r?\n/g, "<br>")}</p>`;
  }
  function buildPostHtml(member, content, created, floor, thanks = 0) {
    const name = memberName(member);
    const avatar = avatarUrl(member);
    const avatarHtml = avatar ? `<img class="fs-post-avatar" src="${escapeAttr(avatar)}" alt="" loading="lazy">` : `<span class="fs-post-avatar fs-post-avatar-letter">${escapeHtml(firstChar(name))}</span>`;
    const thanksHtml = thanks > 0 ? `<span class="fs-post-floor">· 感谢 ${thanks}</span>` : "";
    return `<section class="fs-post">
    <header class="fs-post-head">
      ${avatarHtml}
      <span class="fs-post-name">${escapeHtml(name)}</span>
      <span class="fs-post-floor">${escapeHtml(floor)}</span>
      ${thanksHtml}
      <span class="fs-post-time">${escapeHtml(timeAgo(toMs(created)))}</span>
    </header>
    <div class="fs-post-body">${renderContent(content)}</div>
  </section>`;
  }
  function latestToConversations(data) {
    const topics = Array.isArray(data) ? data : [];
    return topics.filter((topic) => topic && !topic.deleted).map((topic) => {
      const replies = Math.max(0, Number(topic.replies) || 0);
      const node = nodeLabel(topic);
      const subtitle = [`${replies} 回复`, node].filter(Boolean).join(" · ");
      return {
        id: String(topic.id),
        title: topicTitle(topic),
        subtitle,
        avatar: avatarUrl(topic.member),
        updatedAt: toMs(topic.last_touched || topic.created || topic.last_modified)
      };
    });
  }
  function parseTopic(topic, replies) {
    const title = topicTitle(topic);
    const list = (Array.isArray(replies) ? replies : []).slice().sort((a, b) => (Number(a.created) || 0) - (Number(b.created) || 0));
    const replyCount = Math.max(Number(topic.replies) || 0, list.length);
    const node = nodeLabel(topic);
    const meta = [`${replyCount} 回复`, node, timeAgo(toMs(topic.created))].filter(Boolean).join(" · ");
    const html = `<h1 class="fs-topic-title">${escapeHtml(title)}</h1><div class="fs-topic-meta">${escapeHtml(meta)}</div>` + buildPostHtml(
      topic.member,
      topic.content_rendered || topic.content,
      topic.created,
      "楼主"
    ) + list.map(
      (reply, index) => buildPostHtml(
        reply.member,
        reply.content_rendered || reply.content,
        reply.created,
        `#${index + 1}`,
        Number(reply.thanks) || 0
      )
    ).join("");
    return {
      title,
      subtitle: meta,
      html,
      hasMore: false
    };
  }
  function topicIdFromPath(pathname) {
    const match = pathname.match(/^\/t\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
  }
  function nodeNameFromPath(pathname) {
    const match = pathname.match(/^\/go\/([^/]+?)(?:\/|$)/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  function listApiPath(pathname) {
    const node = nodeNameFromPath(pathname);
    if (node) return `/api/topics/show.json?node_name=${encodeURIComponent(node)}`;
    return "/api/topics/latest.json";
  }
  function isSupportedPath(pathname) {
    if (!pathname || pathname === "/") return true;
    return /^\/recent(?:\/|$)/.test(pathname) || /^\/t\/\d+(?:\/|$)/.test(pathname) || /^\/go\/[^/]+(?:\/|$)/.test(pathname);
  }
  async function fetchJson(path) {
    const response = await fetch(path, {
      credentials: "include",
      headers: { accept: "application/json, text/plain, */*" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data && !Array.isArray(data) && (data.error || Array.isArray(data.errors) && data.errors.length)) {
      throw new Error(data.error || data.errors?.join("；") || "接口返回错误");
    }
    return data;
  }
  var VIEW_CACHE_MS = 6e4;
  var viewCache = /* @__PURE__ */ new Map();
  function conversationIdFromUrl(url) {
    return topicIdFromPath(url.pathname);
  }
  var v2exAdapter = {
    id: "v2ex",
    label: "V2EX",
    normalTitle: "微信",
    match(url) {
      return url.hostname === "v2ex.com" || url.hostname === "www.v2ex.com";
    },
    async detect() {
      const url = new URL(location.href);
      if (!this.match(url) || !isSupportedPath(url.pathname)) return null;
      return {
        url: location.href,
        canonicalId: topicIdFromPath(url.pathname) || nodeNameFromPath(url.pathname) || "latest",
        title: document.title
      };
    },
    initialConversationId() {
      return topicIdFromPath(new URL(location.href).pathname);
    },
    conversationIdFromUrl,
    async listConversations() {
      return latestToConversations(await fetchJson(listApiPath(location.pathname)));
    },
    async openConversation(id) {
      const cached = viewCache.get(id);
      if (cached && Date.now() - cached.at < VIEW_CACHE_MS) return cached.view;
      const topics = await fetchJson(`/api/topics/show.json?id=${encodeURIComponent(id)}`);
      const replies = await fetchJson(
        `/api/replies/show.json?topic_id=${encodeURIComponent(id)}`
      );
      const topic = Array.isArray(topics) ? topics[0] : null;
      if (!topic) throw new Error("主题不存在或已删除");
      if (topic.deleted) throw new Error("主题已被删除");
      const view = parseTopic(topic, Array.isArray(replies) ? replies : []);
      viewCache.set(id, { at: Date.now(), view });
      return view;
    }
  };
  var tree = [
    {
      name: "src",
      type: "dir",
      children: [
        {
          name: "api",
          type: "dir",
          children: [
            { name: "topics.ts", type: "file", status: "M" },
            { name: "replies.ts", type: "file" }
          ]
        },
        {
          name: "services",
          type: "dir",
          children: [
            { name: "feed.ts", type: "file", status: "M" },
            { name: "sanitize.ts", type: "file" }
          ]
        },
        {
          name: "components",
          type: "dir",
          children: [
            { name: "TopicList.tsx", type: "file" },
            { name: "PostView.tsx", type: "file", status: "M" }
          ]
        },
        {
          name: "config",
          type: "dir",
          children: [{ name: "app.yaml", type: "file" }]
        }
      ]
    },
    {
      name: "scripts",
      type: "dir",
      children: [
        { name: "deploy.sh", type: "file" },
        { name: "migrate.sql", type: "file", status: "D" }
      ]
    },
    { name: "package.json", type: "file" },
    { name: "README.md", type: "file", status: "U" }
  ];
  var v2exCoverStory = {
    workspace: "content-service",
    branch: "main",
    branches: ["main", "develop", "release/2026.11"],
    footer: "Node 22 · pnpm · main",
    fakeDocName: "content-spec.pdf",
    tabTitle: "content-spec.pdf · 工作目录",
    tree
  };

  // packages/adapters/v2ex/src/index.ts
  void startApp(v2exAdapter, v2exCoverStory);
})();
