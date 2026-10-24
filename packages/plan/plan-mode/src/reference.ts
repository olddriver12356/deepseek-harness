/** Human-only manual for plan mode and optional planning input. */
import type { CommandUsageGuide, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'

/** Source-owned mode effects, including the model cost of supplying a message. */
export const reference: Readonly<Record<ReferenceLocale, CommandUsageGuide>> = {
  en: {
    purpose: 'Enter plan mode or leave it with off.', when: 'Use before a multi-step task when you want the Agent to plan before implementation.', syntax: '/plan [off|message]',
    arguments: { kind: 'documented', items: [{ name: 'message', description: 'Optional planning request. The exact token off is reserved to leave the mode.', required: false, defaultValue: 'Enter plan mode without additional input' }] },
    subcommands: [{ name: 'off', syntax: '/plan off', description: 'Leave plan mode; an active step can defer the change until the next step.', arguments: [] }],
    examples: [{ title: 'Enter planning', input: '/plan', expectedResult: 'Enters plan mode immediately or queues entry for the next step.' }, { title: 'Leave planning', input: '/plan off', expectedResult: 'Leaves plan mode or queues exit for the next step.' }, { title: 'Plan a task', input: '/plan Investigate the migration before changing files', expectedResult: 'Enters plan mode and submits the planning request to the Agent.' }],
    effects: ['Changes the Session’s planning mode.', 'A supplied message or admitted attachments become user input and may trigger a model request.'],
    limitations: ['Only entry/planning requests accept attachments; /plan off rejects attachments.', 'An in-flight mode transition takes effect at its documented step boundary.', 'Planning is not approval to execute a saved project plan.'],
  },
  zh: {
    purpose: '进入计划模式，或使用 off 退出。', when: '多步骤任务开始前，希望 Agent 先规划再实施时使用。', syntax: '/plan [off|message]',
    arguments: { kind: 'documented', items: [{ name: 'message', description: '可选的规划请求；精确词 off 保留为退出命令。', required: false, defaultValue: '进入计划模式，不附加输入' }] },
    subcommands: [{ name: 'off', syntax: '/plan off', description: '退出计划模式；活跃步骤可能将变更延迟至下一步骤。', arguments: [] }],
    examples: [{ title: '进入规划', input: '/plan', expectedResult: '立即进入计划模式，或安排在下一步骤进入。' }, { title: '退出规划', input: '/plan off', expectedResult: '退出计划模式，或安排在下一步骤退出。' }, { title: '规划任务', input: '/plan 修改文件前先调查迁移方案', expectedResult: '进入计划模式，并向 Agent 提交规划请求。' }],
    effects: ['修改 Session 的计划模式。', '提供的消息或已接纳附件成为用户输入，可能触发模型请求。'],
    limitations: ['仅进入模式或规划请求接受附件，/plan off 拒绝附件。', '正在进行的模式转换按其步骤边界生效。', '规划不等于批准执行已保存的项目计划。'],
  },
}
