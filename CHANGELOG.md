# Changelog

## 0.2.0 — 2026-11-23

新增 V2EX 适配器。

### 新增

- V2EX 站点适配器：
  - `GET /api/topics/latest.json` 拉取最近话题
  - `GET /api/topics/show.json?node_name=<node>` 读取节点话题
  - `GET /api/topics/show.json?id=<id>` 读取主题
  - `GET /api/replies/show.json?topic_id=<id>` 读取全部回复
  - 从 `/t/<id>` 进入时优先打开当前主题
  - 主题正文 + 全部回复，显示楼主 / 楼层 / 感谢数
  - 支持 `/go/<node>` 节点页作为左栏话题来源
- 新增 V2EX 工作伪装覆盖：`content-service` workspace、TypeScript 文件树、`content-spec.pdf`
- 构建脚本支持多站点，`npm run build` 一次构建 linux.do 与 V2EX
- CI 校验全部 `dist` 产物并上传两个用户脚本
- 新增 V2EX 适配器测试，测试总数 15

## 0.1.0 — 2026-11-20

首个可用版本：linux.do 适配器 + 多站点工作台内核。

### 新增

- `packages/core` 多站点工作台：左栏会话 / 中间阅读区 / 右侧运行日志
- 左右分栏宽度可拖动，宽度与各开关状态持久化
- `Ctrl+Alt+Q` 切换阅读区与全屏日志
- 工作目录伪装：workspace、分支下拉、文件树、Git 标记、假文档名、Tab 标题与 favicon
- 点击「微信」/「工作目录」在会话列表与工作树之间切换
- `⏏` 退出后保留悬浮球，可随时恢复
- linux.do（Discourse）首个适配器：
  - `GET /latest.json?page=1` 拉取最近话题
  - `GET /t/<id>.json` 读取话题与楼层
  - `GET /t/<id>/posts.json?post_ids[]=...` 分批加载更多回复
  - 从 `/t/...` 进入时优先打开当前话题
  - 站内话题链接在工作台内切换
- 正文 HTML 清洗：移除脚本、iframe、事件属性、`id`、行内样式、`fs-*` 类名和危险 URL
- 本地模拟运行日志，支持后续替换为真实日志 Provider
- 测试与构建：TypeScript + Vitest + esbuild，产物 `dist/linuxdo-work-mode.user.js`

### 已知限制

- 只读：不支持发帖、回复、点赞、收藏
- 左栏仅「最新」第一页，暂无分类、搜索、通知
- 日志默认模拟，linux.do 版本尚未接入真实日志源
- 尚未在真实 linux.do 页面完成完整回归（开发环境访问受 Cloudflare 限制）