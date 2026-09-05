# @deepseek-ai/dsh-host-news

[English](README.md) | 中文

News Host 服务抓取 News 面板使用的公开 RSS 源，在本地保留六小时缓存，只返回最近三天内的最新条目，并通过生成的 `news/list` Remote 提供结果。RSS 没有图片时，服务会尝试读取文章声明的封面图。

图片路由是 `/news/image`。只有当 News 缓存中存在完全匹配的图片 URL 与文章 URL 时才会响应。下载图片缓存七天，大小上限为 6 MB，因此该路由不会成为开放代理。

必填配置 `cacheDir` 由部署提供；Web bundle 使用 `dshHomePath('news-cache')`。

## Model Experience

None。此包只提供浏览器 News feed，不组装模型输入、工具或 provider 请求。

#### KV Cache effect

None；缓存属于浏览器 News surface，不会进入模型请求。

## Known Limitations and Deferred Work

- **仅公开 feed**：源站可用性、限流和发布方 markup 都可能独立变化。
- **按需刷新**：六小时 cadence 在 Remote 读取时执行；全局 Host feed 不创建后台 agent schedule。
