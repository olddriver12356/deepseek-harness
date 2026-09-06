import { useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import { EXPERT_FIXTURE } from './fixture.ts'
import type { ExpertRecord } from './types.ts'
import css from './ExpertsPanel.module.css'

export interface ExpertsPanelProps {
  readonly appPanels: IAppPanels
}

type DialogState =
  | { readonly kind: 'record'; readonly item: ExpertRecord; readonly copy: boolean }
  | { readonly kind: 'create' }
  | { readonly kind: 'dispatch'; readonly item: ExpertRecord }
  | undefined

/** Reasoning-effort choices offered on the create-expert form. */
const REASONING_LEVELS = ['低', '中', '高'] as const

/**
 * Built-in permission presets, mirrored from `@deepseek-ai/dsh-client-ui-permission-presets`
 * (machine value kept, label localized here) rather than imported: the create form has no
 * host remote to resolve a live preset catalog against, so it only offers the fixed product
 * preset set instead of pretending to read one.
 */
const PERMISSION_PRESETS = [
  { value: 'read-only', label: '只读' },
  { value: 'workspace-write', label: '工作区可写' },
  { value: 'danger-full-access', label: '完全访问（高风险）' },
] as const

function ExpertCard({ item, index, onOpen }: {
  readonly item: ExpertRecord
  readonly index: number
  readonly onOpen: (state: DialogState) => void
}): ReactNode {
  return (
    <article
      className={`${css.recordCard} ${item.enabled ? '' : css.disabled}`}
      data-index={String(index + 1).padStart(2, '0')}
    >
      <div className={css.recordTop}>
        <span className={css.recordAvatar}>{item.name.slice(0, 1)}</span>
        <span className={css.recordStatus}>{item.enabled ? 'ON CALL' : 'OFF'}</span>
      </div>
      <h3>{item.name}</h3>
      <p>{item.description}</p>
      <div className={css.recordActions}>
        <button className={css.call} type="button" onClick={() => { onOpen({ kind: 'dispatch', item }) }}>调用专家 →</button>
        <button type="button" onClick={() => { onOpen({ kind: 'record', item, copy: false }) }}>编辑</button>
        <button type="button" onClick={() => { onOpen({ kind: 'record', item, copy: true }) }}>复制</button>
        <button type="button" onClick={() => { /* persistence is a later phase */ }}>删除</button>
      </div>
    </article>
  )
}

function RecordDialog({ state, onClose }: { readonly state: Extract<DialogState, { kind: 'record' }>; readonly onClose: () => void }): ReactNode {
  const { item, copy } = state
  const title = copy ? '复制专家' : '编辑专家'
  return (
    <dialog className={css.dialog} open aria-labelledby="experts-record-title">
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onClose() }}>
        <header><div><p>{copy ? 'COPY RECORD' : 'EDIT RECORD'}</p><h2 id="experts-record-title">{title}</h2></div><button type="button" className={css.dialogClose} onClick={onClose} aria-label="关闭">×</button></header>
        <label>名称<input defaultValue={`${item.name}${copy ? ' 副本' : ''}`} maxLength={80} placeholder="例如：产品战略专家" required /></label>
        <label>一句话说明<input defaultValue={item.description} maxLength={180} placeholder="擅长什么，什么时候调用" /></label>
        <label>系统指令<textarea defaultValue={item.instructions} rows={10} placeholder="写下角色、判断标准、工作流程和输出要求…" required /></label>
        <label className={css.checkRow}><input defaultChecked={item.enabled} type="checkbox" /><span>启用这个配置</span></label>
        <footer><button type="button" className={css.ghostButton} onClick={onClose}>取消</button><button type="submit" className={css.primaryCut}>保存到 Markdown</button></footer>
      </form>
    </dialog>
  )
}

/**
 * New-expert creation form (matches the mockup's expert-card field set: name, category,
 * description, model, reasoning, permission, instructions, attached skills).
 *
 * There is no create path anywhere in this client or its host remotes: `EXPERT_FIXTURE` is a
 * static array, `IAppPanels` only tracks which panel is visible, and the sibling `RecordDialog`
 * form already discarded its input on submit before this change. So this form validates and
 * builds a real payload, then reports honestly that nothing wired can save it, instead of
 * quietly closing or stashing the entry in local state as a stand-in for persistence.
 */
