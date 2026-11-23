# fish-site-work-mode

[![CI](https://github.com/leibaio/fish-site-work-mode/actions/workflows/ci.yml/badge.svg)](https://github.com/leibaio/fish-site-work-mode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

多站点「摸鱼工作模式」：把论坛、社区网站包装成一个安静的工作台。

页面被替换成三栏布局：

```text
┌────────────────┬──────────────────────────────┬────────────────┐
│ 微信 / 工作目录   │  community-spec.pdf           │  运行日志        │
│                │                              │                │
│ 话题列表 / 文件树 │  正文、帖子、文档               │  INFO / WARN …  │
│                │                              │                │
└────────────────┴──────────────────────────────┴────────────────┘
```

- **左栏**：最近会话（伪装模式下变成 IDE 风格的工作目录）
- **中间**：阅读区（正文、帖子、文档）
- **右侧**：持续滚动的运行日志

目前已实现两个站点适配器：**linux.do** 和 **V2EX**。其余站点（小红书、Chiphell、知乎、虎扑、微博）共用 `packages/core`，按 `docs/MODE-BLUEPRINT.md` 里的适配器接口逐个补齐即可。

---

## 功能

### 布局

- 三栏：最近话题 / 阅读区 / 运行日志
- 左栏和日志栏宽度都可以鼠标拖动调节，宽度会记在本地
- 点击顶栏标题、`日志` 按钮，或按 `Ctrl+Alt+Q`，在「阅读区」和「只看日志」之间切换
- 窗口宽度小于 1000px 时不接管页面
- 右上角 `⏏` 退出后，右下角保留一个悬浮球，点击恢复

### 工作伪装

- 点击左上角「微信」字样，切换成「工作目录」
- 左栏变成 IDE 风格文件树：workspace、分支下拉、文件类型徽标、Git 修改标记
- 顶栏文档名变成各站点自己的假文档（linux.do 为 `community-spec.pdf`，V2EX 为 `content-spec.pdf`），浏览器标签标题和 favicon 同步替换
- 再点一次恢复原来的会话列表和页面标题

伪装只是本地视觉层，不会修改任何服务端数据，也不会影响你在站点上的真实账号状态。

### 阅读

- 打开 linux.do 话题 / V2EX 主题时，自动读取当前内容；从首页进入时展示最近话题
- 帖子按楼层排序，保留站点正文 HTML（代码块、引用、图片、表格、链接）
- 站内话题链接点击后，在本工作台内切换，不跳出页面
- linux.do 长话题（超过首屏 20 楼）底部提供「加载更多回复」，分批拉取
- V2EX 通过公开 API 一次性读取主题与全部回复
- 站内链接默认新标签打开，不打断当前阅读

### 日志

- linux.do / V2EX 版本默认使用本地模拟日志（通用的服务运行日志，不包含任何真实业务数据）
- 日志区域在「只看日志」模式下会占满屏幕，适合把窗口摆在工位上
- 日志上限 400 行，自动滚动到底部

---

## 安装

### 直接安装（推荐）

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 按需安装站点脚本：
   - linux.do：[dist/linuxdo-work-mode.user.js](https://github.com/leibaio/fish-site-work-mode/raw/main/dist/linuxdo-work-mode.user.js)
   - V2EX：[dist/v2ex-work-mode.user.js](https://github.com/leibaio/fish-site-work-mode/raw/main/dist/v2ex-work-mode.user.js)
3. Tampermonkey 弹出安装页后点「安装」
4. 打开对应站点（<https://linux.do/> 或 <https://www.v2ex.com/>），脚本会自动接管

脚本头里已经写入 `@updateURL` / `@downloadURL`，之后发新版本时 Tampermonkey 会自动检查更新。

### 本地构建

```bash
git clone https://github.com/leibaio/fish-site-work-mode.git
cd fish-site-work-mode
npm install
npm run build
```

产物：`dist/linuxdo-work-mode.user.js`、`dist/v2ex-work-mode.user.js`。也可以打开 Tampermonkey 面板 →「添加新脚本」，把对应产物全文粘贴进去。

### 开发命令

```bash
npm run typecheck   # TypeScript 类型检查
npm test            # Vitest（jsdom）单元/集成测试
npm run test:watch  # 监听模式
npm run build       # 构建全部站点用户脚本
npm run build:linuxdo  # 只构建 linux.do
npm run build:v2ex     # 只构建 V2EX
npm run check       # typecheck + test + build
```

---

## 目录结构

```text
packages/
  core/                 # 与站点无关的壳、样式、日志、工具
    src/types.ts        # SiteAdapter / ContentView / CoverStory 等接口
    src/shell.ts        # 三栏布局、路由、交互、Tab 伪装
    src/styles.ts       # 全部视觉样式（fs- 前缀）
    src/logs.ts         # 模拟日志 Provider
    src/storage.ts      # GM_* / localStorage 存储封装
    src/utils.ts        # HTML 清洗、时间、转义等
  adapters/
    linuxdo/            # linux.do（Discourse）适配器
      src/adapter.ts    # latest.json / t/<id>.json / posts.json
      src/index.ts      # 入口：startApp(linuxdoAdapter, linuxdoCoverStory)
    v2ex/               # V2EX 适配器
      src/adapter.ts    # topics/latest、topics/show、replies/show
      src/index.ts      # 入口：startApp(v2exAdapter, v2exCoverStory)
  build/
    build.mjs           # esbuild 打包 + 用户脚本头
tests/
  linuxdo-adapter.test.ts
  v2ex-adapter.test.ts
  core.test.ts
  utils.test.ts
docs/
  MODE-BLUEPRINT.md     # 多站点复用蓝图（架构、数据路线、站点矩阵）
dist/
  linuxdo-work-mode.user.js
  v2ex-work-mode.user.js
```

---

## 数据来源

全部是站点自身的只读接口，使用当前浏览器登录态（`credentials: "include"`），不伪造签名、不调用第三方接口。

### linux.do

| 用途 | 接口 |
| --- | --- |
| 最近话题 | `GET /latest.json?page=1` |
| 话题详情 | `GET /t/<topicId>.json` |
| 加载更多楼层 | `GET /t/<topicId>/posts.json?post_ids[]=...` |

### V2EX

| 用途 | 接口 |
| --- | --- |
| 最近话题 / 节点话题 | `GET /api/topics/latest.json`、`GET /api/topics/show.json?node_name=<node>` |
| 主题详情 | `GET /api/topics/show.json?id=<topicId>` |
| 全部回复 | `GET /api/replies/show.json?topic_id=<topicId>` |

如果接口因未登录、权限、Cloudflare 验证、限频等原因失败，阅读区会显示错误提示，不会静默吞掉，也不会绕过站点权限。

---

## 新增一个站点

1. 在 `packages/adapters/<site>/src/` 下实现 `SiteAdapter`：
   - `match` / `detect`：什么时候接管页面
   - `listConversations`：左栏数据
   - `openConversation`：中间阅读区 HTML
   - `loadMore`（可选）：分页
   - `conversationIdFromUrl`（可选）：站内链接改走工作台
   - `createLogProvider`（可选）：接真实日志，返回 `null` 时自动用模拟日志
2. 定义 `CoverStory`：workspace 名、分支、文件树、假文档名、Tab 标题
3. 入口文件调用 `startApp(adapter, coverStory)`
4. 在 `packages/build/build.mjs` 的 `sites` 里登记名称和 `@match`
5. 补测试，运行 `npm run build`

具体设计取舍、各站点可用的数据路线、检测与接管策略，见 [docs/MODE-BLUEPRINT.md](docs/MODE-BLUEPRINT.md)。

### 路线图

| 站点 | 状态 | 备注 |
| --- | --- | --- |
| linux.do | ✅ 可用 | Discourse，JSON 接口稳定 |
| V2EX | ✅ 可用 | 公开 JSON API，主题 + 全部回复 |
| 小红书 | 计划 | 需要处理签名接口，优先 DOM 路线 |
| Chiphell | 计划 | 传统论坛，DOM 解析为主 |
| 知乎 | 计划 | 登录态严格，建议只读 DOM |
| 虎扑 | 计划 | DOM / 移动端接口 |
| 微博 | 计划 | 信息流结构变化频繁，需要容错 |

---

## 已知限制

- linux.do / V2EX 都是**只读**的：可以浏览、翻页、切换话题，但不能发帖、回复、点赞、收藏
- linux.do 左栏只拉取「最新」第一页；V2EX 节点页通过 API 拉取该节点最新 10 条，暂未做翻页
- V2EX 的回复由公开 API 一次性返回；超长主题如果被服务端截断，工作台不会自动补页
- 伪装只覆盖前端，不改变浏览器历史记录里的真实 URL
- 站点改版或接口限频后，对应适配器可能需要同步调整

---

## 合规说明

- 只读取当前登录用户本来就能看到的内容，不绕过权限、不抓取私有数据
- 不自动发帖、不批量操作、不模拟用户行为
- 所有请求都发往站点自身域名，不经过第三方服务器
- 工作目录、日志、文档名等都是本地视觉伪装，不伪造站内身份或他人信息

---

## 发布新版本

`dist/*.user.js` 会随仓库一起提交，方便直接通过 Raw 链接安装。发版步骤：

```bash
# 1. 修改 package.json 的 version，并更新 CHANGELOG.md
npm run check
git add dist package.json CHANGELOG.md
git commit -m "chore: release v0.2.1"
git tag v0.2.1
git push origin main --tags
```

CI 会校验提交的 `dist` 与源码构建结果一致。也可以在 GitHub Releases 里附上两个 `.user.js` 作为附件。

---

## 致谢

- [xhs-wechat-mode](https://github.com/jjb4150/xhs-wechat-mode)：微信聊天式页面的交互参考，MIT
- [linux.do](https://linux.do/)：Discourse 社区，第一个适配对象
- [V2EX](https://www.v2ex.com/)：公开 JSON API 的社区，第二个适配对象
- 多站点架构与路线设计见 [docs/MODE-BLUEPRINT.md](docs/MODE-BLUEPRINT.md)

## License

[MIT](LICENSE)