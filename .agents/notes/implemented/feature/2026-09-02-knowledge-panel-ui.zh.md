# Agent Note: 独立 Knowledge 面板与包拥有的资产

Status: implemented

[English](2026-09-02-knowledge-panel-ui.md) | 中文

## 问题

应用 rail 标识六个产品区域，但导航本身没有定义各面板的所有者、面板本地状态如何在选择变更时保留，也没有定义视觉独特的面板如何交付静态资产。把业务面板放入 rail 包会让导航与无关的展示和数据决策耦合。在存在两个真实面板之前构建通用面板框架，则会把单一设计变成过早抽象。

Knowledge 设计还依赖 collage 和展示字体。从 Boujoy 开发服务器获取它们会使已交付的 Web profile 依赖参考应用，而将其编码为 base64 会膨胀 JavaScript bundle 并抹去普通的可缓存文件边界。通用包文件路由会暴露超出浏览器所需范围的安装内容。

## 决策

将 Knowledge 实现为 `@deepseek-ai/dsh-client-ui-knowledge`，这是一个独立浏览器插件，贡献一个持久的 `shell.overlay` 条目。组件应从 `ctx.appPanels` 读取可见性，在非活动状态使用原生 `hidden` 状态，并将搜索、Layer 和产物选择保存为本地 React 状态。该包应只使用一个 frozen fixture，且不暴露 vault、文件系统、Host Remote、网络或修改能力。

未来业务面板应使用独立插件，并拥有各自的数据与视觉。只有另一个已实现面板证明存在稳定重复后，才应提取共享面板代码。应用 rail 应保持为导航插件，不应成为面板容器。

客户端 bundler 应将包本地 PNG 和 WOFF2 引用输出到 `lib/assets`，且不改变其字节。模块宿主应只提供已注册包客户端 bundle 相邻 `lib/assets` 目录中的简单受支持文件名。未知包、嵌套路径、目录穿越尝试和不支持的扩展名应保持不可用。

## 考虑过的替代方案

**将 Knowledge 放入 `ui-app-rail`。** 否决，因为导航会拥有业务展示、fixture 数据、本地交互状态和视觉资产。后续面板会继续扩大同一个包，并使独立替换变得困难。

**先创建通用应用面板框架。** 否决，因为 Knowledge 是第一个真实业务面板。一个实现无法建立稳定的共享约定，而现有 slot 加 `ctx.appPanels` 已提供所需生命周期机制。

**从 Boujoy 服务器加载资产。** 否决，因为参考仓库不是 DSH 运行时的一部分，不得成为生产依赖。

**以 base64 内联资产。** 否决，因为数 MB 二进制内容会膨胀 `client.js`，增加解析和传输成本，并阻止浏览器采用普通资产处理方式。

**提供已注册包旁的任意文件。** 否决，因为浏览器只需要已输出的 PNG 和 WOFF2 资产。窄路由更容易审计，也不会创建通用文件读取接口。

## 后果

已交付的 Web roster 现在会在 `ui-app-rail` 旁加载 Knowledge。选择它会显示持续挂载的 overlay，不会卸载 Agent 表面，搜索、Layer 和产物选择的本地状态也会跨面板切换保留。

Knowledge 的全部可见内容都来自 frozen package fixture。禁用的产物操作与只读文案明确呈现当前边界，真实 Agent Layer 数据、导航和修改能力仍保持延后。

Production build 会把已批准的 collage 与字体输出为包拥有的文件。宿主只为已注册客户端包提供简单 PNG 与 WOFF2 文件名，因此 UI 不依赖运行中的 Boujoy 服务器，该路由也不会成为通用文件读取器。

在另一个已实现面板证明稳定共享约定之前，独立面板包可能重复少量布局或交互 CSS。当前接受这部分重复，只应在提取能够消除已证实的重复时重新评估。
