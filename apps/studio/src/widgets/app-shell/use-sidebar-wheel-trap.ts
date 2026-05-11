import { type RefObject, useEffect } from 'react';

/**
 * Блокирует scroll chaining: колесо над сайдбаром не прокручивает `main`, если
 * внутри колонки некуда скроллить или уже упёрлись в край — как у shadcn Sidebar.
 *
 * Без `{ passive: false }` браузер всё равно отдаёт delta ближайшему предку с overflow.
 */
export function useSidebarWheelTrap(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY === 0 && e.deltaX === 0) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) {
        e.preventDefault();
        return;
      }
      const top = el.scrollTop;
      const isAtTop = top <= 0;
      const isAtBottom = top + el.clientHeight >= el.scrollHeight - 1;
      const dy = e.deltaY;
      if ((dy < 0 && isAtTop) || (dy > 0 && isAtBottom)) {
        e.preventDefault();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
}
