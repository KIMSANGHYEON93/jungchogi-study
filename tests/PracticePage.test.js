// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PracticePage from '../src/pages/PracticePage.jsx';
import { clearMarkdownCache } from '../src/utils/mdCache.js';
import { TRACES } from '../src/domain/traces.js';
import { SQL_BLANK_ITEMS } from '../src/domain/sqlBlanks.js';
import { SHORT_ANSWER_ITEMS } from '../src/domain/shortAnswer.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 연습 화면은 실제 코드 드릴을 읽어 추적표 문제를 고른다
const DRILL_MD = readFileSync(resolve(process.cwd(), 'public/data/정처기_코드트레이싱_드릴.md'), 'utf-8');

let mounted = [];

function render(path = '/practice') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(PracticePage))));
  mounted.push({ root, container });
  return container;
}

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const tab = (c, label) => [...c.querySelectorAll('[role="tab"]')].find((b) => b.textContent === label);
const selected = (c) => c.querySelector('[role="tab"][aria-selected="true"]').textContent;
const pickers = (c) => [...c.querySelectorAll('.pnav-chip')];
const chipLabel = (b) => b.textContent.replace(/^[✓✗]/, '');

beforeEach(() => {
  localStorage.clear();
  clearMarkdownCache();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(DRILL_MD, { status: 200 }))));
});

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

describe('실기 연습 화면', () => {
  it('기본은 변수 추적표 탭이고, 추적표 데이터가 있는 문제만 고른다', async () => {
    const c = render();
    await flush();
    expect(selected(c)).toBe('변수 추적표');
    expect(pickers(c).map(chipLabel)).toEqual(Object.keys(TRACES));
    expect(c.querySelector('table')).not.toBeNull();
    expect(c.querySelector('.practice-title').textContent).toContain(Object.keys(TRACES)[0]);
  });

  it('?tab= 으로 탭을 지정해 연다 (알 수 없는 값은 첫 탭)', async () => {
    expect(selected(render('/practice?tab=sql'))).toBe('SQL 빈칸');
    expect(selected(render('/practice?tab=short'))).toBe('단답 채점');
    expect(selected(render('/practice?tab=nope'))).toBe('변수 추적표');
    await flush();
  });

  it('문항을 바꾸면 해당 문제의 추적표가 열린다', async () => {
    const c = render();
    await flush();
    const target = pickers(c).find((b) => chipLabel(b) === 'P-01');
    await act(async () => { target.click(); });
    expect(c.querySelector('.practice-title').textContent).toContain('P-01');
    expect(target.getAttribute('aria-current')).toBe('true');
  });

  it('SQL 탭: 문항 목록과 빈칸 입력이 나온다', async () => {
    const c = render('/practice?tab=sql');
    expect(pickers(c)).toHaveLength(SQL_BLANK_ITEMS.length);
    expect(c.querySelectorAll('input[aria-label^="빈칸"]').length).toBeGreaterThan(0);
  });

  it('단답 탭: 문항 버튼이 서로 구분되는 이름이다', async () => {
    const c = render('/practice?tab=short');
    const labels = pickers(c).map(chipLabel);
    expect(labels).toHaveLength(SHORT_ANSWER_ITEMS.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.every((l) => !l.endsWith('쓰시오.'))).toBe(true);
  });

  it('탭을 오가도 화면이 깨지지 않는다', async () => {
    const c = render();
    await flush();
    await act(async () => { tab(c, 'SQL 빈칸').click(); });
    await act(async () => { tab(c, '단답 채점').click(); });
    await act(async () => { tab(c, '변수 추적표').click(); });
    await flush();
    expect(selected(c)).toBe('변수 추적표');
    expect(c.querySelector('table')).not.toBeNull();
  });

  it('추적표를 끝 step 까지 보면 완료로 표시되고, 다시 열면 첫 미완료 문항에서 시작한다', async () => {
    const ids = Object.keys(TRACES);
    let c = render();
    await flush();
    expect(c.querySelector('.practice-title').textContent).toContain(ids[0]);
    const expand = [...c.querySelectorAll('button')].find((b) => b.textContent === '전체 보기');
    await act(async () => { expand.click(); });
    const first = pickers(c).find((b) => chipLabel(b) === ids[0]);
    expect(first.classList.contains('is-done')).toBe(true);
    expect(first.getAttribute('aria-label')).toBe(`${ids[0]} 완료`);
    expect(JSON.parse(localStorage.getItem('jungchogi_practice_done'))).toEqual({ trace: { [ids[0]]: 'done' } });

    // 새로 열면 끝낸 문항을 건너뛴다
    c = render();
    await flush();
    const titles = [...document.querySelectorAll('.practice-title')];
    expect(titles[titles.length - 1].textContent).toContain(ids[1]);
  });

  it('"다음 미완료" 는 완료한 문항을 건너뛴다', async () => {
    const ids = SQL_BLANK_ITEMS.map((i) => i.id);
    localStorage.setItem('jungchogi_practice_done', JSON.stringify({ sql: { [ids[1]]: 'done' } }));
    const c = render('/practice?tab=sql');
    // 첫 문항은 미완료라 거기서 시작
    expect(pickers(c).find((b) => b.getAttribute('aria-current') === 'true').textContent).toBe(ids[0]);
    const next = c.querySelector('.pnav-next');
    await act(async () => { next.click(); });
    expect(pickers(c).find((b) => b.getAttribute('aria-current') === 'true').textContent).toBe(ids[2]);
  });

  it('SQL 빈칸을 채점하면 결과(오답)가 번호판에 남는다', async () => {
    const c = render('/practice?tab=sql');
    const grade = [...c.querySelectorAll('button')].find((b) => b.textContent === '채점');
    await act(async () => { grade.click(); });
    const current = pickers(c).find((b) => b.getAttribute('aria-current') === 'true');
    expect(current.classList.contains('is-wrong')).toBe(true);
  });
});
