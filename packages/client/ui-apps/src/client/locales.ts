/**
 * Chinese copy for this client surface.
 */
export const zh = {
  collection: 'YOUR LOCAL COLLECTION / 07', collectionSummary: 'REGISTERED APPS · LOCAL MACHINE',
  headingLead: '选择工具，', headingAccent: '立即开工', runningFilter: '运行中',
  scriptLabel: 'SCRIPT', urlLabel: 'URL', portLabel: 'PORT', registrationHint: '选择 Workspace · 读取 package.json',
  chooseManager: '检测到多个包管理器，请选择',
  title: '本地应用', heading: '选择工具，立即开工', intro: '登记本机的网页或桌面应用，随时从这里启动。',
  register: '注册应用', registerDesktop: '注册桌面应用', executable: '程序路径', executableHint: '输入可信程序的绝对路径', empty: '还没有应用，请选择项目目录开始注册。', pick: '选择项目目录',
  name: '名称', description: '说明', directory: '项目目录', script: '启动脚本', manager: '包管理器', url: '访问地址', port: '首选端口', strategy: '端口方式',
  fixed: '固定端口', env: '自动 · PORT', long: '自动 · --port', short: '自动 · -p',
  save: '保存', cancel: '取消', open: '打开应用', start: '启动并打开', stop: '停止', edit: '编辑', remove: '移除', logs: '日志',
  stopped: '已停止', starting: '启动中', running: 'DSH 运行中', external: '外部运行', failed: '启动失败',
  confirmExternal: '确认此地址是该应用', all: '全部', more: '更多操作', close: '关闭', removePrompt: '仅移除注册记录，项目文件会保留。继续？',
  loading: '正在读取…', failedRequest: '操作失败', addAnother: '注册另一个本地应用', allScripts: '显示全部脚本',

} as const
/**
 * Message keys shared by both client locale dictionaries.
 */
export type AppsKey = keyof typeof zh
/**
 * English copy for this client surface.
 */
export const en: Record<AppsKey, string> = {
  collection: 'YOUR LOCAL COLLECTION / 07', collectionSummary: 'REGISTERED APPS · LOCAL MACHINE',
  headingLead: 'Your tools,', headingAccent: 'ready to go', runningFilter: 'Running',
  scriptLabel: 'SCRIPT', urlLabel: 'URL', portLabel: 'PORT', registrationHint: 'Choose Workspace · Read package.json',
  chooseManager: 'Multiple package managers detected; choose one',
  title: 'Local apps', heading: 'Your tools, ready to go', intro: 'Register and launch local web or desktop apps from here.',
  register: 'Register app', registerDesktop: 'Register desktop app', executable: 'Executable', executableHint: 'Absolute path to a trusted executable', empty: 'No apps yet. Choose a project directory to register one.', pick: 'Choose project directory',
  name: 'Name', description: 'Description', directory: 'Project directory', script: 'Launch script', manager: 'Package manager', url: 'Access URL', port: 'Preferred port', strategy: 'Port strategy',
  fixed: 'Fixed port', env: 'Automatic · PORT', long: 'Automatic · --port', short: 'Automatic · -p',
  save: 'Save', cancel: 'Cancel', open: 'Open app', start: 'Start and open', stop: 'Stop', edit: 'Edit', remove: 'Remove', logs: 'Logs',
  stopped: 'Stopped', starting: 'Starting', running: 'Managed', external: 'External', failed: 'Failed',
  confirmExternal: 'Confirm this URL is this app', all: 'All', more: 'More actions', close: 'Close', removePrompt: 'Remove registration only? Project files will be kept.',
  loading: 'Loading…', failedRequest: 'Operation failed', addAnother: 'Register another local app', allScripts: 'Show all scripts',

}
