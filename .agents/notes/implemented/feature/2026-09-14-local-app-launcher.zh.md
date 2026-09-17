# Agent Note: 注册本地 Web 应用

Status: implemented

[English](2026-09-14-local-app-launcher.md) | 中文

## Problem

打开本地 Web 工具需要逐个查找仓库并手动执行启动脚本。

## Decision

应用页通过用户选择的项目目录读取 package scripts，将注册记录保存到 `local-apps` settings namespace，不修改依赖。现有 subprocess service 管理启动的进程，仅允许停止 DSH 管理的应用。外部应用需要明确确认。访问地址限制为 loopback HTTP(S)，日志设有大小限制，自动端口策略在启动前探测可用端口。

页面采用已确认的撕纸背景、`#EDE9DF` 卡片、三色循环背板、描边按钮和 14px 最小字号。应用位于新闻之前，新闻始终排在导航末尾。

原生页面还原最终 mockup 的分段错版标题、印章式标签、计数筛选栏、SVG 拼贴首字母、状态圆点和不规则描边操作按钮。筛选保留记录原有配色，运行中计数包含明确确认的外部应用。容器查询适配 Files 侧栏缩小页面后的可用宽度。仅在应用页显示时屏蔽 Cyberdeck 扫描线和按钮切角，避免它们改变已确认的视觉效果。

## Alternatives considered

**自动扫描目录**未采用，因为注册应由用户明确选择，避免暴露无关项目。**编辑依赖**未采用，因为功能只启动已有脚本。**另建进程管理器**未采用，因为现有 subprocess service 已提供所需能力。

## Consequences

项目需要预先安装依赖，脚本需要支持选定的端口策略。移除注册记录保留项目文件。子进程报告地址占用时，自动端口模式最多重试两次。回退功能提交会移除页面和服务，已保存的注册数据仍保留。

## Testing

专项测试覆盖 manifest 校验、注册持久化、注册界面、端口占用、重复启动、进程归属及新闻排序。干净 master 构建被已有 Knowledge 源码缺少包清单和 TypeScript project 阻塞。依赖审计发现现有依赖链的 38 项问题，本功能不修复这些问题。
