/** Human-only usage guide owned by the feedback command. */
import type { CommandUsageGuide, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'

/** Authored syntax and effects; feedback is not a model request. */
export const reference: Readonly<Record<ReferenceLocale, CommandUsageGuide>> = {
  en: {
    purpose: 'Record feedback about the current Session.', when: 'Use to retain a correction or assessment associated with this Session.', syntax: '/feedback <text>',
    arguments: { kind: 'documented', items: [{ name: 'text', description: 'Non-empty feedback text.', required: true }] }, subcommands: [],
    examples: [{ title: 'Record a correction', input: '/feedback The answer missed the failing test', expectedResult: 'Records the supplied feedback for this Session.' }],
    effects: ['Writes a feedback record associated with the current Session; it does not send the text as a new model request.'],
    limitations: ['Web intercepts a bare /feedback to open its feedback dialog; direct command execution rejects empty text.', 'No attachments are accepted.', 'Recording feedback does not itself ask the Agent to revise its answer.', 'Acknowledgement confirms an appended record, not that it has been flushed to disk.'],
  },
  zh: {
    purpose: '记录当前 Session 的反馈。', when: '需要保留与本 Session 关联的纠正或评价时使用。', syntax: '/feedback <text>',
    arguments: { kind: 'documented', items: [{ name: 'text', description: '非空反馈文本。', required: true }] }, subcommands: [],
    examples: [{ title: '记录纠正', input: '/feedback 回答遗漏了失败的测试', expectedResult: '为当前 Session 记录提供的反馈。' }],
    effects: ['写入与当前 Session 关联的反馈记录，不会把文本作为新的模型请求发送。'],
    limitations: ['Web 会拦截单独的 /feedback 并打开反馈对话框；直接执行空文本命令会被拒绝。', '不接受附件。', '记录反馈本身不会要求 Agent 修改回答。', '确认仅表示记录已追加，不证明已经写入磁盘。'],
  },
}
