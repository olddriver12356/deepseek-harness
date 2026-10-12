import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { PersonalWorker } from '../src/worker.ts'

it.each([
  { ready: 'null', reply: '{}', startupError: true },
  { ready: '{"ready":true,"tools":[{"name":7}]}', reply: '{}', startupError: true },
  { ready: '{"ready":true,"tools":[]}', reply: '{"id":"wrong","value":true}', startupError: false },
  { ready: '{"ready":true,"tools":[]}', reply: '{"id":1}', startupError: false },
])('rejects malformed worker protocol: $ready / $reply', async ({ ready, reply, startupError }) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-worker-protocol-'))
  await mkdir(join(root, 'runtime'))
  await writeFile(join(root, 'runtime/bridge.py'), [
    'import sys',
    `print(${JSON.stringify(ready)}, flush=True)`,
    'for line in sys.stdin:',
    `    print(${JSON.stringify(reply)}, flush=True)`,
  ].join('\n'))
  const worker = new PersonalWorker(root, 'python', root, root, 5000)
  try {
    if (startupError) await expect(worker.ready).rejects.toThrow('Invalid Personal Core response')
    else {
      await worker.ready
      await expect(worker.request({ kind: 'test' })).rejects.toThrow(
        reply.includes('wrong') ? 'Invalid Personal Core response' : 'Missing worker response value',
      )
    }
  } finally {
    await worker.close()
    await rm(root, { recursive: true, force: true })
  }
})
