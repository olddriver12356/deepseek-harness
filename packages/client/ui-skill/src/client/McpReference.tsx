/** Inert server documentation with selected tool manuals and complete advanced schemas. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ToolReferenceDetail } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type { PanelTranslate, PanelKey } from './panel-locales.ts'
import css from './ReferenceCatalog.module.css'

function object(value: JsonValue | undefined): { [key: string]: JsonValue } | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}
function SchemaFields({ schema, t }: { schema: JsonValue; t: PanelTranslate }) {
  const root = object(schema)
  const properties = object(root?.properties)
  const complexKeys = ['$ref', '$dynamicRef', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else',
    'dependentRequired', 'dependencies', 'dependentSchemas']
  const complex = root !== undefined && complexKeys.some(key => key in root)
  if (properties === undefined || complex) return <p>{t('referenceComplexSchema')}</p>
  const required = Array.isArray(root?.required) ? root.required : []
  return <dl>{Object.entries(properties).map(([name, value]) => {
    const field = object(value)
    const type = field?.type
    const typeLabel = typeof type === 'string' ? type : Array.isArray(type) ? type.filter(item => typeof item === 'string').join(' | ') : ''
    return <div key={name}><dt><code>{name}</code> · {t(required.includes(name) ? 'referenceRequired' : 'referenceOptional')}{typeLabel === '' ? '' : ` · ${typeLabel}`}</dt><dd>
      {typeof field?.description === 'string' && <p className={css.literal}>{field.description}</p>}
      {field?.default !== undefined && <p>{t('referenceDefault')}: <code>{JSON.stringify(field.default)}</code></p>}
      {Array.isArray(field?.enum) && <p>{t('referenceAccepted')}: <code>{field.enum.map(item => JSON.stringify(item)).join(', ')}</code></p>}
      {field?.properties !== undefined && <details><summary>{t('referenceNestedFields')}</summary><SchemaFields schema={value} t={t} /></details>}
      {object(field?.items) !== undefined && <details><summary>{t('referenceArrayItems')}</summary><SchemaFields schema={field?.items ?? null} t={t} /></details>}
      {field !== undefined && ['$ref', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else'].some(key => key in field) && <p>{t('referenceComplexSchema')}</p>}
    </dd></div>
  })}</dl>
}

/**
 * Render one supervisor snapshot without provider IO or executable content.
 * @param props - live connection observation and locale-owned labels.
 * @returns selected tool documentation with lossless collapsed schema views.
 */
export function McpReference({ detail, t }: { detail: Extract<ToolReferenceDetail, { kind: 'mcp' }>; t: PanelTranslate }) {
  const [selected, setSelected] = useState('')
  if ('code' in detail) return <p>{t('referenceUnavailable')}</p>
  const states = { connecting: 'referenceConnecting', connected: 'referenceConnected', reconnecting: 'referenceReconnecting', disconnected: 'referenceDisconnected', failed: 'referenceFailed' } as const satisfies Record<string, PanelKey>
  const tool = detail.tools.find(item => item.publicName === selected) ?? detail.tools[0]
  return <article className={css.manual}>
    <dl><dt>{t('referenceConnection')}</dt><dd>{t(states[detail.state])}</dd><dt>{t('referenceTransport')}</dt><dd>{detail.transport}</dd></dl>
    <h3>{t('referenceInstructions')}</h3><p className={css.literal}>{detail.instructions || t('referenceNoInstructions')}</p>
    <h3>{t('referenceTools')}</h3>{detail.toolsAvailability === 'unavailable' ? <p>{t('referenceToolsUnavailable')}</p> : <>
      <div className={css.toolList}>{detail.tools.map(item => <Button key={item.publicName} variant="ghost" aria-pressed={tool?.publicName === item.publicName} onClick={() => { setSelected(item.publicName) }}>{item.rawName}</Button>)}</div>
      {tool !== undefined && <section key={tool.publicName}>
        <h4>{tool.rawName}</h4><code>{tool.publicName}</code><p className={css.literal}>{tool.description || t('referenceMissingDescription')}</p>
        <h4>{t('referenceArguments')}</h4><SchemaFields schema={tool.inputSchema} t={t} />
        <details><summary>{t('referenceInputSchema')}</summary><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></details>
        {tool.outputSchema !== undefined && <details><summary>{t('referenceOutputSchema')}</summary><pre>{JSON.stringify(tool.outputSchema, null, 2)}</pre></details>}
        {tool.annotations !== undefined && <details><summary>{t('referenceAnnotations')}</summary><pre>{JSON.stringify(tool.annotations, null, 2)}</pre></details>}
      </section>}
    </>}
  </article>
}
