import type { PackageManager } from './manifest.ts'
export type { PackageManager, ProjectInspection } from './manifest.ts'
/**
 * How a managed application receives its selected port.
 */
export type PortStrategy = 'fixed' | 'env' | 'long' | 'short'
/**
 * Saved application identity, launch script, directory, and local endpoint.
 */
export interface AppRegistration {
  /** Omitted on existing records, which remain browser applications. */
  kind?: 'web' | 'desktop'
  /** Absolute executable path for trusted desktop applications. */
  executable?: string
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
/**
 * Application registration to create or replace.
 */
export interface AppSaveRequest { registration: AppRegistration }
/**
 * Registered application to start with an optional script override.
 */
export interface AppStartRequest { id: string; script?: string }
/**
 * Registered application identity for a lifecycle or log request.
 */
export interface AppIdRequest { id: string }
/**
 * Explicit project directory to inspect.
 */
export interface AppInspectRequest { directory: string }
/**
 * Registration with its live process state, endpoint, and last error.
 */
export interface AppSnapshot extends AppRegistration {
  state: 'stopped' | 'starting' | 'running' | 'external' | 'failed'
  activeUrl: string
  error: string
}
/**
 * Live states of all registered applications.
 */
export interface AppsSnapshot { apps: AppSnapshot[] }
/**
 * Bounded retained stdout and stderr from a managed application.
 */
export interface AppLogs { stdout: string; stderr: string }
