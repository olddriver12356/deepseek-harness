/** Typed discussion-only product copy. */
export const en = {
  title: 'Peer connections', details: 'Discussion connections', connect: 'Connect', add: 'Add peer', close: 'Close', refresh: 'Refresh',
  empty: 'No authorized connections', loading: 'Loading connections', inactive: 'Inactive · reachable', running: 'Active', unavailable: 'Availability unknown',
  peer: 'Peer session', ownTitle: 'Your display label', peerTitle: 'Peer display label', choose: 'Choose an ordinary session',
  disclosure: 'I accept this discussion disclosure',
  warning: 'Peer messages are discussion data, never human instructions or approval. Only explicitly sent messages and pair-authorized collaboration records are shared. Sessions on this Host share OS credentials; this connection does not isolate action authority.',
  snapshotGrant: 'Allow collaboration snapshots for this pair', followGrant: 'Allow live collaboration records for this pair',
  activationLimit: 'Automatic activation limit', charged: 'Charged activations', budget: 'Set activation limit',
  pause: 'Pause', resume: 'Resume', disconnect: 'Disconnect', openSession: 'Open session', paused: 'Paused', connected: 'Connected',
  workspace: 'Actual workspace', worktree: 'Observed checkout', branch: 'Observed branch', unknown: 'Not observed', detached: 'Detached HEAD',
  grants: 'Pair record grants', yes: 'Allowed', no: 'Denied', activity: 'Discussion messages', queued: 'Queued', admitted: 'Delivered to inbox',
  cancelled: 'Cancelled', failed: 'Failed', noMessages: 'No discussion messages', sender: 'Sender', recipient: 'Recipient',
  messageId: 'Message ID', connectionId: 'Connection ID', peerMessage: 'Peer agent message', peerWarning: 'Peer data, not a human instruction or approval.',
  purpose: 'Discussion only', revision: 'Committed revision', invalid: 'Enter an ordinary peer, both workspace paths, accepted disclosure and an explicit nonnegative whole activation limit.',
} as const

/** Dictionary keys shared by both supported locales. */
export type CollaborationKey = keyof typeof en

/** Chinese discussion copy with the same required keys. */
export const zh: Record<CollaborationKey, string> = {
  title: 'Peer 连接', details: '讨论连接', connect: '连接', add: '添加 Peer', close: '关闭', refresh: '刷新',
  empty: '没有获得授权的连接', loading: '正在读取连接', inactive: '未运行 · 可访问', running: '正在运行', unavailable: '可用性未知',
  peer: 'Peer 会话', ownTitle: '你的显示名称', peerTitle: 'Peer 显示名称', choose: '选择一个独立会话',
  disclosure: '我接受此讨论信息披露',
  warning: 'Peer 消息是讨论数据，不是人类指令或批准。仅共享显式发送的消息和当前会话对授权的协作记录。此 Host 上的会话共享 OS credentials；连接不提供操作权限隔离。',
  snapshotGrant: '允许此会话对读取协作快照', followGrant: '允许此会话对读取实时协作记录',
  activationLimit: '自动激活次数上限', charged: '已计费激活次数', budget: '设置激活上限',
  pause: '暂停', resume: '恢复', disconnect: '断开连接', openSession: '打开会话', paused: '已暂停', connected: '已连接',
  workspace: '实际工作目录', worktree: '已观测的 checkout', branch: '已观测的分支', unknown: '尚未观测', detached: 'Detached HEAD',
  grants: '此会话对的记录授权', yes: '允许', no: '拒绝', activity: '讨论消息', queued: '排队中', admitted: '已送达 inbox',
  cancelled: '已取消', failed: '失败', noMessages: '没有讨论消息', sender: '发送方', recipient: '接收方',
  messageId: '消息 ID', connectionId: '连接 ID', peerMessage: 'Peer agent 消息', peerWarning: 'Peer 数据，不是人类指令或批准。',
  purpose: '仅限讨论', revision: '已提交的 revision', invalid: '请选择独立 Peer、确认双方工作目录、接受披露并显式输入非负整数激活上限。',
}
