import { randomUUID } from 'node:crypto'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { inspectProject, validateAppUrl } from './manifest.ts'
import { AppsRuntime, type RuntimeConfig } from './runtime.ts'
import type { AppRegistration, AppIdRequest, AppSaveRequest, AppStartRequest, AppInspectRequest, AppsSnapshot, AppSnapshot, AppLogs, ProjectInspection } from './types.ts'
export type * from './types.ts'

const registrationSchema: z<AppRegistration> = z.object({
  id: z.string().required(), name: z.string().required(), description: z.string().default(''), directory: z.string().required(),
  packageManager: z.union(['npm', 'pnpm', 'yarn', 'bun']).required(), script: z.string().required(), url: z.string().required(),
  port: z.number().min(1).max(65535).step(1).required(), strategy: z.union(['fixed', 'env', 'long', 'short']).required(),
})

/** Launcher settings and live registered applications. */
export interface Config extends RuntimeConfig {
  /** Explicit application registrations persisted in this profile entry. */
  apps: Volatile<AppRegistration[]>
}

export const Config = z.object({
  startupTimeoutMs: z.number().min(1000).default(60000),
  graceMs: z.number().min(100).default(3000),
  logBytes: z.number().min(1024).default(65536),
  portAttempts: z.number().min(1).max(1000).step(1).default(100),
  apps: z.array(registrationSchema).default([]).volatile(),
})

/** Registered application management; no workspace scanning or dependency writes. */
export class AppsService extends TypertRemoteService {
  static Config = Config
  static inject = ['settings', 'subprocess']
  private runtime: AppsRuntime
  private readonly entryId: string | undefined
  private writes: Promise<unknown> = Promise.resolve()
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'apps')
    this.entryId = ctx.fiber.entry?.options.id
    this.runtime = new AppsRuntime(ctx.subprocess, config)
    ctx.effect(() => () => this.runtime.dispose(), 'apps: terminate managed applications')
  }
  private find(id: string): AppRegistration {
    const app = this.config.apps.get().find(item => item.id === id)
    if (!app) throw new Error('Unknown application')
    return app
  }
  private write<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writes.then(fn, fn)
    this.writes = next.catch(() => {})
    return next
  }
  private async saveRegistrations(apps: AppRegistration[]): Promise<void> {
    const entry = this.entryId
    if (entry === undefined) throw new Error('Application registration requires a profile entry')
    await this.ctx.settings.update(entry, { apps })
  }
  /**
   * Read the live states of saved registrations.
   * @returns All registered application snapshots.
   */
  @Remote('list')
  async list(): Promise<AppsSnapshot> { return { apps: this.config.apps.get().map(app => this.runtime.snapshot(app)) } }
  /**
   * Inspect an explicitly selected project without executing its scripts.
   * @param request - Project directory to inspect.
   * @returns Validated project metadata.
   */
  @Remote('inspect')
  async inspect(request: AppInspectRequest): Promise<ProjectInspection> { return inspectProject(request.directory) }
  /**
   * Validate and persist an idle application registration; duplicate project directories fail.
   * @param request - Registration to create or replace.
   * @returns Saved registration with canonical directory and local endpoint.
   */
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
      const apps = this.config.apps.get()
      const key = (path: string): string => process.platform === 'win32' ? path.toLowerCase() : path
      if (apps.some(other => other.id !== saved.id && key(other.directory) === key(saved.directory))) throw new Error('Project already registered')
      await this.saveRegistrations(app.id ? apps.map(other => other.id === saved.id ? saved : other) : [...apps, saved])
      this.runtime.forget(saved.id)
      return saved
    })
  }
  /**
   * Remove a stopped registration without deleting project files.
   * @param request - Application identity.
   */
  @Remote('unregister')
  async unregister(request: AppIdRequest): Promise<void> {
    return this.write(async () => {
      this.find(request.id)
      if (this.runtime.busy(request.id)) throw new Error('Stop the application before removing it')
      await this.saveRegistrations(this.config.apps.get().filter(app => app.id !== request.id))
      this.runtime.forget(request.id)
    })
  }
  /**
   * Start an explicitly selected registered application.
   * @param request - Application identity and optional script override.
   * @returns Initial or existing live snapshot.
   */
  @Remote('start')
  async start(request: AppStartRequest): Promise<AppSnapshot> {
    return this.write(() => this.runtime.start(this.find(request.id), request.script))
  }
  /**
   * Stop the selected managed application.
   * @param request - Application identity.
   */
  @Remote('stop')
  async stop(request: AppIdRequest): Promise<void> { this.find(request.id); await this.runtime.stop(request.id) }
  /**
   * Read retained output for the selected application.
   * @param request - Application identity.
   * @returns Bounded stdout and stderr.
   */
  @Remote('logs')
  async logs(request: AppIdRequest): Promise<AppLogs> { this.find(request.id); return this.runtime.logs(request.id) }
  /**
   * Confirm readiness of the selected external application without managing its process.
   * @param request - Application identity.
   */
  @Remote('confirmExternal')
  async confirmExternal(request: AppIdRequest): Promise<void> {
    await this.write(() => this.runtime.confirmExternal(this.find(request.id)))
  }
}
export default AppsService
