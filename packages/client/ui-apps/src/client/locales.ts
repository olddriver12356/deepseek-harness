export const zh = {
  chooseManager: '检测到多个包管理器，请选择',
  title: '本地应用', heading: '选择工具，立即开工', intro: '喜欢的工具，都在这里。选一个应用，在浏览器里继续你的工作。',
  register: '注册应用', empty: '还没有应用，请选择项目目录开始注册。', pick: '选择项目目录',
  name: '名称', description: '说明', directory: '项目目录', script: '启动脚本', manager: '包管理器', url: '访问地址', port: '首选端口', strategy: '端口方式',
  fixed: '固定端口', env: '自动 · PORT', long: '自动 · --port', short: '自动 · -p',
  save: '保存', cancel: '取消', open: '打开应用', start: '启动并打开', stop: '停止', edit: '编辑', remove: '移除', logs: '日志',
  stopped: '已停止', starting: '启动中', running: 'DSH 运行中', external: '外部运行', failed: '启动失败',
  confirmExternal: '确认此地址是该应用', all: '全部', more: '更多操作', close: '关闭', removePrompt: '仅移除注册记录，项目文件会保留。继续？',
  loading: '正在读取…', failedRequest: '操作失败', addAnother: '注册另一个本地应用', allScripts: '显示全部脚本',
} as const
export type AppsKey = keyof typeof zh
export const en: Record<AppsKey, string> = {
  chooseManager: 'Multiple package managers detected; choose one',
  title: 'Local apps', heading: 'Your tools, ready to go', intro: 'Choose a registered local app and continue in your browser.',
  register: 'Register app', empty: 'No apps yet. Choose a project directory to register one.', pick: 'Choose project directory',
  name: 'Name', description: 'Description', directory: 'Project directory', script: 'Launch script', manager: 'Package manager', url: 'Access URL', port: 'Preferred port', strategy: 'Port strategy',
  fixed: 'Fixed port', env: 'Automatic · PORT', long: 'Automatic · --port', short: 'Automatic · -p',
  save: 'Save', cancel: 'Cancel', open: 'Open app', start: 'Start and open', stop: 'Stop', edit: 'Edit', remove: 'Remove', logs: 'Logs',
  stopped: 'Stopped', starting: 'Starting', running: 'Managed', external: 'External', failed: 'Failed',
  confirmExternal: 'Confirm this URL is this app', all: 'All', more: 'More actions', close: 'Close', removePrompt: 'Remove registration only? Project files will be kept.',
  loading: 'Loading…', failedRequest: 'Operation failed', addAnother: 'Register another local app', allScripts: 'Show all scripts',
}
