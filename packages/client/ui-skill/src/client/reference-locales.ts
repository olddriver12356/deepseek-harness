/** Reference-page chrome; provider manuals remain source-owned text. */
export const referenceEn = {
  hookType: 'Hook type', hookAll: 'All types', hookSession: 'Session', hookPrompt: 'Prompt', hookTool: 'Tool', hookTurn: 'Turn completion', hookSubagent: 'Subagent',
  referenceReadFailed: 'Reference could not be loaded. Refresh to retry.', referenceUnavailable: 'This observation is unavailable.',
  referenceNoGuide: 'The command owner has not supplied a usage guide.', referenceRemoved: 'This reference is no longer available.',
  referencePurpose: 'Purpose', referenceWhen: 'When to use', referenceSyntax: 'Syntax', referenceArguments: 'Arguments', referenceNoArguments: 'No arguments',
  referenceSubcommands: 'Subcommands', referenceExamples: 'Examples', referenceEffects: 'Effects', referenceLimitations: 'Limitations',
  referenceRequired: 'Required', referenceOptional: 'Optional', referenceDefault: 'Default', referenceAccepted: 'Accepted values',
  referenceCopy: 'Copy', referenceCopied: 'Copied', referenceCopyFailed: 'Copy failed. Select and copy the text manually.',
  referenceConnection: 'Connection', referenceConnecting: 'Connecting', referenceConnected: 'Connected', referenceReconnecting: 'Reconnecting', referenceDisconnected: 'Disconnected', referenceFailed: 'Failed',
  referenceTransport: 'Transport', referenceInstructions: 'Server instructions', referenceNoInstructions: 'No server instructions supplied.', referenceTools: 'Tools', referenceToolsUnavailable: 'Tool observation unavailable while disconnected.',
  referenceComplexSchema: 'Additional schema constraints are preserved in the advanced schema below.', referenceNestedFields: 'Nested fields', referenceArrayItems: 'Array items', referenceMissingDescription: 'No description supplied.',
  referenceInputSchema: 'Input schema', referenceOutputSchema: 'Output schema', referenceAnnotations: 'Provider annotations (not a security guarantee)',
  referenceTrigger: 'Trigger timing', referenceMatcher: 'Matcher', referenceLastExecution: 'Last execution', referenceUncorrelated: 'Unavailable: existing invocation records cannot be attributed to this configured handler.',
  referenceScope: 'Scope', referenceObserved: 'Observed at', referenceConfiguration: 'Configured plugins — runtime availability unverified', referenceCold: 'The selected Session is not live. Only Host observations are shown.', referenceReadOnly: 'Read-only reference. Browsing does not execute commands, tools or hooks.',
} as const
/** Chinese reference-page chrome. */
export const referenceZh: Record<keyof typeof referenceEn, string> = {
  hookType: 'Hook 类型', hookAll: '全部类型', hookSession: '会话', hookPrompt: '提示词', hookTool: '工具', hookTurn: '轮次结束', hookSubagent: '子 Agent',
  referenceReadFailed: '无法加载参考，请刷新重试', referenceUnavailable: '此观察不可用',
  referenceNoGuide: '命令所有者尚未提供使用手册', referenceRemoved: '此参考已不可用',
  referencePurpose: '用途', referenceWhen: '使用时机', referenceSyntax: '语法', referenceArguments: '参数', referenceNoArguments: '无参数',
  referenceSubcommands: '子命令', referenceExamples: '示例', referenceEffects: '效果', referenceLimitations: '限制',
  referenceRequired: '必填', referenceOptional: '可选', referenceDefault: '默认值', referenceAccepted: '接受值',
  referenceCopy: '复制', referenceCopied: '已复制', referenceCopyFailed: '复制失败，请选中文本手动复制',
  referenceConnection: '连接', referenceConnecting: '连接中', referenceConnected: '已连接', referenceReconnecting: '重连中', referenceDisconnected: '已断开', referenceFailed: '失败',
  referenceTransport: '传输', referenceInstructions: '服务器指令', referenceNoInstructions: '未提供服务器指令', referenceTools: '工具', referenceToolsUnavailable: '断连期间工具观察不可用',
  referenceComplexSchema: '其他 schema 约束完整保留在下方高级 schema 视图中', referenceNestedFields: '嵌套字段', referenceArrayItems: '数组元素', referenceMissingDescription: '未提供描述',
  referenceInputSchema: '输入 schema', referenceOutputSchema: '输出 schema', referenceAnnotations: '提供方注解（不构成安全保证）',
  referenceTrigger: '触发时机', referenceMatcher: '匹配器', referenceLastExecution: '最近执行', referenceUncorrelated: '不可用：无法将现有调用记录归属于此配置处理器',
  referenceScope: '作用域', referenceObserved: '观察时间', referenceConfiguration: '已配置插件 — 运行时可用性未经验证', referenceCold: '所选 Session 未运行，仅展示 Host 观察', referenceReadOnly: '只读参考，浏览不会执行命令、工具或 Hook',
}
