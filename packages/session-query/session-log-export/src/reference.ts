/** Human-only usage guide for the Web Session archive download. */
import type { CommandUsageGuide, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'

/** Export remains a user-triggered authenticated download, not a model tool. */
export const reference: Readonly<Record<ReferenceLocale, CommandUsageGuide>> = {
  en: {
    purpose: 'Download the current Session log as a ZIP archive in Web.', when: 'Use to retain a local archive or inspect the recorded Session.', syntax: '/export',
    arguments: { kind: 'none' }, subcommands: [],
    examples: [{ title: 'Download the archive', input: '/export', expectedResult: 'Requests the Session ZIP download through the Web client.' }],
    effects: ['The browser requests an authenticated Session log archive; executing the command does not make a model request.', 'The download can contain private conversation content. Review it before sharing.'],
    limitations: ['Web-only command; browser download handling determines the saved location.', 'Does not accept an output path or attachments.', 'A download request acknowledgement is not proof that the browser saved the archive successfully.'],
  },
  zh: {
    purpose: '在 Web 中下载当前 Session 日志的 ZIP 归档。', when: '需要保留本地归档或检查 Session 记录时使用。', syntax: '/export',
    arguments: { kind: 'none' }, subcommands: [],
    examples: [{ title: '下载归档', input: '/export', expectedResult: '通过 Web 客户端请求 Session ZIP 下载。' }],
    effects: ['浏览器请求经身份验证的 Session 日志归档，执行命令不会产生模型请求。', '下载可能包含私人对话，分享前应检查。'],
    limitations: ['仅 Web 提供此命令，保存位置由浏览器下载处理决定。', '不接受输出路径或附件。', '收到下载请求确认并不证明浏览器已成功保存归档。'],
  },
}
