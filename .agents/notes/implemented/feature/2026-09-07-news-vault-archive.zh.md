# Agent Note: News Vault archive

[English](2026-09-07-news-vault-archive.md) | 中文

Status: implemented

## Problem

Host cache 每个 News 栏目只保留最新十条，而且仅在 Remote 被读取时刷新。随着三天 source window 前进，从未显示或查看的条目会消失，尽管保留这些确定性 feed metadata 的成本很低。

## Decision

News Host 现在会在启动时及之后每六小时通过 Cordis timer 检查 feeds。每次成功抓取都会保留现有的最新十条 UI projection，并把 source window 内观察到的全部去重条目追加到 `<vaultRoot>/Resources/AI News/news.jsonl`。每条 JSONL record 保存 schema version、栏目 kind、fetch time、title、精确 URL、source、publication time 和 summary，不保存图片。去重键是栏目 kind 与精确 URL，因此整个过程不需要 model turn；同一 URL 出现在两个栏目时仍会分别保留。

已有 archive 的任意非空行格式错误时会 fail closed。Remote refresh 与 timer 共享一个 in-flight crawl；抓取失败且存在有效 UI cache 时仍返回旧 cache。Archive 失败不会被手动 refresh 报告为成功。

## Alternatives considered

**每条内容生成一个 Markdown note：**拒绝，因为文件数量、命名规则和 collision handling 的成本高于 raw deterministic intake 所需。

**Database 或 secondary URL index：**延期，因为每六小时顺序扫描一次 JSONL 是更小的系统。只有实测 archive 大小使扫描成本明显时才增加 index。

**Agent Schedule capability：**拒绝，因为 News 采集是 deployment-global，且不需要 model turn。Cordis timer 才具有正确的 Host lifecycle。

## Consequences

未查看的 feed 条目会在 UI window 之外继续保存在 append-only、portable Vault file 中。采集只在 Host process 运行时发生，archive scan 成本随保留记录线性增长。JSONL file 是 raw intake，不是 curated knowledge，也不会为每篇文章创建 Obsidian note。

## TDD evidence

Focused tests 要求归档完整 source window 而 UI 只显示十条、不同栏目保留相同 URL、拒绝已有 malformed JSONL、重启后不重复追加，并证明无需读取 Remote 即可在启动时采集。

## Related

- [News page Host and Client boundary](../architecture/2026-09-04-news-page-host-client-boundary.zh.md)
