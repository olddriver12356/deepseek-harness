/**
 * Active-panel service. Which application panel is showing is shell state, so
 * it lives beside the layout service rather than inside any one panel.
 *
 * This is deliberately an observable and not a slot election. Panels occupy
 * the list-kind 'shell.overlay' seat and every one of them stays mounted,
 * reading this snapshot to decide whether to render. An election would
 * dispose the losing entry, and a disposer collapses its declared child slots
 * recursively, which would destroy the Agent surface's draft, scroll position,
 * details width, and active session view on every panel change.
 */

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
