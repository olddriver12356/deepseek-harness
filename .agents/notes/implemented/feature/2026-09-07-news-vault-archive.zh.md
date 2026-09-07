# Agent Note: News Vault archive

[English](2026-09-07-news-vault-archive.md) | 中文

Status: implemented

## Problem

Host cache 每个 News 栏目只保留最新十条，而且仅在 Remote 被读取时刷新。随着三天 source window 前进，从未显示或查看的条目会消失，尽管保留这些确定性 feed metadata 的成本很低。

## Decision

每次 archive 写入还会导出缺失的 Markdown 笔记并更新 Vault 中 `AI News.md` 的标记区域，不调用模型。已有文章文件保持不变，旧导出通过 URL/栏目 frontmatter 识别。即使没有新的 feed 条目，重放已有记录仍可修复缺失的导出。JSONL 保持权威；笔记或索引写入失败会向上传播，并在下一次 archive 操作重试。按路径的进程内队列让 cache backfill 与 crawl 写入串行执行；多个 Host process 不得共用同一 archive。

News Host 现在会在启动时及之后每六小时通过 Cordis timer 检查 feeds。每次成功抓取都会保留现有的最新十条 UI projection，并把 source window 内观察到的全部去重条目追加到 `<vaultRoot>/Resources/AI News/news.jsonl`。每条 JSONL record 保存 schema version、栏目 kind、fetch time、title、精确 URL、source、publication time 和 summary，不保存图片。去重键是栏目 kind 与精确 URL，因此整个过程不需要 model turn；同一 URL 出现在两个栏目时仍会分别保留。

已有 archive 的任意非空行格式错误时会 fail closed。Remote refresh 与 timer 共享一个 in-flight crawl；抓取失败且存在有效 UI cache 时仍返回旧 cache。Archive 失败不会被手动 refresh 报告为成功。

## Alternatives considered

**仅 JSONL 存储：**无法满足用户在 Obsidian 中阅读的需求。逐条 Markdown 是确定性的投影；URL/栏目 hash 区分清理后的文件名，exclusive creation 保留手动编辑。

**Database 或 secondary URL index：**延期，因为每六小时顺序扫描一次 JSONL 是更小的系统。只有实测 archive 大小使扫描成本明显时才增加 index。

**Agent Schedule capability：**拒绝，因为 News 采集是 deployment-global，且不需要 model turn。Cordis timer 才具有正确的 Host lifecycle。

## Consequences

未查看的 feed 条目会在 UI window 之外继续保存在 append-only、portable Vault file 中，并提供独立 Obsidian 阅读笔记。采集只在 Host process 运行时发生，archive 与 note scan 成本随保留记录线性增长。这些文件仍是 raw intake，不是 curated knowledge。

## TDD evidence

Focused tests 要求归档完整 source window 而 UI 只显示十条、不同栏目保留相同 URL、拒绝已有 malformed JSONL、重启后不重复追加，并证明无需读取 Remote 即可在启动时采集。

## Related

- [News page Host and Client boundary](../architecture/2026-09-04-news-page-host-client-boundary.zh.md)
