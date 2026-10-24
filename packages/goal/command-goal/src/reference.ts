/** Human-only execution Goal manual owned by its command adapter. */
import type { CommandUsageGuide, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'

/** A Goal schedules execution; it is distinct from long-term milestone records. */
export const reference: Readonly<Record<ReferenceLocale, CommandUsageGuide>> = {
  en: {
    purpose: 'Set, inspect or control an execution Goal for this Session.', when: 'Use when the Agent should keep working across automatic continuation rounds until an objective is resolved.', syntax: '/goal [objective|clear|edit <objective>|pause|resume]',
    arguments: { kind: 'documented', items: [{ name: 'objective', description: 'Concrete completion objective. Omit all input to inspect the current Goal.', required: false, defaultValue: 'Show Goal status' }] },
    subcommands: [
      { name: 'edit', syntax: '/goal edit <objective>', description: 'Replace the objective; requires an existing Goal.', arguments: [{ name: 'objective', description: 'Replacement completion objective.', required: true }] },
      { name: 'pause', syntax: '/goal pause', description: 'Pause the existing Goal’s automatic execution.', arguments: [] },
      { name: 'resume', syntax: '/goal resume', description: 'Resume or rearm the existing Goal after pause or restored Session state.', arguments: [] },
      { name: 'clear', syntax: '/goal clear', description: 'Remove the current execution Goal.', arguments: [] },
    ],
    examples: [{ title: 'Inspect Goal', input: '/goal', expectedResult: 'Displays the current Goal or reports that none exists.' }, { title: 'Start sustained work', input: '/goal Finish the migration and verify its tests', expectedResult: 'Creates an execution Goal when no unfinished Goal exists; automatic work may begin.' }, { title: 'Pause automatic work', input: '/goal pause', expectedResult: 'Pauses the existing Goal.' }],
    effects: ['Creating or resuming a Goal can trigger automatic model rounds and tool execution.', 'Control changes are recorded in the current Session.', 'Attachments are admitted only with create/edit objectives and become model-visible reference input.'],
    limitations: ['An unfinished Goal must be edited or cleared before replacement.', 'Pause/resume/edit require a current Goal; a bare edit without an objective is rejected.', 'Long-term milestones are maintained separately through /long-goal; approving a milestone is not this command.'],
  },
  zh: {
    purpose: '设置、查看或控制当前 Session 的执行 Goal。', when: '需要 Agent 在自动续轮中持续工作，直到完成目标时使用。', syntax: '/goal [objective|clear|edit <objective>|pause|resume]',
    arguments: { kind: 'documented', items: [{ name: 'objective', description: '具体的完成目标；省略全部输入则查看当前 Goal。', required: false, defaultValue: '显示 Goal 状态' }] },
    subcommands: [
      { name: 'edit', syntax: '/goal edit <objective>', description: '替换目标；要求已有 Goal。', arguments: [{ name: 'objective', description: '替换后的完成目标。', required: true }] },
      { name: 'pause', syntax: '/goal pause', description: '暂停已有 Goal 的自动执行。', arguments: [] },
      { name: 'resume', syntax: '/goal resume', description: '在暂停或恢复 Session 后继续或重新激活已有 Goal。', arguments: [] },
      { name: 'clear', syntax: '/goal clear', description: '移除当前执行 Goal。', arguments: [] },
    ],
    examples: [{ title: '查看 Goal', input: '/goal', expectedResult: '显示当前 Goal，或报告尚未设置。' }, { title: '开始持续工作', input: '/goal 完成迁移并验证测试', expectedResult: '不存在未完成 Goal 时创建执行 Goal，可能开始自动工作。' }, { title: '暂停自动工作', input: '/goal pause', expectedResult: '暂停已有 Goal。' }],
    effects: ['创建或恢复 Goal 可能触发自动模型轮次与工具执行。', '控制变更记录在当前 Session。', '仅创建或编辑目标接受附件，附件成为模型可见的参考输入。'],
    limitations: ['替换未完成 Goal 前必须先编辑或清除它。', 'pause、resume 和 edit 要求已有 Goal；不带目标的 edit 会被拒绝。', '长期里程碑由 /long-goal 单独维护；批准里程碑不是此命令的操作。'],
  },
}
