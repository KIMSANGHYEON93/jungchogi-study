// @vitest-environment jsdom
//
// 플래시카드 '문제·답 함께 보기' — 문제와 답을 한 화면에서 훑고, 외움 · 모름을 카드 색으로 구분한다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FlashcardPage from '../src/pages/FlashcardPage.jsx';
import { loadProgress } from '../src/utils/storage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const QUIZ_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/quiz-sample.md'), 'utf-8');
const CORE_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/core-sample.md'), 'utf-8');

let root;
let container;
function render(url = '/flashcard') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(MemoryRouter, { initialEntries: [url] }, createElement(FlashcardPage)));
  });
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
const click = (el) => act(() => el.click());

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn((url) =>
    Promise.resolve(new Response(String(url).includes('핵심암기') ? CORE_MD : QUIZ_MD, { status: 200 }))));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('플래시카드 — 문제·답 함께 보기', () => {
  it('기본 보기는 목록이고, 카드마다 문제와 답이 함께 보인다', async () => {
    const c = render();
    await flush();
    const list = items(c);
    expect(list).toHaveLength(3); // 픽스처: 001 · 002 · 026
    for (const li of list) {
      expect(li.querySelector('.fc-question').textContent.trim()).not.toBe('');
      expect(li.querySelector('.fc-answer').textContent.trim()).not.toBe('');
    }
    expect(c.querySelector('.flashcard')).toBeNull();
    expect(button(c, '문제·답 함께 보기').getAttribute('aria-pressed')).toBe('true');
  });

  it('외움은 초록(is-known), 모름은 빨강(is-unknown), 표시 안 한 카드는 회색(is-new)이고 저장된다', async () => {
    const c = render();
    await flush();
    const [first, second, third] = items(c);
    expect(first.className).toContain('is-new');

    click(button(first, '001번 외움 표시'));
    click(button(second, '002번 모름 표시'));

    const [a, b, d] = items(c);
    expect(a.className).toContain('is-known');
    expect(a.querySelector('.fc-status').textContent).toBe('외움');
    expect(b.className).toContain('is-unknown');
    expect(b.querySelector('.fc-status').textContent).toBe('모름');
    expect(d.className).toContain('is-new');
    expect(third).toBeDefined();
    expect(loadProgress('flashcard_known_quiz100', {})).toEqual({ '001': true, '002': false });
    expect(c.querySelector('.fc-legend').textContent).toContain('외움 1');
    expect(c.querySelector('.fc-legend').textContent).toContain('모름 1');
    expect(c.querySelector('.fc-legend').textContent).toContain('안 봄 1');
  });

  it('답 가리기를 켜면 답이 접혀 있다가 펼쳐 볼 수 있다', async () => {
    const c = render();
    await flush();
    act(() => c.querySelector('.fc-hide-toggle input').click());
    const first = items(c)[0];
    const fold = first.querySelector('details.fc-answer-fold');
    expect(fold).not.toBeNull();
    expect(fold.open).toBe(false);
    expect(fold.querySelector('summary').textContent).toBe('답 보기');
  });

  it('한 장으로 보기를 누르면 그 카드부터 한 장씩 보고, 같은 색으로 테두리가 칠해진다', async () => {
    const c = render();
    await flush();
    const second = items(c)[1];
    click(button(second, '002번 모름 표시'));
    click(button(items(c)[1], '한 장으로 보기'));
    expect(c.querySelector('.flashcard-counter').textContent).toBe('2 / 3');
    expect(c.querySelector('.flashcard-container').className).toContain('is-unknown');
    expect(c.querySelector('.fc-status-floating').textContent).toBe('모름');
    // 고른 보기 방식은 이 기기에 기억된다(백업 대상 아님)
    expect(localStorage.getItem('jungchogi-flashcard-view')).toBe('card');
  });
});