function CreateExpertDialog({ onClose }: { readonly onClose: () => void }): ReactNode {
  const [error, setError] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [notWired, setNotWired] = useState(false)
  const skills = skillsText.split(',').map(skill => skill.trim()).filter(skill => skill !== '')

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    // FormData.get widens to string | File; every field here is a text input, so a non-string reads as empty.
    const field = (key: string): string => {
      const value = data.get(key)
      return typeof value === 'string' ? value.trim() : ''
    }
    const name = field('name')
    const category = field('category')
    const description = field('description')
    const instructions = field('instructions')
    if (name === '' || category === '' || description === '' || instructions === '') {
      setError('名称、分类、一句话说明和系统指令都是必填项。')
      return
    }
    setError('')
    setNotWired(true)
  }

  return (
    <dialog className={css.dialog} open aria-labelledby="experts-create-title">
      <form onSubmit={handleSubmit}>
        <header>
          <div><p>NEW RECORD</p><h2 id="experts-create-title">新增专家</h2></div>
          <button type="button" className={css.dialogClose} onClick={onClose} aria-label="关闭">×</button>
        </header>
        <label>名称<input name="name" maxLength={80} placeholder="例如：迁移架构师" /></label>
        <label>分类<input name="category" maxLength={40} placeholder="例如：Architecture" /></label>
        <label>一句话说明<input name="description" maxLength={180} placeholder="擅长什么，什么时候调用" /></label>
        <label>模型<input name="model" maxLength={60} placeholder="例如：DeepSeek-V4-Flash" /></label>
        <label>推理强度
          <select name="reasoning" defaultValue="高">
            {REASONING_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label>权限预设
          <select name="permission" defaultValue="workspace-write">
            {PERMISSION_PRESETS.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
          </select>
        </label>
        <label>系统指令<textarea name="instructions" rows={8} placeholder="写下角色、判断标准、工作流程和输出要求…" /></label>
        <label>附加技能（用逗号分隔）
          <input
            name="skills"
            maxLength={200}
            onChange={(event) => { setSkillsText(event.currentTarget.value) }}
            placeholder="brainstorming, frontend-design"
            value={skillsText}
          />
        </label>
        {skills.length > 0 && (
          <div className={css.skillChips}>
            {skills.map(skill => <span className={css.skillChip} key={skill}>{skill}</span>)}
          </div>
        )}
        {error !== '' && <p className={css.formError} role="alert">{error}</p>}
        {notWired && (
          <p className={css.formNotice} role="status">
            创建功能还没有接入数据服务，这个专家不会被保存。
          </p>
        )}
        <footer>
          <button type="button" className={css.ghostButton} onClick={onClose}>取消</button>
          <button type="submit" className={css.primaryCut}>创建专家</button>
        </footer>
      </form>
    </dialog>
  )
}

function DispatchDialog({ item, onClose }: { readonly item: ExpertRecord; readonly onClose: () => void }): ReactNode {
  return (
    <dialog className={css.dialog} open aria-labelledby="experts-dispatch-title">
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onClose() }}>
        <header><div><p>DISPATCH TO AGENT</p><h2 id="experts-dispatch-title">调用专家</h2></div><button type="button" className={css.dialogClose} onClick={onClose} aria-label="关闭">×</button></header>
        <div className={css.dispatchBadge}>{item.name}</div>
        <label>叠加输出风格<select defaultValue=""><option value="">不叠加风格</option><option value="concise">简洁清晰</option><option value="deep">深度分析</option></select></label>
        <label>本次任务<textarea rows={7} placeholder="告诉它这次要解决什么…" required /></label>
        <footer><button type="button" className={css.ghostButton} onClick={onClose}>取消</button><button type="submit" className={css.primaryCut}>送进 Agent →</button></footer>
      </form>
    </dialog>
  )
}

export function ExpertsPanel({ appPanels }: ExpertsPanelProps): ReactNode {
  const activePanel = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<DialogState>()
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return EXPERT_FIXTURE.filter(item => needle === '' || `${item.name} ${item.description}`.toLowerCase().includes(needle))
  }, [query])
  return (
    <section className={css.panel} data-experts-panel hidden={activePanel !== 'experts'} aria-label="Experts / 专家调用阵容">
      <header className={css.header}>
        <div className={css.titleLockup}>
          <span className={css.titleMark}>03</span>
          <div><strong>Experts</strong><small>专家调用阵容</small></div>
        </div>
        <span className={css.readOnly}>UI SHELL / FUNCTIONALITY NEXT</span>
      </header>
      <div className={css.viewport}><main className={css.content}>
        <section className={css.collectionHero}>
          <div>
            <p className={css.sectionKicker}>CALL THE RIGHT BRAIN</p>
            <h1>专家不是头像，<br /><span>是可调用的方法。</span></h1>
            <p>创建、组合并直接派发到 Agent。所有配置保存在本地 Markdown。</p>
          </div>
          <button className={css.giantAdd} type="button" onClick={() => { setDialog({ kind: 'create' }) }}>
            ＋<span>新增专家</span>
          </button>
        </section>
        <div className={css.collectionToolbar}>
          <label className={css.searchCut}>
            <span>⌕</span>
            <input aria-label="搜索专家" onChange={(event) => { setQuery(event.currentTarget.value) }} placeholder="搜索专家…" value={query} />
          </label>
          <span>{visible.length} 位专家</span>
        </div>
        <div className={css.expertGrid}>
          {visible.length === 0
            ? <div className={css.emptyRecords}><strong>专家阵容还是空的</strong><p>点击右上角新增，配置会保存为本地 Markdown。</p></div>
            : visible.map((item, index) => <ExpertCard item={item} index={index} key={item.id} onOpen={setDialog} />)}
        </div>
      </main></div>
      {dialog?.kind === 'record' && <RecordDialog onClose={() => { setDialog(undefined) }} state={dialog} />}
      {dialog?.kind === 'create' && <CreateExpertDialog onClose={() => { setDialog(undefined) }} />}
      {dialog?.kind === 'dispatch' && <DispatchDialog item={dialog.item} onClose={() => { setDialog(undefined) }} />}
    </section>
  )
}
