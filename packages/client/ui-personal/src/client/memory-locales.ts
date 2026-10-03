export const memoryZh = {
  memoryHeading: '记忆切片', memoryGeneral: '综合', memoryIndexes: '索引与周记', memoryFileCount: '文件数',
  memoryTodayOnly: '当前日期记录；完整文件请查看原文。',
  memory: '记忆', memorySubtitle: '散落的经历，在这里留下脉络。', memoryIntro: '从今天的记录，到长期留下的事实。',
  working: '今日', episodic: '经历', semantic: '长期事实', handoff: '交接', flags: '待处理',
  memorySearch: '搜索标题或路径', memoryRefresh: '刷新', memoryLoading: '正在读取记忆…', memoryEmpty: '这里还没有记录。',
  memoryError: '读取失败，请刷新重试。原文件未被修改。', memorySelect: '选择一条记忆，阅读原文。', memorySource: '来源', memoryUpdated: '修改时间',
  memoryRaw: '原文', memoryRendered: '阅读', memoryReadOnly: '只读 · 来自 Vault', memoryBack: '返回关于我', memoryCopy: '复制', memoryCopied: '已复制', memoryFootnotes: '脚注',
}
export const memoryEn: Record<keyof typeof memoryZh, string> = {
  memoryHeading: 'Memory fragments', memoryGeneral: 'General', memoryIndexes: 'Indexes and weekly notes', memoryFileCount: 'Files',
  memoryTodayOnly: 'Current day entries; open Source for the complete file.',
  memory: 'Memory', memorySubtitle: 'A place for the traces you leave.', memoryIntro: 'From today’s notes to the facts that stay.',
  working: 'Today', episodic: 'Episodes', semantic: 'Long-term facts', handoff: 'Handoffs', flags: 'Open items',
  memorySearch: 'Search titles or paths', memoryRefresh: 'Refresh', memoryLoading: 'Reading memory…', memoryEmpty: 'No records here yet.',
  memoryError: 'Unable to read. Refresh to retry. Source files are unchanged.', memorySelect: 'Select a memory to read its source.', memorySource: 'Source', memoryUpdated: 'Modified',
  memoryRaw: 'Source', memoryRendered: 'Read', memoryReadOnly: 'Read-only · From Vault', memoryBack: 'Back to About me', memoryCopy: 'Copy', memoryCopied: 'Copied', memoryFootnotes: 'Footnotes',
}
export const personalZh = { title: '关于我', caption: '个人记忆中心', quickNote: '＋ 随手记', close: '关闭随手记', ...memoryZh }
export const personalEn: Record<keyof typeof personalZh, string> = { title: 'About me', caption: 'Personal memory', quickNote: '+ Quick note', close: 'Close quick note', ...memoryEn }
