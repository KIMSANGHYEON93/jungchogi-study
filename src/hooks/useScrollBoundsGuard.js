import { useEffect } from 'react';

/**
 * 문서 끝을 넘어선 스크롤 위치를 문서 끝으로 되돌린다.
 *
 * iOS(사파리·크롬 모두 WebKit)에서 입력칸에 글을 쓰면 키보드가 올라오며 화면을 키보드 높이만큼 더
 * 내려 둔다. 키보드를 닫아도 그 위치가 남으면 문서 아래로 빈 공간이 생기고, 하단 탭바가 화면 중간에
 * 걸린 채 아래로 계속 내려가는 것처럼 보인다. 고무줄 튕김을 막아 두었기 때문에(overscroll-behavior)
 * 브라우저가 스스로 되돌리지도 않는다.
 *
 * @param {Window} [win]
 * @returns {boolean} 위치를 고쳤으면 true
 */
export function clampScrollToDocument(win = window) {
  const doc = win.document.documentElement;
  const max = Math.max(0, doc.scrollHeight - win.innerHeight);
  if (win.scrollY <= max + 1) return false;
  // html 에 scroll-behavior: smooth 가 있어 그냥 scrollTo 하면 빈 공간을 천천히 거슬러 올라간다
  win.scrollTo({ top: max, left: win.scrollX, behavior: 'instant' });
  return true;
}

const isTextField = (el) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/**
 * 키보드가 닫히는 때(입력칸에서 포커스가 빠질 때 · 화면 높이가 다시 커질 때)와
 * 문서 끝을 넘어 스크롤할 때 위치를 문서 끝으로 되돌린다.
 * 키보드가 내려가는 애니메이션이 끝난 뒤의 높이로 계산해야 해서 포커스 해제 뒤 잠깐 기다린다.
 */
export default function useScrollBoundsGuard(win = typeof window === 'undefined' ? null : window) {
  useEffect(() => {
    if (!win) return undefined;
    const timers = new Set();
    const later = () => {
      const t = win.setTimeout(() => {
        timers.delete(t);
        clampScrollToDocument(win);
      }, 300);
      timers.add(t);
    };
    const onFocusOut = (e) => {
      if (isTextField(e.target)) later();
    };
    const onScroll = () => {
      // 입력 중에는 키보드 위로 입력칸을 보여 주려고 브라우저가 일부러 내려 둔 것이다 — 건드리지 않는다
      if (!isTextField(win.document.activeElement)) clampScrollToDocument(win);
    };
    const vv = win.visualViewport;
    const onViewportResize = () => {
      if (!isTextField(win.document.activeElement)) later();
    };

    win.document.addEventListener('focusout', onFocusOut);
    win.addEventListener('scroll', onScroll, { passive: true });
    vv?.addEventListener('resize', onViewportResize);
    return () => {
      win.document.removeEventListener('focusout', onFocusOut);
      win.removeEventListener('scroll', onScroll);
      vv?.removeEventListener('resize', onViewportResize);
      for (const t of timers) win.clearTimeout(t);
    };
  }, [win]);
}
