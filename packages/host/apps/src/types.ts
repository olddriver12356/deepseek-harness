import type { PackageManager } from './manifest.ts'
export type { PackageManager, ProjectInspection } from './manifest.ts'
export type PortStrategy = 'fixed' | 'env' | 'long' | 'short'
export interface AppRegistration {
  /** Stable identity used for saved registration and lifecycle requests. */
  id: string
  /** Display name shown in the Apps surface. */
  name: string
  /** User-provided description shown with the application. */
  description: string
  /** Absolute project directory used as the process working directory. */
  directory: string
  /** Package manager used to execute the selected project script. */
  packageManager: PackageManager
  /** Package script selected for managed launches. */
  script: string
  /** Application URL opened after startup or external-process detection. */
  url: string
  /** TCP port used for startup checks and the selected port strategy. */
  port: number
  /** How the selected TCP port is passed to the application process. */
  strategy: PortStrategy
}
export interface AppSaveRequest { registration: AppRegistration }
export interface AppStartRequest { id: string; script?: string }
export interface AppIdRequest { id: string }
export interface AppInspectRequest { directory: string }
export interface AppSnapshot extends AppRegistration {
  state: 'stopped' | 'starting' | 'running' | 'external' | 'failed'
  activeUrl: string
  error: string
}
export interface AppsSnapshot { apps: AppSnapshot[] }
export interface AppLogs { stdout: string; stderr: string }
