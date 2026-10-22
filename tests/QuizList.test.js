// @vitest-environment jsdom
//
// 코드 퀴즈 '문제·답 함께 보기' — 문제 코드와 정답 · 풀이를 한 카드에, 채점 결과를 카드 색으로.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QuizPage from '../src/pages/QuizPage.jsx';
import { getWrongNotes, loadProgress } from '../src/utils/storage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DRILL_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/code-drill-sample.md'), 'utf-8');

let root;
let container;
function render(url = '/quiz') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, { initialEntries: [url] }, createElement(QuizPage))));
  return container;
}
const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});
const items = (c) => [...c.querySelectorAll('.fc-item')];
const button = (scope, name) => [...scope.querySelectorAll('button')].find(
  (b) => b.getAttribute('aria-label') === name || b.textContent.trim() === name
);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(DRILL_MD, { status: 200 }))));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('코드 퀴즈 — 문제·답 함께 보기', () => {
  it('기본 보기는 목록이고, 카드마다 문제 코드와 정답 · 풀이가 함께 있다', async () => {
    const c = render();
    await flush();
    const list = items(c);
    expect(list.length).toBeGreaterThan(0);
    for (const li of list) {
      expect(li.querySelector('pre')).not.toBeNull();
      expect(li.querySelector('.fc-answer').textContent.trim()).not.toBe('');
    }
    expect(c.querySelector('.quiz-input')).toBeNull();
    expect(button(c, '문제·답 함께 보기').getAttribute('aria-pressed')).toBe('true');
  });

  it('맞았어요 / 틀렸어요로 카드 색이 바뀌고 기록 · 오답노트에 남는다', async () => {
    const c = render();
    await flush();
    const [first, second] = items(c);
    const id1 = first.querySelector('.fc-item-id').textContent;
    const id2 = second.querySelector('.fc-item-id').textContent;
    act(() => button(first, `${id1} 맞았어요`).click());
    act(() => button(items(c)[1], `${id2} 틀렸어요`).click());
    expect(items(c)[0].className).toContain('is-known');
    expect(items(c)[0].querySelector('.fc-status').textContent).toBe('정답');
    expect(items(c)[1].className).toContain('is-unknown');
    expect(loadProgress('quiz_results', {})).toEqual({ [id1]: 'correct', [id2]: 'incorrect' });
    expect(getWrongNotes().map((n) => n.id)).toEqual([id2]);
  });

  it('정답 가리기를 켜면 정답 · 풀이가 접힌다', async () => {
    const c = render();
    await flush();
    act(() => c.querySelector('.fc-hide-toggle input').click());
    const fold = items(c)[0].querySelector('details.fc-answer-fold');
    expect(fold).not.toBeNull();
    expect(fold.open).toBe(false);
  });

  it('직접 풀어 보기를 누르면 그 문항을 한 문제씩 풀기로 연다', async () => {
    const c = render();
    await flush();
    const second = items(c)[1];
    const id = second.querySelector('.fc-item-id').textContent;
    act(() => button(second, '직접 풀어 보기').click());
    expect(c.querySelector('.quiz-input')).not.toBeNull();
    expect(c.querySelector('.card h2').textContent).toContain(id);
    expect(localStorage.getItem('jungchogi-quiz-view')).toBe('solve');
  });
});
