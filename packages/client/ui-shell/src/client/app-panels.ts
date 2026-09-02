/** Identifies a shell-level panel whose visibility `ctx.appPanels` controls. */
export type PanelId = 'agent' | 'knowledge' | 'experts' | 'styles' | 'monitor' | 'news'

/** Active app-panel visibility; slot registration owns render authority and lifecycle. */
export interface IAppPanels {
  /**
   * Selects the visible app panel.
   * @param id - panel to make active.
   */
  setActive: (id: PanelId) => void
  /**
   * Observes active-panel changes.
   * @param fn - callback invoked after the active panel changes.
   * @returns a function that removes the callback.
   */
  subscribe: (fn: () => void) => () => void
  /** @returns the currently visible app panel. */
  getSnapshot: () => PanelId
}

/** In-memory active app-panel observable owned by the shell plugin. */
export class AppPanelsController implements IAppPanels {
  #active: PanelId = 'agent'
  #listeners = new Set<() => void>()

  getSnapshot = (): PanelId => this.#active

  subscribe = (fn: () => void): (() => void) => {
    this.#listeners.add(fn)
    return () => { this.#listeners.delete(fn) }
  }

  setActive = (id: PanelId): void => {
    if (id === this.#active) return
    this.#active = id
    for (const listener of this.#listeners) listener()
  }
}
