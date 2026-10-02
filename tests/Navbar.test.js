// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../src/components/Navbar.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted = [];

function render(path = '/', props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Navbar, props)))
  );
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
});

const desktop = (c) => c.querySelector('nav.desktop-nav');
const toggle = (c, label) =>
  [...desktop(c).querySelectorAll('.nav-dropdown-toggle')].find((b) => b.textContent.includes(label));
const menuLabels = (c) => [...desktop(c).querySelectorAll('.nav-dropdown-menu a')].map((a) => a.textContent);

describe('상단 내비게이션 드롭다운', () => {
  it('탭 대신 드롭다운 세 개로 묶여 있고 처음에는 모두 닫혀 있다', () => {
    const c = render();
    expect([...desktop(c).querySelectorAll('.nav-dropdown-toggle')].map((b) => b.textContent.replace('▾', '').trim())).toEqual([
      '학습',
      '실전',
      '계획',
    ]);
    for (const b of desktop(c).querySelectorAll('.nav-dropdown-toggle')) {
      expect(b.getAttribute('aria-expanded')).toBe('false');
    }
    expect(menuLabels(c)).toEqual([]);
  });

  it('누르면 해당 메뉴의 링크가 나온다', async () => {
    const c = render();
    await act(async () => { toggle(c, '실전').click(); });
    expect(toggle(c, '실전').getAttribute('aria-expanded')).toBe('true');
    expect(menuLabels(c)).toEqual(['코드퀴즈', '실기연습', '모의고사', '오답노트']);
    const hrefs = [...desktop(c).querySelectorAll('.nav-dropdown-menu a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/quiz', '/practice', '/exam', '/wrong']);
  });

  it('기존 모든 화면으로 가는 링크가 드롭다운 안에 빠짐없이 있다', async () => {
    const c = render();
    const all = [];
    for (const label of ['학습', '실전', '계획']) {
      await act(async () => { toggle(c, label).click(); });
      all.push(...[...desktop(c).querySelectorAll('.nav-dropdown-menu a')].map((a) => a.getAttribute('href')));
    }
    expect(all.sort()).toEqual(
      ['/study', '/flashcard', '/search', '/bookmarks', '/quiz', '/practice', '/exam', '/wrong', '/roadmap', '/guide'].sort()
    );
  });

  it('한 번에 하나만 열린다', async () => {
    const c = render();
    await act(async () => { toggle(c, '학습').click(); });
    await act(async () => { toggle(c, '계획').click(); });
    expect(toggle(c, '학습').getAttribute('aria-expanded')).toBe('false');
    expect(toggle(c, '계획').getAttribute('aria-expanded')).toBe('true');
    expect(menuLabels(c)).toEqual(['로드맵', '영역안내']);
  });

  it('같은 버튼을 다시 누르면 닫힌다', async () => {
    const c = render();
    await act(async () => { toggle(c, '학습').click(); });
    await act(async () => { toggle(c, '학습').click(); });
    expect(menuLabels(c)).toEqual([]);
  });

  it('링크를 고르면 메뉴가 닫힌다', async () => {
    const c = render();
    await act(async () => { toggle(c, '학습').click(); });
    await act(async () => { desktop(c).querySelector('.nav-dropdown-menu a').click(); });
    expect(menuLabels(c)).toEqual([]);
  });

  it('바깥을 누르면 닫힌다', async () => {
    const c = render();
    await act(async () => { toggle(c, '실전').click(); });
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(menuLabels(c)).toEqual([]);
  });

  it('Esc 로 닫고 토글 버튼으로 포커스가 돌아간다', async () => {
    const c = render();
    await act(async () => { toggle(c, '실전').click(); });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(menuLabels(c)).toEqual([]);
    expect(document.activeElement).toBe(toggle(c, '실전'));
  });

  it('현재 화면이 속한 드롭다운이 활성으로 표시된다', () => {
    const c = render('/exam');
    expect(toggle(c, '실전').className).toContain('active');
    expect(toggle(c, '학습').className).not.toContain('active');
    expect(toggle(c, '계획').className).not.toContain('active');
  });

  it('열린 메뉴에서 현재 화면 링크가 활성이다', async () => {
    const c = render('/roadmap');
    await act(async () => { toggle(c, '계획').click(); });
    const active = [...desktop(c).querySelectorAll('.nav-dropdown-menu a.active')].map((a) => a.textContent);
    expect(active).toEqual(['로드맵']);
  });

  it('공식 버튼은 치트시트 열기 콜백을 부른다', async () => {
    const onOpen = vi.fn();
    const c = render('/', { onOpenCheatSheet: onOpen });
    await act(async () => { desktop(c).querySelector('.cheat-nav-button').click(); });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('모바일 하단 탭바는 그대로다', () => {
    const c = render();
    expect(c.querySelector('nav.mobile-tab-bar')).not.toBeNull();
  });
});

describe('모바일 하단 탭 — 더보기', () => {
  const bar = (c) => c.querySelector('nav.mobile-tab-bar');
  const more = (c) => bar(c).querySelector('.mobile-more-button');
  const sheet = (c) => c.querySelector('#mobile-more-sheet');
  const sheetLinks = (c) => [...sheet(c).querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);

  it('기존 여섯 탭 뒤에 "더보기" 버튼이 있고 처음에는 닫혀 있다', () => {
    const c = render();
    expect([...bar(c).querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/', '/flashcard', '/quiz', '/exam', '/study', '/wrong']);
    expect(more(c).textContent).toBe('더보기');
    expect(more(c).getAttribute('aria-expanded')).toBe('false');
    expect(more(c).getAttribute('aria-controls')).toBe('mobile-more-sheet');
    expect(sheet(c)).toBeNull();
  });

  it('누르면 하단 탭에 없는 화면(로드맵·북마크·실기연습·영역안내·검색)이 나온다', async () => {
    const c = render();
    await act(async () => { more(c).click(); });
    expect(more(c).getAttribute('aria-expanded')).toBe('true');
    expect(sheetLinks(c)).toEqual([
      ['로드맵', '/roadmap'], ['북마크', '/bookmarks'], ['실기연습', '/practice'], ['영역안내', '/guide'], ['검색', '/search'],
    ]);
  });

  it('화면을 고르면 닫힌다', async () => {
    const c = render();
    await act(async () => { more(c).click(); });
    await act(async () => { sheet(c).querySelector('a').click(); });
    expect(sheet(c)).toBeNull();
    expect(more(c).getAttribute('aria-expanded')).toBe('false');
  });

  it('바깥(어두운 배경)을 누르면 닫힌다', async () => {
    const c = render();
    await act(async () => { more(c).click(); });
    await act(async () => { c.querySelector('.mobile-more-overlay').click(); });
    expect(sheet(c)).toBeNull();
  });

  it('Esc 로 닫고 포커스를 "더보기" 버튼으로 돌려준다', async () => {
    const c = render();
    await act(async () => { more(c).click(); });
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(sheet(c)).toBeNull();
    expect(document.activeElement).toBe(more(c));
  });

  it('닫혀 있을 때는 Esc 를 듣지 않는다 (리스너가 남지 않는다)', async () => {
    const c = render();
    const spy = vi.spyOn(document, 'removeEventListener');
    await act(async () => { more(c).click(); });
    await act(async () => { more(c).click(); }); // 다시 눌러 닫는다
    expect(spy.mock.calls.some(([type]) => type === 'keydown')).toBe(true);
    spy.mockRestore();
  });

  it('그 화면에 있으면 "더보기" 가 활성 표시된다 (레슨은 로드맵에 속한다)', () => {
    for (const path of ['/roadmap', '/lesson/24', '/bookmarks', '/practice', '/guide', '/search']) {
      expect(more(render(path)).className, path).toContain('active');
    }
    for (const path of ['/', '/quiz', '/study']) {
      expect(more(render(path)).className, path).not.toContain('active');
    }
  });

  it('열린 시트 안에서 현재 화면 링크가 활성 표시된다', async () => {
    const c = render('/bookmarks');
    await act(async () => { more(c).click(); });
    const active = [...sheet(c).querySelectorAll('a.active')].map((a) => a.textContent);
    expect(active).toEqual(['북마크']);
  });

  it('공식 치트시트 버튼은 시트를 닫고 치트시트를 연다', async () => {
    const onOpenCheatSheet = vi.fn();
    const c = render('/', { onOpenCheatSheet });
    await act(async () => { more(c).click(); });
    const btn = [...sheet(c).querySelectorAll('button')].find((b) => b.textContent.includes('공식 치트시트'));
    await act(async () => { btn.click(); });
    expect(onOpenCheatSheet).toHaveBeenCalledTimes(1);
    expect(sheet(c)).toBeNull();
  });

  it('테마 전환 버튼이 있다 (모바일에는 상단 바가 없어 여기서만 바꿀 수 있다)', async () => {
    const c = render();
    await act(async () => { more(c).click(); });
    const btn = [...sheet(c).querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.includes('모드로 전환'));
    expect(btn).toBeTruthy();
  });
});
