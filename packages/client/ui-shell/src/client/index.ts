/**
 * Layout plugin, browser half: one register() call contributes AppFrame into
 * the runtime's built-in 'root' slot and, in the same breath, declares the
 * five child slots (declaration = exclusive render authority), seats the
 * layout store (panel geometry), and wires the panel-action service face.
 * ctx.layout is the cross-plugin panel-action contract; ctx.appPanels owns
 * active app-panel visibility without electing slots or panel lifecycles.
 * Navigation state lives with the runtime sessions service. A second effect
 * seats the theme presenter, which projects ctx.theme snapshots onto document.body.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls the generated Remote API and the ctx.remote merge, for the activity card's goal verbs.
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the Session Controller service the goal CAS ref is read through.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: the `goal` SessionProjectionMap key merge, owned by the goal domain.
import type { GoalProjection, GoalRef } from '@deepseek-ai/dsh-goal/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { AppPanelsController } from './app-panels.ts'
import { AppFrame } from './AppFrame.tsx'
import { LiveSignalPanel } from './LiveSignalPanel.tsx'
import { createLayoutStore } from './stores.ts'
import { LayoutController } from './service.ts'
import { ThemePresenter } from './theme-presenter.ts'
import { en, zh } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-locale/client'

// Contract exports only (export-convergence rule: cross-package consumers
// keep a symbol exported; test-only/package-internal symbols live off /src).
// ILayout: the ctx.layout face consumers and test fakes type against.
// OwnerShare contracts below are the render-side halves registrants compose
// against; the frame components and the store factory are package-internal.
export { LayoutController } from './service.ts'
export type { ILayout } from './service.ts'
export { AppPanelsController } from './app-panels.ts'
export type { IAppPanels, PanelId } from './app-panels.ts'

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Active app-panel visibility subscription; slot ownership remains separate. */
    appPanels: import('./app-panels.ts').IAppPanels
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { shell: keyof typeof en }
  interface SlotMap {
    // The 'root' entry itself is the runtime's built-in slot (declared
    // there); these six are the frame's children, declared by the same
    // register() call that contributes AppFrame. Session owners never pass
    // sessionId: the framework injects it as a standard prop.
    /**
     * The persistent application rail: a fixed-width leftmost track holding
     * app-level navigation. It is separate from the sidebar on purpose,
     * because app navigation and session navigation are different axes and
     * the sidebar collapses while the rail does not.
     */
    'shell.app-overlay': { kind: 'list'; scope: 'session-maybe' }
    /** Register the persistent app navigation rail; receives no owner props and is empty when unoccupied. */
    'app.rail': { kind: 'single'; scope: 'root'; owner: RailOwnerProps }
    /** Session-aware right activity surface; independent from tool details. */
    'shell.activity': { kind: 'single'; scope: 'session'; owner: ActivityOwnerProps }
    /**
     * Session-scoped selector row inside the Live Signal card, between the
     * Goal and Pending sections. A Session-scoped selection plugin (Expert,
     * Style, ...) registers here; the card itself carries no opinion about
     * what a selector does with its choice.
     */
    'shell.activity.selectors': { kind: 'list'; scope: 'session' }
    /** Explicit conversation capture contributed by the Knowledge plugin. */
    'shell.activity.capture': { kind: 'single'; scope: 'session'; owner: { readonly className: string | undefined } }
  }
}

/** App rail owner share: the fixed track exposes no frame state. */
export interface RailOwnerProps {}

export type { SidebarOwnerProps } from '@deepseek-ai/dsh-client-ui-layout/client'

/** Conversation owner share: business state and actions belong to the registrant. */
export interface ConvOwnerProps {}

/** Details owner share: empty — sessionId arrives as a framework-standard prop. */
export interface DetailsOwnerProps {}

/**
 * Settled outcome of one goal mutation. Declared structurally rather than imported from ui-goal:
 * the two plugins share the Remote API plane, never each other's values.
 */
export type GoalActionResult = RemoteResult<unknown> | {
  readonly ok: false
  readonly error: { readonly code: 'no-current-goal'; readonly message: string }
}

/** Activity owner share: the shell supplies no extra data. */
export interface ActivityOwnerProps {}

/**
 * Injected business face of the activity registrant: the four goal mutation verbs the Live
 * Signal card offers over the session's projected goal. The live goal value itself arrives
 * through `useProjection('goal')`, so it is deliberately absent here. There is no create verb:
 * the Goal Remote has none, and goal creation stays with the `/goal` command.
 */
