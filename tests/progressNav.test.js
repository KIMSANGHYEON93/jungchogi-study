// @vitest-environment jsdom
//
// 문항 번호판 — 완료 · 오답 · 미완료 구분과 "다음 미완료"·이어 풀기.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QuizPage from '../src/pages/QuizPage.jsx';
import FlashcardPage from '../src/pages/FlashcardPage.jsx';
import { countStatuses, firstPendingIndex, nextPendingIndex } from '../src/domain/progressNav.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DRILL_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/code-drill-sample.md'), 'utf-8');
const QUIZ_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/quiz-sample.md'), 'utf-8');

describe('progressNav 도메인', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const status = { a: 'done', b: 'wrong', c: 'todo', d: 'todo' };
  const statusOf = (i) => status[i.id];
  const isTodo = (i) => statusOf(i) === 'todo';

  it('상태별로 센다 (모르는 값은 미완료)', () => {
    expect(countStatuses(items, statusOf)).toEqual({ done: 1, wrong: 1, todo: 2 });
    expect(countStatuses([{ id: 'x' }], () => '이상한 값')).toEqual({ done: 0, wrong: 0, todo: 1 });
  });

  it('첫 미완료 · 다음 미완료(끝에서 처음으로 돌아감)', () => {
    expect(firstPendingIndex(items, isTodo)).toBe(2);
    expect(nextPendingIndex(items, 0, isTodo)).toBe(2);
    expect(nextPendingIndex(items, 2, isTodo)).toBe(3);
    expect(nextPendingIndex(items, 3, isTodo)).toBe(2);
  });

  it('지금 항목 말고 남은 미완료가 없으면 -1', () => {
    const one = { a: 'done', b: 'done', c: 'todo', d: 'done' };
    expect(nextPendingIndex(items, 2, (i) => one[i.id] === 'todo')).toBe(-1);
    expect(firstPendingIndex(items, () => false)).toBe(-1);
  });
});

let mounted = [];
function render(page, path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(page))));
  mounted.push({ root, container });
  return container;
}
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const chip = (c, id) => [...c.querySelectorAll('.pnav-chip')].find((b) => b.textContent.replace(/^[✓✗]/, '') === id);
const currentChip = (c) => c.querySelector('.pnav-chip[aria-current="true"]')?.textContent.replace(/^[✓✗]/, '');
const button = (c, name) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === name);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn((url) =>
    String(url).includes('/data/generated/')
      ? Promise.resolve(new Response('Not Found', { status: 404 }))
      : Promise.resolve(new Response(String(url).includes('100') ? QUIZ_MD : DRILL_MD, { status: 200 }))
  ));
});

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

describe('코드 퀴즈 번호판', () => {
  it('정답 · 오답 · 미완료를 칩으로 구분하고, 첫 미완료 문항에서 시작한다', async () => {
    localStorage.setItem('jungchogi_quiz_results', JSON.stringify({ 'C-01': 'correct', 'J-01': 'incorrect' }));
    const c = render(QuizPage, '/quiz');
    await flush();
    expect(chip(c, 'C-01').classList.contains('is-done')).toBe(true);
    expect(chip(c, 'J-01').classList.contains('is-wrong')).toBe(true);
    expect(chip(c, 'S-01').classList.contains('is-todo')).toBe(true);
    expect(currentChip(c)).toBe('S-01');
    expect(c.querySelector('.pnav-summary').textContent).toContain('미완료 2');
  });

  it('칩을 누르면 그 문항으로, "다음 미완료" 는 안 푼 문항으로 간다', async () => {
    localStorage.setItem('jungchogi_quiz_results', JSON.stringify({ 'C-01': 'correct', 'J-01': 'correct' }));
    const c = render(QuizPage, '/quiz');
    await flush();
    await act(async () => { chip(c, 'C-01').click(); });
    expect(currentChip(c)).toBe('C-01');
    await act(async () => { c.querySelector('.pnav-next').click(); });
    expect(currentChip(c)).toBe('S-01');
    await act(async () => { c.querySelector('.pnav-next').click(); });
    expect(currentChip(c)).toBe('S-05');
  });

  it('언어 필터를 바꾸면 1번이 아니라 그 언어의 첫 미완료 문항으로 간다', async () => {
    localStorage.setItem('jungchogi_quiz_results', JSON.stringify({ 'S-01': 'correct' }));
    const c = render(QuizPage, '/quiz');
    await flush();
    await act(async () => { button(c, 'SQL').click(); });
    expect(currentChip(c)).toBe('S-05');
  });

  it('모두 풀면 "모두 완료" 로 바뀐다', async () => {
    localStorage.setItem('jungchogi_quiz_results', JSON.stringify({ 'C-01': 'correct', 'J-01': 'correct', 'S-01': 'correct', 'S-05': 'answered' }));
    const c = render(QuizPage, '/quiz');
    await flush();
    expect(c.querySelector('.pnav-next').textContent).toBe('모두 완료');
    expect(c.querySelector('.pnav-next').disabled).toBe(true);
  });
});

describe('플래시카드 번호판', () => {
  it('외움 · 모름 · 안 봄을 구분하고, "다음 미완료" 는 모름도 다시 들른다', async () => {
    localStorage.setItem('jungchogi_flashcard_known_quiz100', JSON.stringify({ '001': true, '002': false }));
    const c = render(FlashcardPage, '/flashcard');
    await flush();
    expect(chip(c, '001').classList.contains('is-done')).toBe(true);
    expect(chip(c, '002').classList.contains('is-wrong')).toBe(true);
    expect(chip(c, '026').classList.contains('is-todo')).toBe(true);
    expect(currentChip(c)).toBe('002');
    await act(async () => { c.querySelector('.pnav-next').click(); });
    expect(currentChip(c)).toBe('026');
    await act(async () => { c.querySelector('.pnav-next').click(); });
    expect(currentChip(c)).toBe('002');
  });
});
