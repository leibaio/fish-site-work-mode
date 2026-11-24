# Changelog

## 0.7.0 — 2026-11-24

优化 linux.do 左栏话题数量。

### 新增

- 会话列表分页接口：`SiteAdapter.listConversations()` 可以返回 `ConversationPage`，并可选实现 `loadMoreConversations(cursor)`
- 左栏底部新增「加载更多话题」按钮，加载后保持滚动位置并去重
- linux.do 首次加载最新话题第 1、2 页（约 60 条），之后按页继续加载
- linux.do 修正分页起点：从 `page=0`（第 1 页）开始，不再跳过最前面的话题
- 新增 linux.do 两页合并、侧栏加载更多、`autoOpenFirst` 等测试，测试总数 39

## 0.6.0 — 2026-11-23

新增豆瓣小组适配器。

### 新增

- 豆瓣小组适配器：
  - `/group/` 讨论精选：解析 `.channel-item` 标题、小组、时间、喜欢数、配图
  - `/group/topic/<id>/`：解析楼主正文、作者、头像、时间，以及 `.comment-item` 回复楼层
  - 从精选页打开话题：先同源 fetch 并解析；遇到 403/登录墙时跳转到话题页，由 live DOM 接管
  - 评论图片、正文图片走统一清洗与绝对 URL 处理
- 新增豆瓣工作伪装：`editorial-service`、TypeScript 文件树、`editorial-notes.pdf`
- 构建脚本支持第七个站点，CI 校验并上传全部产物
- 新增豆瓣适配器测试，测试总数 35

### 说明

- 当前只支持豆瓣小组的讨论精选和话题页；具体小组页、电影/图书/音乐条目页暂未接管

## 0.5.0 — 2026-11-23

新增知乎、微博 live DOM 适配器。

### 新增

- 知乎（live DOM）适配器：
  - 问题页 `/question/<qid>`：读取当前已渲染的回答列表、作者、头像、赞同数、时间
  - 回答页 `/question/<qid>/answer/<aid>`：优先打开 URL 指定回答
  - 首页 `/`、`/hot`：读取 TopstoryItem / FeedItem 推荐卡片
  - 不伪造 `x-zse-96`，不请求未授权的跨页数据
- 微博（live DOM）适配器：
  - 首页 `/`、`/hot`、个人页、状态详情：读取已经渲染的时间线卡片
  - 解析正文、作者、头像、图片、视频、转发内容
  - 不伪造 XSRF，不请求未授权的跨页数据
- 新增公共 DOM 工具：`waitForSelector`、`firstText`、`topLevel`、`cleanElement`、`absolutizeMedia`、`parseCount`
- 知乎工作伪装：`research-service`、Python 文件树、`research-notes.pdf`
- 微博工作伪装：`media-service`、TypeScript 文件树、`media-spec.pdf`
- 正文样式补充标题、列表、分隔线、figure、video
- 构建脚本支持六个站点，CI 校验并上传全部产物
- 新增知乎、微博适配器测试，测试总数 31

### 说明

- 知乎/微博只读取当前页面已经渲染出来的内容；翻页、无限滚动和登录墙不会自动接管

## 0.4.0 — 2026-11-23

新增虎扑适配器。

### 新增

- 虎扑（BBS）站点适配器：
  - `GET /bxj`、`GET /topic-daily` 读取步行街帖子列表
  - `GET /<tid>.html` 读取帖子与首屏回复
  - `GET /<tid>-<page>.html` 加载后续回复
  - 过滤“这些回帖亮了”重复区，只保留正式回复列表
  - 保留引用块、图片、视频；图片懒加载属性自动还原
  - 帖子页会跟随面包屑里的父版块刷新左栏
  - 分页楼层号按已加载回复数连续编号
- 新增虎扑工作伪装覆盖：`sports-service` workspace、TypeScript 文件树、`sports-spec.pdf`
- 正文样式支持 `video`，视频按阅读区宽度自适应
- 构建脚本支持第四个站点，`npm run build` 一次构建四个用户脚本
- CI 校验全部 `dist` 产物并上传四个用户脚本
- 新增虎扑适配器测试，测试总数 23

## 0.3.0 — 2026-11-23

新增 Chiphell 适配器。

### 新增

- Chiphell（Discuz X3.5）站点适配器：
  - `GET /forum-<fid>-1.html` 读取版块帖子列表，首页默认 fid=146（电脑讨论）
  - `GET /thread-<tid>-1-1.html` 读取帖子与首屏楼层
  - `GET /forum.php?mod=viewthread&tid=<tid>&page=<n>` 加载后续楼层
  - 自动解析楼层号、作者、头像、发帖时间、查看/回复数
  - 自动把 Discuz 的 `file` / `zoomfile` 懒加载图片还原为真实 `src`
  - 帖子页会跟随当前帖子所在版块刷新左栏
- `Conversation.avatarFallback`：没有头像的站点可以用作者名生成文字头像
- 新增 Chiphell 工作伪装覆盖：`hardware-service` workspace、Go 文件树、`hardware-spec.pdf`
- 构建脚本支持第三个站点，`npm run build` 一次构建 linux.do、V2EX、Chiphell
- CI 校验全部 `dist` 产物并上传三个用户脚本
- 新增 Chiphell 适配器测试，测试总数 19

### 变更

- 用户脚本名称统一为「工作台 · 站点」
- 项目描述和 README 同步更新

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