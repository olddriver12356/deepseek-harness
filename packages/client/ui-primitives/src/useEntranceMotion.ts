/** Short presentation-only entrances; callers own activation and content identity. */
import { useLayoutEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'

/**
 * Animate an explicitly attached surface, reverting styles on interruption.
 * @param active - Whether the surface is visible.
 * @param revision - User-driven identity; ordinary data updates must not change it.
 * @param kind - Panel translation, native-dialog scale, or bounded card opacity.
 * @returns Ref for the surface owned by the caller.
 */
export function useEntranceMotion<T extends HTMLElement>(active: boolean, revision: string | number = 0, kind: 'panel' | 'dialog' | 'cards' = 'panel') {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!active || !element) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) return
    const targets = kind === 'cards'
      ? Array.from(element.querySelectorAll<HTMLElement>('[data-entrance-card]')).filter((card) => {
        const rect = card.getBoundingClientRect()
        const bounds = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && rect.bottom > Math.max(0, bounds.top)
          && rect.top < Math.min(window.innerHeight, bounds.bottom)
          && rect.right > Math.max(0, bounds.left) && rect.left < Math.min(window.innerWidth, bounds.right)
      }).slice(0, 8)
      : element
    if (Array.isArray(targets) && targets.length === 0) return
    let reverted = false
    const revert = (animation: { revert(): unknown }) => {
      if (reverted) return
      reverted = true
      animation.revert()
    }
    const animation = animate(targets, {
      opacity: [0, 1],
      ...(kind === 'dialog' ? { scale: [0.98, 1] } : kind === 'panel' ? { translateY: [6, 0] } : { delay: stagger(25) }),
      duration: kind === 'dialog' ? 160 : 180,
      ease: 'outQuad',
      onComplete: revert,
    })
    const onChange = () => { if (media.matches) revert(animation) }
    media.addEventListener('change', onChange)
    return () => { media.removeEventListener('change', onChange); revert(animation) }
  }, [active, revision, kind])
  return ref
}
