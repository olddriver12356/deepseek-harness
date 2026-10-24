/** Human-only long-term milestone manual; distinct from execution Goal control. */
import type { CommandUsageGuide, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'

/** Drafting accepts natural language and still requires confirmation before saving. */
export const reference: Readonly<Record<ReferenceLocale, CommandUsageGuide>> = {
  en: {
    purpose: 'Inspect and maintain this Session’s long-term milestones and checkpoints.', when: 'Use to draft a project breakdown, approve scope, release a milestone or accept observed completion.', syntax: '/long-goal [status|draft <revision> <description>|approve <id> <revision>|start <id> <revision>|accept <id> <revision>]',
    arguments: { kind: 'documented', items: [{ name: 'subcommand', description: 'Optional operation; omit to inspect current progress.', required: false, defaultValue: 'status' }] },
    subcommands: [
      { name: 'status', syntax: '/long-goal status', description: 'Read current progress and its revision.', arguments: [] },
      { name: 'draft', syntax: '/long-goal draft <revision> <description>', description: 'Ask the Agent to propose milestones/checkpoints from natural language. Does not save without confirmation.', arguments: [{ name: 'revision', description: 'Exact current progress revision; use 0 before progress exists. Not a round number.', required: true }, { name: 'description', description: 'Non-empty natural-language project description.', required: true }] },
      { name: 'approve', syntax: '/long-goal approve <id> <revision>', description: 'Approve a milestone’s proposed scope.', arguments: [{ name: 'id', description: 'Stable milestone ID in the current progress.', required: true }, { name: 'revision', description: 'Exact current progress revision.', required: true }] },
      { name: 'start', syntax: '/long-goal start <id> <revision>', description: 'Release an approved milestone for work without creating an execution Goal.', arguments: [{ name: 'id', description: 'Approved milestone ID.', required: true }, { name: 'revision', description: 'Exact current progress revision.', required: true }] },
      { name: 'accept', syntax: '/long-goal accept <id> <revision>', description: 'Accept a milestone when its required checkpoint evidence permits acceptance.', arguments: [{ name: 'id', description: 'Milestone ID to accept.', required: true }, { name: 'revision', description: 'Exact current progress revision.', required: true }] },
    ],
    examples: [{ title: 'Inspect progress', input: '/long-goal', expectedResult: 'Displays current progress or reports none is set.' }, { title: 'Request an initial breakdown', input: '/long-goal draft 0 Build a read-only command reference page with tests', expectedResult: 'If no progress exists, asks the Agent to discuss a readable proposal. Saving still requires confirmation.' }],
    effects: ['Draft submits a user request and may trigger model work.', 'Approve/start/accept update progress records at the supplied revision.', 'Saving, approving or starting milestone scope does not create or resume an execution Goal.'],
    limitations: ['Stale revisions are rejected; inspect again and reconcile before retrying.', 'Draft descriptions are natural language, not a required JSON schema.', 'No attachments are accepted.'],
  },
  zh: {
    purpose: '查看与维护当前 Session 的长期里程碑和检查点。', when: '拆解项目、批准范围、放行里程碑或验收已观察到的完成情况时使用。', syntax: '/long-goal [status|draft <revision> <description>|approve <id> <revision>|start <id> <revision>|accept <id> <revision>]',
    arguments: { kind: 'documented', items: [{ name: 'subcommand', description: '可选操作；省略则查看当前进度。', required: false, defaultValue: 'status' }] },
    subcommands: [
      { name: 'status', syntax: '/long-goal status', description: '读取当前进度与修订号。', arguments: [] },
      { name: 'draft', syntax: '/long-goal draft <revision> <description>', description: '让 Agent 根据自然语言提议里程碑和检查点；未经确认不会保存。', arguments: [{ name: 'revision', description: '精确的当前进度修订号；尚无进度时为 0，不是轮数。', required: true }, { name: 'description', description: '非空的自然语言项目描述。', required: true }] },
      { name: 'approve', syntax: '/long-goal approve <id> <revision>', description: '批准里程碑提议的范围。', arguments: [{ name: 'id', description: '当前进度中的稳定里程碑 ID。', required: true }, { name: 'revision', description: '精确的当前进度修订号。', required: true }] },
      { name: 'start', syntax: '/long-goal start <id> <revision>', description: '放行已批准的里程碑，但不创建执行 Goal。', arguments: [{ name: 'id', description: '已批准的里程碑 ID。', required: true }, { name: 'revision', description: '精确的当前进度修订号。', required: true }] },
      { name: 'accept', syntax: '/long-goal accept <id> <revision>', description: '所需检查点证据允许时验收里程碑。', arguments: [{ name: 'id', description: '待验收的里程碑 ID。', required: true }, { name: 'revision', description: '精确的当前进度修订号。', required: true }] },
    ],
    examples: [{ title: '查看进度', input: '/long-goal', expectedResult: '显示当前进度，或报告尚未设置。' }, { title: '请求初次拆解', input: '/long-goal draft 0 构建只读命令参考页并验证测试', expectedResult: '尚无进度时让 Agent 讨论可读提议；保存仍然要求确认。' }],
    effects: ['draft 提交用户请求，可能触发模型工作。', 'approve、start、accept 按提供的修订号更新进度记录。', '保存、批准或放行里程碑范围不会创建或恢复执行 Goal。'],
    limitations: ['过期修订号会被拒绝；重试前应重新查看并核对。', 'draft 使用自然语言描述，不要求 JSON。', '不接受附件。'],
  },
}
