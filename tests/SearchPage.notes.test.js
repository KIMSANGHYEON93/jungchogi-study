// @vitest-environment jsdom
//
// 검색이 문제 은행뿐 아니라 학습 노트(Day 문서 등) 본문도 찾는다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SearchPage from '../src/pages/SearchPage.jsx';
import { clearMarkdownCache } from '../src/utils/mdCache.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fx = (name) => readFileSync(resolve(process.cwd(), `tests/fixtures/${name}`), 'utf-8');
const QUIZ_MD = fx('quiz-sample.md');
const DRILL_MD = fx('code-drill-sample.md');
const CORE_MD = fx('core-sample.md');

const DAY13_MD = '# Day 13 - 시험 전날\n\n## 전날 체크리스트\n\n신분증과 수험표를 챙기고 일찍 잠자리에 듭니다.\n';

let notesFail;
/** 노트 문서 요청을 붙잡아 두는 문 — 색인이 끝나기 전 상태를 만든다 */
let notesGate;

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, null, createElement(SearchPage))));
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const flush = () => act(async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
});

async function search(container, query) {
  const input = container.querySelector('.search-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { vi.advanceTimersByTime(300); });
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  clearMarkdownCache();
  notesFail = false;
  notesGate = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const u = decodeURIComponent(String(url));
      if (u.includes('/data/generated/')) return Promise.resolve(new Response('Not Found', { status: 404 }));
      if (u.includes('코드트레이싱')) return Promise.resolve(new Response(DRILL_MD, { status: 200 }));
      if (u.includes('핵심암기')) return Promise.resolve(new Response(CORE_MD, { status: 200 }));
      if (u.includes('단답형')) return Promise.resolve(new Response(QUIZ_MD, { status: 200 }));
      // 그 밖의 문서는 학습 노트다
      if (notesGate) return notesGate.then(() => new Response(u.includes('Day13') ? DAY13_MD : '# 빈 문서\n내용 없음', { status: 200 }));
      if (notesFail) return Promise.reject(new Error('network'));
      if (u.includes('Day13')) return Promise.resolve(new Response(DAY13_MD, { status: 200 }));
      return Promise.resolve(new Response('# 빈 문서\n내용 없음', { status: 200 }));
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('학습 노트 검색', () => {
  it('노트 본문에만 있는 말도 찾고, 해당 문서로 가는 링크를 준다', async () => {
    const { container, unmount } = render();
    await flush();
    await search(container, '수험표');

    expect(container.textContent).toContain('학습 노트');
    expect(container.textContent).toContain('전날 체크리스트');
    expect(container.textContent).toContain('Day 13');
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('학습 노트에서 열기'));
    expect(link.getAttribute('href')).toBe('/study?doc=12');
    unmount();
  });

  it('사이드바에 보이는 문서 이름으로도 찾는다', async () => {
    const { container, unmount } = render();
    await flush();
    await search(container, '시험전날');
    expect(container.textContent).toContain('Day 13 — 시험전날');
    unmount();
  });

  it('학습 노트 필터로 노트 결과만 좁힌다', async () => {
    const { container, unmount } = render();
    await flush();
    await search(container, '시험');
    const filter = [...container.querySelectorAll('.filter-bar button')].find((b) => b.textContent === '학습 노트');
    await act(async () => { filter.click(); });
    await search(container, '시험');
    const cards = [...container.querySelectorAll('.search-result-card')];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.textContent.includes('학습 노트에서 열기'))).toBe(true);
    unmount();
  });

  it('노트를 불러오지 못해도 문제 검색은 그대로 동작한다', async () => {
    notesFail = true;
    const { container, unmount } = render();
    await flush();
    await search(container, 'TCP');
    expect(container.textContent).toMatch(/\d+개 결과/);
    expect(container.querySelector('.search-input').disabled).toBe(false);
    unmount();
  });

  it('노트 색인이 끝나기 전에는 "결과 없음" 대신 불러오는 중을 보여준다', async () => {
    let open;
    notesGate = new Promise((resolve) => { open = resolve; });
    const { container, unmount } = render();
    await flush();
    await search(container, '수험표');

    expect(container.textContent).toContain('학습 노트를 불러오는 중');
    expect(container.textContent).not.toContain('검색 결과가 없습니다');
    expect(container.textContent).not.toContain('0개 결과');

    await act(async () => { open(); });
    await flush();
    await search(container, '수험표');
    expect(container.textContent).toContain('전날 체크리스트');
    unmount();
  });
});
