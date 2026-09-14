import type { PackageManager } from './manifest.ts'
export type { PackageManager, ProjectInspection } from './manifest.ts'
export type PortStrategy = 'fixed' | 'env' | 'long' | 'short'
export interface AppRegistration {
  id: string
  name: string
  description: string
  directory: string
  packageManager: PackageManager
  script: string
  url: string
  port: number
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
