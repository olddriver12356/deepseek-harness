export * from './columns.ts'
export * from './service.ts'
export * from './stores.ts'
export * from './DocumentTitle.tsx'
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Panel navigation and geometry shared by both shell providers. */
    layout: import('./service.ts').ILayout
  }
}
/** Shared browser module; consumers own the root registration. */
export function apply(): void {}
