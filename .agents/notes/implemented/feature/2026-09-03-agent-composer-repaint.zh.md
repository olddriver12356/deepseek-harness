# Agent Note: Agent Composer Boujoy 重绘

Status: implemented

[English](2026-09-03-agent-composer-repaint.md) | 中文

## 问题

Agent composer 已通过原生 session 与 projection faces 路由 draft、image、permission、plan、model、send、stop、queue 和 steer 行为，但其中性的 capsule presentation 不符合已批准的 Boujoy 方向。若干原生能力也不易发现：图片输入依赖 paste、drag 或 command surfaces，运行状态中的 queue 与 steer 行为只通过键盘语义可见，attachment context 则渲染在输入卡内部而不是其上方。

source-fidelity target 还在 active composer 中展示 agent preset select。DSH 有意只允许在首轮之前选择 preset，因为 history 已存在后，Host 会拒绝替换 session 的 tool composition。把该控件复制到 active composer 会产生一个在绝大多数生命周期中无效的 affordance。

## 决策

保持 `useProjection`、input machine、`SessionFace.prompt`、`SessionFace.cancel`、permission command path 和所有现有 slot owner 不变。增加 `--dsw-specific-composer-*` palette 与 display-font alias，再把这些 token 应用于 composer card、permission trigger、plan chip、model trigger、attachment rail 和 pre-session preset chip。

把现有 attachment slot 移到 card 上方，不改变其 owner share 或 intake callbacks。增加一个接受 PNG、JPEG、WebP 和 GIF 的原生 hidden multi-file input，并把文件路由到现有 `intakeImages` validation 与 `addImages` face。Paste 与 drag intake 保持不变。

当 root session 正在运行时，在 card 上方渲染紧凑的 busy status。它展示 `任务运行中` 以及 queue 和 steer 两个标签，并从现有 `resolveSubmitMode` policy 推导当前 Enter 行为。该 status 不拥有第二份 preference，也不改变 submission behavior。现有 Enter 与 Cmd/Ctrl+Enter 语义继续作为权威行为。

使用精确中文 prompt copy `描述你要完成的事…`，本地化三个已知 permission values，并在原生 model directory 加载期间显示 `读取模型…`。保留 Full access 现有的 explicit acknowledgement dialog 及 cancel reversion。

把 agent preset 保留在 pre-session hero context row。将其重绘为 card 上方的 context chip，但不增加 Host 无法执行的第二个 active-session select。

## 考虑过的替代方案

**为 queue 与 steer 创建独立 composer state。** 否决，因为 submission policy 已拥有 preference 并解析每个 keyboard gesture。第二份 local state 会与原生 setting 漂移。

**用 image attachment 替换 command button。** 否决，因为 command discovery 是现有 DSH functionality。相邻的原生 file button 能暴露 image intake，而不删除 command surface。

**增加 active-session preset selector。** 否决，因为 preset changes 仅在首轮前有效。现有 hero selector 是诚实的 lifecycle boundary。

**在 file input 中复制 image validation。** 否决，因为 `intakeImages` 已在使用 `addImages` 前应用 projected count、media-type、per-file 与 aggregate limits。

## 后果

Composer 现在呈现统一的 Boujoy editorial surface，包括锐利 tape edges、grid texture、offset color shadows 以及不同的 send 与 stop treatments，同时保留共享 DSH focus、disabled、error 与 reduced-motion states。

Attachments 与 context 显示在 card 上方。用户可以直接选择多个受支持图片，而相同的 validation、preview、removal、paste、drag 与 submission paths 继续运行。

运行中的 sessions 会把现有 queue 或 steer Enter 行为显示为 status，而不再只依赖隐含的 keyboard knowledge。没有引入新的 setting、projection、session store 或 transport path。

source preset placement 有意适配 DSH lifecycle semantics。Composer 不会暗示 active session 可以替换其 tool composition。
