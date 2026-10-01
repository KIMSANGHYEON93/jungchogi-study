// @vitest-environment jsdom
//
// 코드 퀴즈의 출력 자동 비교.
//   - 일치 → 확정 정답으로 기록한다
//   - 불일치 → 표현 차이일 수 있으므로 기록하지 않고 자기 채점에 맡긴다
//   - 정답 출력이 없는 문항(SQL) → 비교하지 않는다
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QuizPage from '../src/pages/QuizPage.jsx';
import { loadProgress } from '../src/utils/storage.js';
import { matchesExpectedOutput } from '../src/domain/grading.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DRILL_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/code-drill-sample.md'), 'utf-8');

function render(path = '/quiz') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(QuizPage)))
  );
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

function buttonByName(container, name) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent.includes(name));
}

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function answer(container, value) {
  await act(async () => { typeInto(container.querySelector('input.quiz-input'), value); });
  await act(async () => { buttonByName(container, '정답 확인').click(); });
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn((url) =>
      String(url).includes('/data/generated/')
        ? Promise.resolve(new Response('Not Found', { status: 404 }))
        : Promise.resolve(new Response(DRILL_MD, { status: 200 }))
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('matchesExpectedOutput', () => {
  it('공백·줄바꿈 차이는 같은 답으로 본다', () => {
    expect(matchesExpectedOutput('30 50', '30 50')).toBe(true);
    expect(matchesExpectedOutput('  30   50 ', '30 50')).toBe(true);
    expect(matchesExpectedOutput('7 3\n3 7', '7 3 3 7')).toBe(true);
  });

  it('괄호·쉼표 둘레의 공백만 무시한다', () => {
    expect(matchesExpectedOutput('[3,4,5]', '[3, 4, 5]')).toBe(true);
    expect(matchesExpectedOutput("{'a':1}", "{'a': 1}")).toBe(true);
  });

  it('토큰이 달라지는 차이와 대소문자는 구분한다', () => {
    expect(matchesExpectedOutput('10B', '10 B')).toBe(false);
    expect(matchesExpectedOutput('True', 'true')).toBe(false);
    expect(matchesExpectedOutput('30', '30 50')).toBe(false);
  });

  it('정답 출력이 비어 있으면 비교하지 않는다(null)', () => {
    expect(matchesExpectedOutput('아무거나', '')).toBeNull();
    expect(matchesExpectedOutput('아무거나', '   ')).toBeNull();
    expect(matchesExpectedOutput('아무거나', undefined)).toBeNull();
  });
});

describe('코드 퀴즈 자동 판정', () => {
  it('정답과 일치하면 정답 안내와 함께 correct 로 기록한다', async () => {
    const { container, unmount } = render();
    await flush();
    await answer(container, '30 50');

    expect(container.querySelector('.quiz-auto-verdict.match')).not.toBeNull();
    expect(loadProgress('quiz_results', {})).toEqual({ 'C-01': 'correct' });
    expect(buttonByName(container, '맞았어요').getAttribute('aria-pressed')).toBe('true');
    unmount();
  });

  it('공백이 달라도 일치로 본다', async () => {
    const { container, unmount } = render();
    await flush();
    await answer(container, '  30    50 ');
    expect(container.querySelector('.quiz-auto-verdict.match')).not.toBeNull();
    unmount();
  });

  it('다르면 경고만 보이고 오답으로 확정하지 않는다', async () => {
    const { container, unmount } = render();
    await flush();
    await answer(container, '0 0');

    expect(container.querySelector('.quiz-auto-verdict.mismatch')).not.toBeNull();
    expect(container.querySelector('.quiz-auto-verdict.match')).toBeNull();
    // 시도만 남고 정오는 사용자 몫이다
    expect(loadProgress('quiz_results', {})).toEqual({ 'C-01': 'answered' });
    expect(buttonByName(container, '틀렸어요').getAttribute('aria-pressed')).toBe('false');
    unmount();
  });

  it('불일치 뒤에도 자기 채점으로 정답 처리할 수 있다', async () => {
    const { container, unmount } = render();
    await flush();
    await answer(container, '0 0');
    await act(async () => { buttonByName(container, '맞았어요').click(); });
    expect(loadProgress('quiz_results', {})).toEqual({ 'C-01': 'correct' });
    unmount();
  });

  it('정답 출력이 없는 SQL 문항은 자동 판정 안내를 띄우지 않는다', async () => {
    const { container, unmount } = render('/quiz?id=S-01');
    await flush();
    await answer(container, 'SELECT 1');

    expect(container.querySelector('.quiz-auto-verdict')).toBeNull();
    expect(loadProgress('quiz_results', {})).toEqual({ 'S-01': 'answered' });
    unmount();
  });
});
