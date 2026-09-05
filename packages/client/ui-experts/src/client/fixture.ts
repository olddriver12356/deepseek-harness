import type { ExpertRecord } from './types.ts'

export const EXPERT_FIXTURE: readonly ExpertRecord[] = [
  {
    id: 'strategy',
    name: '产品战略专家',
    description: '把模糊方向收敛为可交付的决定、优先级与最小下一步。',
    instructions: '先明确目标、约束和成功标准，再给出可执行方案。',
    enabled: true,
  },
  {
    id: 'research',
    name: '研究与证据专家',
    description: '拆解开放问题，寻找可验证的线索、来源和行动路径。',
    instructions: '区分事实、推断和待验证假设，保留来源与不确定性。',
    enabled: true,
  },
  {
    id: 'review',
    name: '代码审查专家',
    description: '沿着真实调用路径检查实现、测试、边界条件与风险。',
    instructions: '先复现调用链，再按严重程度说明问题、证据和最小修复。',
    enabled: true,
  },
  {
    id: 'editor',
    name: '表达编辑专家',
    description: '把复杂内容整理成清晰、有节奏、可直接使用的表达。',
    instructions: '保留原意，删掉空话，让结构和下一步一眼可见。',
    enabled: false,
  },
]
