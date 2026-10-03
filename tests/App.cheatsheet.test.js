// @vitest-environment jsdom
//
// 공식 치트시트는 어느 화면에서나 헤더 버튼 또는 플로팅 버튼으로 열린다.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted = [];

// jsdom 에는 matchMedia 가 없다 — 테마 훅이 시스템 다크모드 설정을 읽는다
function stubMatchMedia() {
  window.matchMedia = vi.fn((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

async function renderAt(path) {
  stubMatchMedia();
  window.history.pushState({}, '', path);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(createElement(App)); });
  // lazy 화면이 풀리도록 마이크로태스크를 흘린다
  await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
});

const dialog = () => document.querySelector('[role="dialog"]');

describe('공식 치트시트 진입점', () => {
  it('처음에는 닫혀 있고 플로팅 버튼이 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 200 }))));
    const c = await renderAt('/guide');
    expect(dialog()).toBeNull();
    expect(c.querySelector('.cheat-fab')).not.toBeNull();
  });

  it('플로팅 버튼으로 열고 Esc 로 닫는다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 200 }))));
    const c = await renderAt('/guide');
    await act(async () => { c.querySelector('.cheat-fab').click(); });
    expect(dialog()).not.toBeNull();
    expect(dialog().textContent).toContain('서브넷 마스크');
    expect(dialog().textContent).toContain('V(G)');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('헤더의 공식 버튼으로도 열린다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 200 }))));
    const c = await renderAt('/guide');
    await act(async () => { c.querySelector('.cheat-nav-button').click(); });
    expect(dialog()).not.toBeNull();
  });

  it('랜딩 화면에는 플로팅 버튼이 없다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 200 }))));
    const c = await renderAt('/landing');
    expect(c.querySelector('.cheat-fab')).toBeNull();
  });
});
