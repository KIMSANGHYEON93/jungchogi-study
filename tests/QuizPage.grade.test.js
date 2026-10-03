// @vitest-environment jsdom
//
// 코드 퀴즈 화면의 채점 흐름.
//
//   1) 정답 조기 노출 금지 — `정답 확인` 전에는 풀이도 자기 채점도 없다
//   2) 저장 계약 — quiz_results 에 'correct'/'incorrect' 만 새로 쓴다
//   3) 레거시 `answered` 와의 공존
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QuizPage from '../src/pages/QuizPage.jsx';
import { loadProgress, saveProgress } from '../src/utils/storage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 환경에서는 import.meta.url 이 file: URL 이 아니라 http: 라
// new URL(...) 로 픽스처 경로를 만들 수 없다. vitest 의 cwd(프로젝트 루트)에서 잡는다.
const DRILL_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/code-drill-sample.md'), 'utf-8');

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // 이 화면은 `?id=` 딥링크를 읽으므로 Router 안에서만 그려진다
  act(() => root.render(createElement(MemoryRouter, null, createElement(QuizPage))));
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
  return [...container.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label')?.includes(name) || b.textContent.includes(name)
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(DRILL_MD, { status: 200 }))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

// React 는 자체 value 트래커를 두고 있어 input.value 에 그냥 대입하면
// onChange 가 돌지 않는다. 네이티브 setter 로 값을 넣어야 변경으로 인식한다.
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 첫 문항에 답을 적는다 (정답 확인은 누르지 않는다) */
async function typeAnswer(container, answer = '30 50') {
  await act(async () => { typeInto(container.querySelector('input.quiz-input'), answer); });
}

/** 첫 문항을 풀고 `정답 확인`까지 누른 상태를 만든다 */
async function answerFirstProblem(container, answer = '0 0') {
  await typeAnswer(container, answer);
  await act(async () => { buttonByName(container, '정답 확인').click(); });
  await flush();
}

describe('정답 조기 노출 방지', () => {
  it('정답 확인 전에는 풀이도 자기 채점도 없다', async () => {
    const { container, unmount } = render();
    await flush();

    expect(container.textContent).toContain('C-01');
    expect(container.textContent).not.toContain('맞았어요');
    // 풀이(추적표)는 정답 확인 전에는 화면에 없다
    expect(container.textContent).not.toContain('추적표');

    unmount();
  });

  it('정답 확인을 눌러야 풀이와 자기 채점이 함께 나타난다', async () => {
    const { container, unmount } = render();
    await flush();
    await answerFirstProblem(container);

    expect(container.textContent).toContain('추적표');
    expect(container.textContent).toContain('맞았어요');

    unmount();
  });
});

describe('자기 채점', () => {
  it('자기 채점만으로 저장된다', async () => {
    const { container, unmount } = render();
    await flush();
    await answerFirstProblem(container);

    await act(async () => { buttonByName(container, '틀렸어요').click(); });

    expect(loadProgress('quiz_results', {})['C-01']).toBe('incorrect');

    unmount();
  });

  it('자기 채점은 되돌릴 수 있다 — 오판을 고칠 길이 있어야 한다', async () => {
    const { container, unmount } = render();
    await flush();
    await answerFirstProblem(container);

    await act(async () => { buttonByName(container, '맞았어요').click(); });
    await act(async () => { buttonByName(container, '틀렸어요').click(); });

    expect(loadProgress('quiz_results', {})['C-01']).toBe('incorrect');

    unmount();
  });
});

describe('레거시 데이터와의 공존', () => {
  it('레거시 answered 가 쌓여 있어도 진도 표시가 그대로 동작한다', async () => {
    saveProgress('quiz_results', { 'C-01': 'answered', 'C-02': 'answered', 'C-03': 'correct' });
    const { container, unmount } = render();
    await flush();

    // 풀이 완료 = 시도한 문항 수(세 값 모두) — 레거시를 빠뜨리면 진도가 뒤로 간다
    expect(container.querySelector('.stat-box .value').textContent).toBeTruthy();
    expect(container.textContent).toContain('풀이 완료');

    unmount();
  });

  it('레거시 값은 자기 채점으로 덮어써진다', async () => {
    saveProgress('quiz_results', { 'C-01': 'answered' });
    const { container, unmount } = render();
    await flush();
    // 시도한 문항은 건너뛰고 시작하므로(이어 풀기) 첫 문항으로 되돌아간다
    await act(async () => { buttonByName(container, '이전').click(); });
    await answerFirstProblem(container);

    await act(async () => { buttonByName(container, '맞았어요').click(); });

    expect(loadProgress('quiz_results', {})['C-01']).toBe('correct');

    unmount();
  });
});

describe('이어 풀기 — 푼 문항은 넘기고 진행 중인 문항에서 시작', () => {
  const shownId = (container) => container.textContent.match(/[CJPS]{1}-\d+\./)?.[0];

  it('앞쪽 문항을 이미 풀었으면 처음 안 푼 문항에서 시작한다', async () => {
    saveProgress('quiz_results', { 'C-01': 'correct' });
    const { container, unmount } = render();
    await flush();

    // 픽스처의 첫 문항 C-01 은 풀었으므로 다음 문항(J-01)에서 시작한다
    expect(container.textContent).toContain('J-01');
    expect(container.textContent).toContain('2 / 4');

    unmount();
  });

  it('기록이 없으면 첫 문항에서 시작한다', async () => {
    const { container, unmount } = render();
    await flush();

    expect(shownId(container)).toBe('C-01.');

    unmount();
  });

  it('풀고 나서도 보던 문항에 그대로 머문다', async () => {
    saveProgress('quiz_results', { 'C-01': 'correct' });
    const { container, unmount } = render();
    await flush();
    const before = shownId(container);
    await answerFirstProblem(container);

    expect(shownId(container)).toBe(before);

    unmount();
  });
});
