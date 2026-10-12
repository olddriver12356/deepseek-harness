export * from './columns.ts'
export * from './service.ts'
export * from './stores.ts'
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Panel navigation and geometry shared by both shell providers. */
    layout: import('./service.ts').ILayout
  }
}
