/** Human-only reference for resetting a Session's active conversation. */
import type { CommandUsageGuide, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'

/** Describes active-context reset, not deletion of historical records or files. */
export const reference: Readonly<Record<ReferenceLocale, CommandUsageGuide>> = {
  en: {
    purpose: 'Clear the active conversation context and continue in the same Session.', when: 'Use when you want a fresh conversation without creating another Session.', syntax: '/clear',
    arguments: { kind: 'none' }, subcommands: [],
    examples: [{ title: 'Start fresh in this Session', input: '/clear', expectedResult: 'Clears active conversation context when the Session is idle, retaining system instructions, tools and settings.' }],
    effects: ['Clears pending inbox input and the current execution Goal.', 'Removes the prior transcript from active model context while retaining its audit history.', 'Saves the updated Session; it does not delete workspace files.'],
    limitations: ['No arguments or attachments are accepted.', 'Stop active work or wait until the Session is idle before executing.', 'If saving fails, the reset may exist only in memory; do not assume it survived a restart.'],
  },
  zh: {
    purpose: '清空活跃对话上下文，并在同一 Session 继续。', when: '希望重新开始对话但不创建另一个 Session 时使用。', syntax: '/clear',
    arguments: { kind: 'none' }, subcommands: [],
    examples: [{ title: '在当前 Session 重新开始', input: '/clear', expectedResult: 'Session 空闲时清空活跃对话上下文，保留系统指令、工具与设置。' }],
    effects: ['清空待处理收件箱输入和当前执行 Goal。', '从活跃模型上下文移除先前对话，同时保留审计历史。', '保存更新后的 Session，不删除工作区文件。'],
    limitations: ['不接受参数或附件。', '执行前应停止活跃工作或等待 Session 空闲。', '保存失败时重置可能仅存于内存，不应假定重启后仍然有效。'],
  },
}
