import { useRef, useEffect, useState } from 'react';

const THRESHOLD  = 72;   // px to pull before triggering refresh
const COMMIT_PX  = 20;   // px of downward movement before we "own" the gesture

export function usePullToRefresh(onRefresh, scrollRef) {
  const [pulling, setPulling]   = useState(false);
  const [distance, setDistance] = useState(0);
  const startY    = useRef(0);
  const committed = useRef(false); // true once we've taken ownership of the gesture

  useEffect(() => {
    const el = scrollRef?.current || window;

    function getScrollTop() {
      return scrollRef?.current ? scrollRef.current.scrollTop : window.scrollY;
    }

    function onTouchStart(e) {
      committed.current = false;
      if (getScrollTop() > 0) return;
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e) {
      if (getScrollTop() > 0) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        committed.current = false;
        return;
      }
      // Only take ownership (and block native scroll) once clearly pulling down
      if (!committed.current && delta > COMMIT_PX) {
        committed.current = true;
      }
      if (committed.current) {
        e.preventDefault();
        setDistance(Math.min(delta * 0.45, THRESHOLD + 24));
        setPulling(delta > THRESHOLD);
      }
    }

    async function onTouchEnd() {
      if (!committed.current) return;
      const wasPulling = pulling;
      committed.current = false;
      setDistance(0);
      setPulling(false);
      if (wasPulling) await onRefresh();
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [onRefresh, pulling, scrollRef]);

  return { pulling, distance };
}
