# @deepseek-ai/dsh-host-news

[English](README.md) | 中文

News Host 服务抓取 News 面板使用的公开 RSS 源，在本地保留六小时缓存，归档来源三天窗口内观察到的全部去重条目，并通过生成的 `news/list` Remote 为每栏提供最新十条。可见条目的 RSS 没有图片时，服务会尝试读取文章声明的封面图。

图片路由是 `/news/image`。只有当 News 缓存中存在完全匹配的图片 URL 与文章 URL 时才会响应。下载图片缓存七天，大小上限为 6 MB，因此该路由不会成为开放代理。

`cacheDir` 是 deployment-local feed 与 thumbnail cache。`vaultRoot` 选择 Obsidian Vault，服务会把记录追加到 `Resources/AI News/news.jsonl`。`refreshIntervalMs` 默认六小时，且不能低于一分钟。Web bundle 提供 `dshHomePath('news-cache')`，并从 `DSH_VAULT_ROOT` 读取 Vault root，未设置时回退到启动目录。

Host 在启动时检查 feed，之后只要 Host 仍在运行，就通过 Cordis timer 周期检查。Archive 只包含确定性的 feed metadata，不产生 model turn。记录按 feed 栏目与精确 article URL 去重。已有 JSONL archive 格式错误时会 fail closed，不会越过潜在损坏继续追加。抓取失败且存在有效 UI cache 时会返回旧 cache；archive 写入失败仍视为 refresh failure。

## Model Experience

None。此包只提供浏览器 News feed，不组装模型输入、工具或 provider 请求。

#### KV Cache effect

None；缓存属于浏览器 News surface，不会进入模型请求。

## Known Limitations and Deferred Work

- **仅公开 feed**：源站可用性、限流和发布方 markup 都可能独立变化。
- **仅在 Host 生命周期内采集**：周期抓取只在 Host process 运行时执行，不是常驻 external scheduler。
- **线性 archive scan**：每次 archive append 都扫描 JSONL 来查找已有 URL。只有实测 archive 大小使六小时扫描产生明显成本时才增加 index。
