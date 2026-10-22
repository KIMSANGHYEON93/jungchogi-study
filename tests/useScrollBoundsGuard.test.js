// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import useScrollBoundsGuard, { clampScrollToDocument } from '../src/hooks/useScrollBoundsGuard.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** 문서 높이 1000 · 화면 높이 800 → 내려갈 수 있는 끝은 200 */
function fakeWindow(scrollY) {
  const listeners = {};
  const doc = document;
  Object.defineProperty(doc.documentElement, 'scrollHeight', { configurable: true, value: 1000 });
  const win = {
    document: doc,
    innerHeight: 800,
    scrollX: 0,
    scrollY,
    scrollTo: vi.fn(({ top }) => { win.scrollY = top; }),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: (type) => { delete listeners[type]; },
    visualViewport: null,
    fire: (type) => listeners[type]?.(),
  };
  return win;
}

describe('clampScrollToDocument', () => {
  it('문서 끝을 넘어선 위치(키보드 높이만큼 남은 빈 공간)를 끝으로 되돌린다', () => {
    const win = fakeWindow(460);
    expect(clampScrollToDocument(win)).toBe(true);
    expect(win.scrollTo).toHaveBeenCalledWith({ top: 200, left: 0, behavior: 'instant' });
  });

  it('문서 안의 위치는 건드리지 않는다', () => {
    const win = fakeWindow(150);
    expect(clampScrollToDocument(win)).toBe(false);
    expect(win.scrollTo).not.toHaveBeenCalled();
  });
});

describe('useScrollBoundsGuard', () => {
  let container;
  let root;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.useRealTimers();
  });

  function mount(win) {
    function Probe() {
      useScrollBoundsGuard(win);
      return null;
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(createElement(Probe)));
  }

  it('입력칸에서 포커스가 빠지면(키보드를 닫으면) 잠시 뒤 문서 끝으로 되돌린다', () => {
    const win = fakeWindow(0);
    mount(win);
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    win.scrollY = 460;
    ta.blur();
    expect(win.scrollTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(win.scrollY).toBe(200);
    ta.remove();
  });

  it('입력 중이 아닐 때 문서 끝을 넘어 스크롤하면 바로 되돌린다', () => {
    const win = fakeWindow(0);
    mount(win);
    win.scrollY = 900;
    win.fire('scroll');
    expect(win.scrollY).toBe(200);
  });

  it('입력 중에는 브라우저가 내려 둔 위치를 지킨다', () => {
    const win = fakeWindow(0);
    mount(win);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    win.scrollY = 460;
    win.fire('scroll');
    expect(win.scrollTo).not.toHaveBeenCalled();
    input.remove();
  });
});
