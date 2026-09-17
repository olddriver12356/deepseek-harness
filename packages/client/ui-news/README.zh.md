# @deepseek-ai/dsh-client-ui-news

[English](README.md) | 中文

Web 新闻应用面板注册持久的 `shell.app-overlay`，跟随 `ctx.appPanels`，通过共享 `api-remotes` 组装读取 Host News Remote。经批准的双栏编辑式布局展示近期 AI 新闻、工具和模型发布，并提供加载、空列表、错误、刷新和图片回退状态。

挂载 Knowledge Remote 时，每张卡片提供不调用模型的保存和显式蒸馏操作。蒸馏先把 feed 提供的标题、摘要和来源保存到 Intake，再调用隔离的 Knowledge 处理器，不抓取文章全文。加载期间禁止重复点击，错误可重试。成功产物停留在 Processed 等待用户审阅。按钮不会批准、标记学会或发布卡片。操作标签跟随应用语言。

## Model Experience

间接影响：面板将用户明确请求的蒸馏委托给 Knowledge Host，自身不组装模型请求。

#### KV Cache effect

无；feed 与缩略图缓存由 Host News 包拥有，不进入模型请求。

## Known Limitations and Deferred Work

- **公开 feed 可变性**：发布方可用性和页面结构可能独立变化，刷新失败时 Host 保留最近成功的快照。
- **只读链接**：新闻卡片在新标签页打开发布方 URL；书签和应用内文章阅读不属于此迁移。