export interface ActivityInjected {
  /** Replace the current goal's objective (CAS on the projected ref). */
  onEditGoal: (objective: string) => Promise<GoalActionResult>
  /** Pause an active goal. */
  onPauseGoal: () => Promise<GoalActionResult>
  /** Resume a paused goal. */
  onResumeGoal: () => Promise<GoalActionResult>
  /** Clear the current goal (tombstone). */
  onClearGoal: () => Promise<GoalActionResult>
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'theme', 'sessions', 'uiSession', 'remote', 'remote.goals', 'locale']

/**
 * Client plugin body: provide the shell services, then one register() call — AppFrame
 * into 'root' with the six child-slot declarations, the layout store seat,
 * and the inject hook that hands the store's bound actions to the service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const handle = createLayoutStore()
    const instance = handle.create()
    const store: typeof handle = { ...handle, create: () => instance }
    const layout = new LayoutController(instance.actions, id =>
      ctx.slots.entries('main').some(entry => entry.options.key === id))
    const retainMainPanels = (): void => {
      instance.actions.retainMainPanels(ctx.slots.entries('main').flatMap(entry =>
        entry.options.key === undefined ? [] : [entry.options.key]))
    }
    const panelInfo: HostObservable<PanelInfo> = {
      getSnapshot: () => instance.getSnapshot().panelInfo,
      subscribe: listener => instance.subscribe(listener),
    }
    const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo } })
    const appPanels = new AppPanelsController()
    const disposeAppPanels = ctx.reflect.provide('appPanels', appPanels)
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      locale: 'shell',
      children: {
        'shell.app-overlay': { kind: 'list', scope: 'session-maybe' },
        'app.rail': { kind: 'single', scope: 'root' },
        'shell.activity': { kind: 'single', scope: 'session' },
        'sidebar': { kind: 'single', scope: 'root' },
        'main': { kind: 'keyed', scope: 'root' },
        'rightbar': { kind: 'single', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
      store,
    }, AppFrame)
    const disposePanels = ctx.slots.subscribe('main', retainMainPanels)
    retainMainPanels()
    return () => {
      void disposeAppPanels()
      layout.dispose()
      disposePanels()
      disposeRegistration()
      disposePanelInfo()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-shell: service + root registration')

  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'ui-shell: theme presenter')

  ctx.effect(() => ctx.locale.register('shell', { en, zh }), 'ui-shell: dictionaries')

  const sessions = ctx.sessions

  /** The session's current projected CAS ref, read at verb call time; the RPC's own CAS is the staleness guard. */
  const goalRefOf = (sessionId: SessionId): GoalRef | undefined => {
    const face = sessions.binding(sessionId)?.session.projections.faceOf('goal')
    const projection = face?.getSnapshot() as GoalProjection | null | undefined
    if (projection == null) return undefined
    return { id: projection.goal.id, revision: projection.goal.revision }
  }

  const noCurrentGoal: GoalActionResult = {
    ok: false,
    error: { code: 'no-current-goal', message: 'no current goal to mutate' },
  }

  ctx.effect(
    () => ctx.slots.inject('shell.activity', () => ctx.slots.register({
      name: 'shell.activity',
      children: {
        'shell.activity.selectors': { kind: 'list', scope: 'session' },
        'shell.activity.capture': { kind: 'single', scope: 'session' },
      },
      inject: (sessionId: SessionId): ActivityInjected => ({
        onEditGoal: async (objective) => {
          const ref = goalRefOf(sessionId)
          if (ref === undefined) return noCurrentGoal
          return await ctx.remote.goals.edit(sessionId, ref, { objective })
        },
        onPauseGoal: async () => {
          const ref = goalRefOf(sessionId)
          if (ref === undefined) return noCurrentGoal
          return await ctx.remote.goals.pause(sessionId, ref)
        },
        onResumeGoal: async () => {
          const ref = goalRefOf(sessionId)
          if (ref === undefined) return noCurrentGoal
          return await ctx.remote.goals.resume(sessionId, ref)
        },
        onClearGoal: async () => {
          const ref = goalRefOf(sessionId)
          if (ref === undefined) return noCurrentGoal
          return await ctx.remote.goals.clear(sessionId, ref)
        },
      }),
    }, LiveSignalPanel)),
    'ui-shell: activity slot registration',
  )
}
