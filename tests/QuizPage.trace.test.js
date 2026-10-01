// @vitest-environment jsdom
//
// 코드 퀴즈: 풀이를 공개한 뒤에만, 추적표 데이터가 있는 문제에만 변수 추적표가 붙는다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QuizPage from '../src/pages/QuizPage.jsx';
import { clearMarkdownCache } from '../src/utils/mdCache.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DRILL_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/code-drill-sample.md'), 'utf-8');

function render(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(QuizPage))));
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function answer(container, value) {
  await act(async () => { typeInto(container.querySelector('input.quiz-input'), value); });
  const submit = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('정답 확인'));
  await act(async () => { submit.click(); });
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  clearMarkdownCache();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(DRILL_MD, { status: 200 }))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('코드 퀴즈의 변수 추적표', () => {
  it('풀이를 공개하기 전에는 추적표가 없다', async () => {
    const { container, unmount } = render('/quiz?id=C-01');
    await flush();
    expect(container.querySelector('table')).toBeNull();
    unmount();
  });

  it('풀이를 공개하면 추적표 데이터가 있는 문제에 추적표가 붙는다', async () => {
    const { container, unmount } = render('/quiz?id=C-01');
    await flush();
    await answer(container, '0 0');
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.textContent).toContain('트레이싱 보기');
    unmount();
  });

  it('추적표 데이터가 없는 문제(SQL)에는 붙지 않는다', async () => {
    const { container, unmount } = render('/quiz?id=S-01');
    await flush();
    await answer(container, 'SELECT 1');
    expect(container.querySelector('table')).toBeNull();
    unmount();
  });
});
