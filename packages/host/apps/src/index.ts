import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { inspectProject, validateAppUrl } from './manifest.ts'
import { AppsRuntime, type RuntimeConfig } from './runtime.ts'
import type { AppRegistration, AppIdRequest, AppSaveRequest, AppStartRequest, AppInspectRequest, AppsSnapshot, AppSnapshot, AppLogs, ProjectInspection } from './types.ts'
export type * from './types.ts'

export const Config: z<RuntimeConfig> = z.object({
  startupTimeoutMs: z.number().min(1000).default(60000),
  graceMs: z.number().min(100).default(3000),
  logBytes: z.number().min(1024).default(65536),
  portAttempts: z.number().min(1).max(1000).step(1).default(100),
})
const registrationSchema: z<AppRegistration> = z.object({
  id: z.string().required(), name: z.string().required(), description: z.string().default(''), directory: z.string().required(),
  packageManager: z.union(['npm', 'pnpm', 'yarn', 'bun']).required(), script: z.string().required(), url: z.string().required(),
  port: z.number().min(1).max(65535).step(1).required(), strategy: z.union(['fixed', 'env', 'long', 'short']).required(),
})

/** Registered application management; no workspace scanning or dependency writes. */
export class AppsService extends TypertRemoteService {
  static Config = Config
  static inject = ['settings', 'subprocess']
  private scope: SettingsScope<{ apps: AppRegistration[] }>
  private runtime: AppsRuntime
  private writes: Promise<unknown> = Promise.resolve()
  constructor(ctx: Context, config: RuntimeConfig) {
    super(ctx, 'apps')
    this.scope = ctx.settings.register('local-apps', z.object({ apps: z.array(registrationSchema).default([]) }))
    this.runtime = new AppsRuntime(ctx.subprocess, config)
    ctx.effect(() => () => this.runtime.dispose(), 'apps: terminate managed applications')
  }
  private find(id: string): AppRegistration {
    const app = this.scope.get().apps.find(item => item.id === id)
    if (!app) throw new Error('Unknown application')
    return app
  }
  private write<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writes.then(fn, fn)
    this.writes = next.catch(() => {})
    return next
  }
  @Remote('list')
  async list(): Promise<AppsSnapshot> { return { apps: this.scope.get().apps.map(app => this.runtime.snapshot(app)) } }
  @Remote('inspect')
  async inspect(request: AppInspectRequest): Promise<ProjectInspection> { return inspectProject(request.directory) }
  @Remote('save')
  async save(request: AppSaveRequest): Promise<AppRegistration> {
    return this.write(async () => {
      const app = registrationSchema(request.registration)
      if (app.id && this.runtime.busy(app.id)) throw new Error('Stop the application before editing')
      if (app.id) this.find(app.id)
      const inspected = await inspectProject(app.directory)
      if (!Object.hasOwn(inspected.scripts, app.script)) throw new Error('Select an existing package script')
      const saved = { ...app, id: app.id || randomUUID(), directory: inspected.directory, url: validateAppUrl(app.url) }
      const url = new URL(saved.url); url.port = String(saved.port); saved.url = url.href
      if (!saved.name.trim()) throw new Error('Application name is required')
      const apps = this.scope.get().apps
      const key = (path: string): string => process.platform === 'win32' ? path.toLowerCase() : path
      if (apps.some(other => other.id !== saved.id && key(other.directory) === key(saved.directory))) throw new Error('Project already registered')
      await this.scope.update({ apps: app.id ? apps.map(other => other.id === saved.id ? saved : other) : [...apps, saved] })
      this.runtime.forget(saved.id)
      return saved
    })
  }
  @Remote('unregister')
  async unregister(request: AppIdRequest): Promise<void> {
    return this.write(async () => {
      this.find(request.id)
      if (this.runtime.busy(request.id)) throw new Error('Stop the application before removing it')
      await this.scope.update({ apps: this.scope.get().apps.filter(app => app.id !== request.id) })
      this.runtime.forget(request.id)
    })
  }
  @Remote('start')
  async start(request: AppStartRequest): Promise<AppSnapshot> {
    return this.write(() => this.runtime.start(this.find(request.id), request.script))
  }
  @Remote('stop')
  async stop(request: AppIdRequest): Promise<void> { this.find(request.id); await this.runtime.stop(request.id) }
  @Remote('logs')
  async logs(request: AppIdRequest): Promise<AppLogs> { this.find(request.id); return this.runtime.logs(request.id) }
  @Remote('confirmExternal')
  async confirmExternal(request: AppIdRequest): Promise<void> {
    await this.write(() => this.runtime.confirmExternal(this.find(request.id)))
  }
}
export default AppsService
