/**
 * useEdgeAutoScroll — inertial scrolling when the pointer nears a list edge.
 *
 * Extracted from `features/layout/Sidebar.tsx`, which carried two byte-for-byte
 * copies of this logic: one for the thread list and one for the search modal.
 * Both now share this hook.
 *
 * Behaviour: moving the pointer into the top or bottom 30% of the container
 * accelerates a scroll in that direction; leaving the container (or resting at
 * the edge) decelerates it back to a stop.
 *
 * Public API:
 *   const { scrollContainerRef, handleMouseMove, handleMouseLeave } =
 *     useEdgeAutoScroll(active);
 */
import { useCallback, useEffect, useRef, type RefObject } from "react";

export interface EdgeAutoScroll {
  /** Attach to the scrollable element. */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  /** Attach to the element's onMouseMove. */
  handleMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Attach to the element's onMouseLeave. */
  handleMouseLeave: () => void;
}

/** Fraction of the container height that acts as the scroll edge zone. */
const EDGE_THRESHOLD = 0.3;
/** Maximum pixels scrolled per frame at the very edge. */
const MAX_SPEED = 4.5;

export function useEdgeAutoScroll(active: boolean): EdgeAutoScroll {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(0);
  const targetSpeedRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const scrollHoverTimerRef = useRef<number | null>(null);

  const step = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const currentSpeed = speedRef.current;
    const target = targetSpeedRef.current;
    const newSpeed = currentSpeed + (target - currentSpeed) * 0.15;

    if (Math.abs(newSpeed) < 0.05 && Math.abs(target) < 0.05) {
      speedRef.current = 0;
      targetSpeedRef.current = 0;
      animFrameRef.current = 0;
      return;
    }

    speedRef.current = newSpeed;
    const maxScroll = container.scrollHeight - container.clientHeight;
    container.scrollTop = Math.min(Math.max(container.scrollTop + newSpeed, 0), maxScroll);

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    if (active) {
      animFrameRef.current = requestAnimationFrame(step);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
    };
  }, [step, active]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;

      let newTarget = 0;
      if (y < height * EDGE_THRESHOLD) {
        const fraction = 1 - y / (height * EDGE_THRESHOLD);
        newTarget = -MAX_SPEED * fraction;
      } else if (y > height * (1 - EDGE_THRESHOLD)) {
        const fraction = (y - height * (1 - EDGE_THRESHOLD)) / (height * EDGE_THRESHOLD);
        newTarget = MAX_SPEED * fraction;
      }

      targetSpeedRef.current = newTarget;

      if (animFrameRef.current === 0) {
        animFrameRef.current = requestAnimationFrame(step);
      }

      if (scrollHoverTimerRef.current !== null) {
        clearTimeout(scrollHoverTimerRef.current);
        scrollHoverTimerRef.current = null;
      }
    },
    [step],
  );

  const handleMouseLeave = useCallback(() => {
    const decelerate = () => {
      const current = targetSpeedRef.current;
      if (Math.abs(current) < 0.1) {
        targetSpeedRef.current = 0;
        return;
      }
      targetSpeedRef.current = current * 0.85;
      scrollHoverTimerRef.current = window.setTimeout(decelerate, 16);
    };
    decelerate();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollHoverTimerRef.current !== null) {
        clearTimeout(scrollHoverTimerRef.current);
      }
    };
  }, []);

  return { scrollContainerRef, handleMouseMove, handleMouseLeave };
}
