import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Delay the Session-scoped dialog until the shell has selected a Session.
 * @param props - Ordinary shell binding and child renderer supplied by the slot owner.
 * @returns the selected Session's dialog outlet, or nothing in the blank shell.
 */
export function BoardOutlet({ sessionId, renderSlot }: PropsRuntime<'shell.app-overlay'> & PropsRenderSlots<'collaboration.board'>) {
  return sessionId === undefined ? null : renderSlot('collaboration.board', {})
}
