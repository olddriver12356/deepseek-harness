/** Human-only manual for the argument-free compaction command. */
import type { CommandUsageGuide, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'

/** Source-owned guide; browsing it never requests a summary model call. */
export const reference: Readonly<Record<ReferenceLocale, CommandUsageGuide>> = {
  en: {
    purpose: 'Summarize older conversation history to reduce active context.',
    when: 'Use when older messages occupy too much context and the Session is idle.', syntax: '/compact',
    arguments: { kind: 'none' }, subcommands: [],
    examples: [{ title: 'Compact history', input: '/compact', expectedResult: 'Compacts eligible older history, or reports that no eligible history is available.' }],
    effects: ['Executing this command may call the configured summary model.', 'Replaces eligible active history with a summary and records the operation in the Session log.'],
    limitations: ['No arguments or attachments are accepted.', 'Unavailable while this process has active compaction or the receiving Agent is busy.', 'A save failure can leave completed compaction only in memory; inspect the reported result before retrying.'],
  },
  zh: {
    purpose: '总结较早的对话，减少活跃上下文占用。', when: '较早消息占用过多上下文且 Session 空闲时使用。', syntax: '/compact',
    arguments: { kind: 'none' }, subcommands: [],
    examples: [{ title: '压缩历史', input: '/compact', expectedResult: '压缩符合条件的较早历史，或报告没有可压缩的历史。' }],
    effects: ['执行此命令可能调用配置的摘要模型。', '以摘要替换符合条件的活跃历史，并在 Session 日志记录操作。'],
    limitations: ['不接受参数或附件。', '本进程正在压缩或接收 Agent 忙碌时不可用。', '保存失败可能导致已完成的压缩仅存于内存；重试前应查看结果。'],
  },
}
