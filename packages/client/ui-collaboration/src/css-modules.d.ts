/** Bundler-resolved feature styles. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
