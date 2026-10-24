/** Human-only usage guide for profile-dependent permission selection. */
import type { CommandUsageGuide, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'

/** Permission names are deliberately not a fixed enum; the current profile owns the catalog. */
export const reference: Readonly<Record<ReferenceLocale, CommandUsageGuide>> = {
  en: {
    purpose: 'Inspect or switch this Session’s permission preset.', when: 'Use to check the current sandbox/approval policy or deliberately choose another configured preset.', syntax: '/permission [preset]',
    arguments: { kind: 'documented', items: [{ name: 'preset', description: 'Exact preset name from the current profile’s available catalog. Omit to inspect.', required: false, defaultValue: 'Show current and available presets' }] }, subcommands: [],
    examples: [{ title: 'Inspect permissions', input: '/permission', expectedResult: 'Displays the current preset and the currently available preset names.' }],
    effects: ['With a valid name, updates this Session’s sandbox settings and approval policy.', 'Wider permissions can allow actions that the previous preset denied or required approval for.'],
    limitations: ['Available names depend on configuration and optional live integrations.', 'An unknown name is rejected; inspecting does not change the preset.', 'No attachments are accepted.'],
  },
  zh: {
    purpose: '查看或切换当前 Session 的权限预设。', when: '检查当前沙箱和审批策略，或明确选择其他已配置预设时使用。', syntax: '/permission [preset]',
    arguments: { kind: 'documented', items: [{ name: 'preset', description: '当前 profile 可用目录中的精确预设名；省略则查看。', required: false, defaultValue: '显示当前与可用预设' }] }, subcommands: [],
    examples: [{ title: '查看权限', input: '/permission', expectedResult: '显示当前预设与当前可用的预设名。' }],
    effects: ['提供有效名称时，更新当前 Session 的沙箱设置与审批策略。', '更宽的权限可能允许此前被拒绝或需要审批的操作。'],
    limitations: ['可用名称取决于配置和可选的运行中集成。', '未知名称会被拒绝，查看不会修改预设。', '不接受附件。'],
  },
}
