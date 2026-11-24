export const STYLES = `
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
.fs-list-more {
  display: block; width: calc(100% - 24px); margin: 8px 12px 12px; padding: 7px 0;
  border: 1px solid #e2e2e2; border-radius: 6px; background: #fff; color: #666;
  font-size: 12px; cursor: pointer;
}
.fs-list-more:hover { background: #f0f0f0; }
.fs-list-more[disabled] { opacity: .6; cursor: default; }
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
.fs-post-body h1, .fs-post-body h2, .fs-post-body h3, .fs-post-body h4, .fs-post-body h5, .fs-post-body h6 {
  margin: 1.2em 0 .5em; line-height: 1.4; font-weight: 600;
}
.fs-post-body h1 { font-size: 1.5em; }
.fs-post-body h2 { font-size: 1.3em; }
.fs-post-body h3 { font-size: 1.15em; }
.fs-post-body ul, .fs-post-body ol { margin: .6em 0 .8em 1.4em; }
.fs-post-body li { margin: .2em 0; }
.fs-post-body hr { border: 0; border-top: 1px solid #eee; margin: 1.2em 0; }
.fs-post-body figure { margin: 1em 0; }
.fs-post-body figcaption { margin-top: 6px; color: #999; font-size: 12px; text-align: center; }
.fs-post-body img {
  max-width: min(100%, 360px); max-height: 280px; width: auto; height: auto;
  object-fit: contain; border-radius: 4px; cursor: zoom-in; background: #f7f7f7;
  vertical-align: middle; margin: 3px 0;
}
.fs-post-body video { max-width: 100%; height: auto; border-radius: 4px; }
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
.fs-ft-py { background: #3776ab; }
.fs-ft-txt { background: #b0b5bd; }
.fs-git { flex: 0 0 auto; margin-left: 2px; font: 10px Consolas, monospace; }
.fs-git-m { color: #d19a66; }
.fs-git-u { color: #07c160; }
.fs-git-d { color: #c0392b; }

/* ---------- 只看日志 ---------- */
.fs-app.fs-logs-only .fs-main,
.fs-app.fs-logs-only .fs-log-resizer { display: none; }
.fs-app.fs-logs-only .fs-logpane { flex: 1 1 auto; width: auto !important; }

/* ---------- 图片灯箱 ---------- */
.fs-lightbox {
  position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.82); pointer-events: auto; cursor: zoom-out;
}
.fs-lightbox[hidden] { display: none; }
.fs-lightbox-img {
  max-width: 92vw; max-height: 92vh; object-fit: contain; border-radius: 4px;
  box-shadow: 0 12px 40px rgba(0,0,0,.45); cursor: zoom-out;
}
.fs-lightbox-close {
  position: absolute; top: 16px; right: 20px; width: 34px; height: 34px; border: 0;
  border-radius: 50%; background: rgba(255,255,255,.16); color: #fff; font-size: 22px;
  line-height: 34px; cursor: pointer;
}
.fs-lightbox-close:hover { background: rgba(255,255,255,.28); }
.fs-app.fs-lightbox-open .fs-content { overflow: hidden; }

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