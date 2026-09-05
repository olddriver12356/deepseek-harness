# Agent Note: News page Host and Client boundary

[English](2026-09-04-news-page-host-client-boundary.md) | 中文

Status: implemented

## Problem

已批准的 News 页面迁移需要进入 DSH Web profile，同时让公开 feed 抓取、缓存、图片处理和浏览器展示留在各自所属的 plane。

## Decision

Web profile 现在以 `news` Host row 挂载 `@deepseek-ai/dsh-host-news`，配置 `cacheDir: dshHomePath('news-cache')`，通过 `@deepseek-ai/dsh-api-remotes` 挂载生成的 `news/list` Remote，并把 `@deepseek-ai/dsh-client-ui-news` 注册到可追加的 `shell.overlay` slot。Host 负责六小时 feed 缓存、三天和十条上限、文章封面补全，以及带七天 thumbnail cache 和 6 MB 响应上限的精确配对 `/news/image` 路由。Client 负责已批准的双列面板、`appPanels` gating、loading、empty、error、refresh 和图片 fallback 状态。Client 只消费 Remote assembly，不维护第二份权威 feed cache。

## Alternatives considered

**Client-side feed fetching：**拒绝，因为浏览器 CORS、缓存权威性和发布方图片策略会移入 UI，使页面依赖 deployment 环境。

**Scheduled background feed job：**拒绝，因为 feed 是 deployment-global，而现有 schedule capability 是 agent-scoped；Remote 读取时执行六小时 cadence 已足够。

**直接 hotlink 发布方图片：**拒绝，因为浏览器会绕过 DSH 的精确文章/图片关系和大小控制；卡片统一使用 same-origin `/news/image` 路由。

## Consequences

Web bundle 增加一个 Host cache directory 和一个 browser overlay occupant，API Remote 仍是 Client 的唯一访问路径。Feed 可用性和发布方 markup 仍属于外部限制；已有有效 cache 时，刷新失败会返回最后一份有效快照。解析器使用 standard library，不新增 XML dependency，因此只支持声明源所需的 RSS 和 Atom 字段，而不是任意 XML。

## Testing

Host focused tests 覆盖 RSS/Atom 解析、markup 和 entity 清理、三天过滤、去重及十条上限。Client focused tests 覆盖 active-panel loading、双列、refresh 和 error 展示。`verify-cordis-config` 验证 130 个 assembled config files，host 和 client aggregate `tsc` 均通过，两个 library faces 均构建成功，Web profile dump 包含 `news`、`api-remotes` 和 `ui-news` rows。
