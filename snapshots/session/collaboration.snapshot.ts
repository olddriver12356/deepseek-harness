/** Recorded ordinary Session roles driven through the shipped Web profile. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import {
  formatSystemPromptSnapshot, formatToolSchemasSnapshot, normalizedSystemPrompts, normalizedToolSchemas,
  normalizeSessionLog, redactSessionSnapshotIds, scrubSessionSnapshot, sessionFixtureName,
} from '@deepseek-ai/dsh-session-snapshot'
import { runDiscussionFlow } from '../../packages/host/collaboration/tests/discussion-flow.ts'

const directory = fileURLToPath(new URL('./collaboration-discussion/', import.meta.url))
const mode = process.env.DSH_SNAPSHOT ?? 'replay'

it(`${mode}s collaboration discussion with independent attributed Session roles`, async (test) => {
  const { logs, root, webOrigin } = await runDiscussionFlow(test, mode === 'record' ? {} : { replayDirectory: directory })
  const ordered = logs.sort((left, right) => String(JSON.parse(left.split('\n')[0]!).id).localeCompare(String(JSON.parse(right.split('\n')[0]!).id)))
  const context = { cwd: root, cwdAliases: [JSON.stringify(root).slice(1, -1)], sessionIds: ordered.map(log => String(JSON.parse(log.split('\n')[0]!).id)) }
  const normalized = redactSessionSnapshotIds(ordered.map(log => scrubSessionSnapshot(normalizeSessionLog(log, { ...context, sessionIds: [] }, { identityMode: 'preserve' }))))
  for (const [index, log] of normalized.entries()) {
    const path = join(directory, sessionFixtureName(index, 4))
    const suffix = index === 0 ? '' : `.${index}`
    const prompts = normalizedSystemPrompts(ordered[index]!, context)
    const schemas = normalizedToolSchemas(ordered[index]!, context)
    const prompt = formatSystemPromptSnapshot(prompts[0]!, prompts.slice(1))
      .replaceAll(webOrigin, '{{webOrigin}}')
      .replaceAll(fileURLToPath(new URL('../../', import.meta.url)), '{{checkout}}/')
    const schema = formatToolSchemasSnapshot(schemas[0]!, schemas.slice(1))
    if (mode === 'record' || mode === 'refresh') {
      await writeFile(path, log)
      await writeFile(join(directory, `system-prompt${suffix}.expected.md`), prompt)
      await writeFile(join(directory, `tool-schemas${suffix}.expected.json`), schema)
    }
    expect(log).toBe(await readFile(path, 'utf8'))
    expect(prompt).toBe(await readFile(join(directory, `system-prompt${suffix}.expected.md`), 'utf8'))
    expect(schema).toBe(await readFile(join(directory, `tool-schemas${suffix}.expected.json`), 'utf8'))
  }
}, 120000)
