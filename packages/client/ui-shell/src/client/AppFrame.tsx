/**
 * Shell frame, registered into the built-in 'root' slot (the web shell renders
 * only 'root'). Owns the grid tracks (app rail | sidebar | center | details) and
 * the floating activity surface,
 * the drag handles (pointer capture + rAF throttle), the concession
 * chain (columns.ts), and the child-slot render decisions: the sidebar slot
 * renders HERE with live parameters from the concession solve, and the
 * session-aware occupants render in fixed column positions; strict entries
 * gate themselves on current-session availability while session-maybe
 * entries retain identity. Pure component: everything arrives
 * through the three framework shares — zero cordis or framework imports,
 * zero self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  computeColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/** Fixed width in px reserved for persistent app-level navigation. */
export const RAIL_WIDTH = 72
/** Phone layouts keep a rail-sized grid track and paint the expanded sidebar as a drawer. */
export const SIDEBAR_DRAWER_MAX_VIEWPORT = 820

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'app.rail' | 'sidebar' | 'conversation' | 'details' | 'shell.activity' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>

/** Persistent app-level navigation column. */
function RailColumn(props: { children?: ReactNode }) {
  return <div className={css.railCol}>{props.children}</div>
}

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode; paddingRight: number }) {
  // The external Files sidebar reserves frame padding rather than a details track.
  const paddingRight = `max(0px, calc(${props.paddingRight}px - var(--dsh-sidebar-width, 0px)))`
  return <div className={css.centerCol} style={{ paddingRight }}>{props.children}</div>
}

/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/** Session-aware activity column; unlike details it is not user-resizable. */
function ActivityColumn(props: { children?: ReactNode; width: number }) {
  return <div className={css.activityCol} style={{ width: props.width }}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'details'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** The shell frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  actions,
  renderSlot,
  SessionProvider,
}: AppFrameProps) {
  const panels = useStore(s => s)
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: a narrow re-expand passes the preference
  // (or the default when the wide preference is closed) and the center
  // absorbs the squeeze.
  const contentViewport = Math.max(0, viewport - RAIL_WIDTH)
  const narrow = contentViewport < SIDEBAR_AUTO_COLLAPSE
  const sidebarDrawer = viewport <= SIDEBAR_DRAWER_MAX_VIEWPORT
  // The activity card floats over the right edge. It must not consume a grid
  // track, otherwise opening the top-right toolbar squeezes the conversation.
  const activityWidth = detailsSession === undefined || sidebarDrawer ? 0 : 320
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const cols = computeColumns(
    contentViewport,
    sidebarDrawer ? 0 : sidebarPreference,
    detailsSession === undefined ? 0 : panels.details,
  )
  const sidebarWidth = sidebarDrawer && !sidebarCollapsed
    ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, sidebarPreference))
    : cols.sidebar
  const sidebarTrack = sidebarDrawer ? SIDEBAR_COLLAPSED : cols.sidebar
  const colsRef = useRef(cols)
  colsRef.current = cols

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const detailsBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onDetailsStart = useCallback(() => { detailsBase.current = colsRef.current.details; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onDetailsDrag = useCallback((dx: number) => {
    actions.setDetails(detailsBase.current - dx)
  }, [actions])

  return (
    <div
      ref={frameRef}
      className={css.frame}
      // Keep a zero-width activity track for stable shell geometry; the card
      // itself is absolutely positioned and never participates in sizing.
      style={{ gridTemplateColumns: `${RAIL_WIDTH}px ${sidebarTrack}px minmax(0, 1fr) ${cols.details}px 0px` }}
      data-shell-frame
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-sidebar-drawer={sidebarDrawer || undefined}
      data-sidebar-drawer-open={sidebarDrawer && !sidebarCollapsed || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-activity-collapsed={activityWidth === 0 || undefined}
      data-dragging={dragging || undefined}
    >
      <RailColumn>{renderSlot('app.rail', {})}</RailColumn>
      <div className={css.sidebarCol} style={sidebarDrawer ? { width: sidebarWidth } : undefined}>
        {/* Render-site slot call with live concession output: a closed
            sidebar keeps the mounted slot at the compact-rail width, and the
            component sees its rendered state as owner params decided here
            (collapsed follows the resolved rail, so a derived auto-collapse
            renders the rail UI too). */}
        {renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: sidebarWidth,
        })}
      </div>
      <>
        {/* Both column occupants stay at fixed tree positions from first
            paint — no loading gate: a bare status line reads worse than
            the shell's own pending rendering. The conversation
            is session-maybe; SessionProvider withholds strict entries
            while no session is current. */}
        <CenterColumn paddingRight={Math.max(0, activityWidth - cols.details)}>{renderSlot('conversation', {})}</CenterColumn>
        <DetailsColumn><SessionProvider>{renderSlot('details', {})}</SessionProvider></DetailsColumn>
        <ActivityColumn width={activityWidth}><SessionProvider>{renderSlot('shell.activity', {})}</SessionProvider></ActivityColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {/* The collapsed sidebar is fixed-width: no resize handle while closed. */}
      {!sidebarCollapsed && !sidebarDrawer && <DragHandle side="sidebar" left={RAIL_WIDTH + cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {cols.details > 0 && <DragHandle side="details" left={RAIL_WIDTH + contentViewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
    </div>
  )
}
