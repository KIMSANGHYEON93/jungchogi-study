// @vitest-environment jsdom
//
// 모의고사 화면의 채점 흐름.
//
// 시험 중에는 정답도 채점도 존재하면 안 된다 — 아직 안 푼 문제의 답이 샌다.
// 제출 뒤에는 문항마다 직접 채점할 수 있고, 그 결과는 코드 퀴즈 진도와 섞이지 않는다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExamPage from '../src/pages/ExamPage.jsx';
import { loadProgress } from '../src/utils/storage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 에서는 import.meta.url 이 file: 가 아니라 http: 라 cwd 로 잡는다.
const QUIZ_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/quiz-sample.md'), 'utf-8');
const DRILL_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/code-drill-sample.md'), 'utf-8');

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(ExamPage)));
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

function buttonByName(scope, name) {
  return [...scope.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label')?.includes(name) || b.textContent.includes(name)
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn((url) =>
      Promise.resolve(new Response(String(url).includes('코드트레이싱') ? DRILL_MD : QUIZ_MD, { status: 200 }))
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function startExam(container) {
  await flush();
  await act(async () => { buttonByName(container, '시험 시작').click(); });
  await flush();
}

async function submitExam(container) {
  await act(async () => { buttonByName(container, '시험 제출').click(); });
  await flush();
}

/** 결과 화면에서 직접 채점 영역을 가진 문항 카드들 */
function questionCards(container) {
  return [...container.querySelectorAll('.card')].filter((c) => c.querySelector('.self-grade'));
}

describe('시험 중에는 채점이 존재하지 않는다', () => {
  it('시험 화면에는 정답 블록도 직접 채점도 없다', async () => {
    const { container, unmount } = render();
    await startExam(container);

    expect(container.textContent).toContain('문제 1 /');
    expect(container.querySelector('.self-grade')).toBeNull();
    expect(container.querySelector('details')).toBeNull();
    expect(container.textContent).not.toContain('맞았어요');

    unmount();
  });
});

describe('제출 후에 직접 채점을 붙인다', () => {
  it('결과 화면의 모든 문항에 직접 채점 버튼이 붙는다', async () => {
    const { container, unmount } = render();
    await startExam(container);
    await submitExam(container);

    const cards = questionCards(container);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(buttonByName(card, '맞았어요')).toBeTruthy();
      expect(buttonByName(card, '틀렸어요')).toBeTruthy();
    }

    unmount();
  });
});

describe('모의고사 채점은 코드 퀴즈 진도를 건드리지 않는다', () => {
  it('채점해도 quiz_results 에 쓰지 않는다 — 두 화면의 문항 집합이 달라 진도가 어긋난다', async () => {
    const { container, unmount } = render();
    await startExam(container);
    await submitExam(container);

    const card = questionCards(container)[0];
    await act(async () => { buttonByName(card, '맞았어요').click(); });

    expect(loadProgress('exam_results', null)).not.toBeNull();
    expect(loadProgress('quiz_results', null)).toBeNull();

    unmount();
  });
});

describe('결과 화면', () => {
  it('정답 확인과 오답노트 추가가 동작한다', async () => {
    const { container, unmount } = render();
    await startExam(container);
    await submitExam(container);

    const card = questionCards(container)[0];
    expect(card.querySelector('details')).toBeTruthy();

    await act(async () => { buttonByName(card, '오답노트에 추가').click(); });
    expect(loadProgress('wrong_notes', [])).toHaveLength(1);

    unmount();
  });
});
