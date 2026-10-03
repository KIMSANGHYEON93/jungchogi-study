// @vitest-environment jsdom
//
// 모의고사 채점 결과의 저장.
//
// 모의고사 채점은 별도 키 `exam_results` 에 쌓는다. `quiz_results` 는 id 만 키로 쓰는
// 평평한 맵이고 코드 퀴즈 40문항 진도(`quizDone/40`)가 거기 걸려 있어, 모의고사가 낸
// 단답형 id(`042`)가 섞이면 진도가 40 을 넘기 때문이다. 값 계약은 `quiz_results` 와
// 똑같이 맞춘다 (`'correct'|'incorrect'|'answered'`).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExamPage from '../src/pages/ExamPage.jsx';
import { getExamResults, loadProgress, saveExamResults } from '../src/utils/storage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  vi.restoreAllMocks();
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

/** 카드가 어느 문항인지 — 직접 채점 버튼의 aria-label 이 `맞았어요 (<문항 id>번 문항)` 이다 */
function idOf(card) {
  return /\((.+)번 문항\)/.exec(buttonByName(card, '맞았어요').getAttribute('aria-label'))[1];
}

/** 결과 화면을 열고 첫 문항 카드를 돌려준다 */
async function toResult(container) {
  await startExam(container);
  await submitExam(container);
  const card = questionCards(container)[0];
  return { card, id: idOf(card) };
}

describe('자기 채점', () => {
  it('맞았어요·틀렸어요가 exam_results 에 남는다', async () => {
    const { container, unmount } = render();
    const { card, id } = await toResult(container);

    await act(async () => { buttonByName(card, '맞았어요').click(); });
    expect(getExamResults()[id]).toBe('correct');

    await act(async () => { buttonByName(card, '틀렸어요').click(); });
    expect(getExamResults()[id]).toBe('incorrect');
    unmount();
  });

  it('채점 상태를 화면에 되비친다', async () => {
    const { container, unmount } = render();
    const { card } = await toResult(container);

    expect(card.textContent).toContain('아직 채점하지 않음');
    await act(async () => { buttonByName(card, '틀렸어요').click(); });
    expect(card.textContent).toContain('오답으로 기록됨');
    unmount();
  });

  it('문항마다 따로 기록한다', async () => {
    const { container, unmount } = render();
    await startExam(container);
    await submitExam(container);

    const [first, second] = questionCards(container);
    await act(async () => { buttonByName(first, '맞았어요').click(); });
    await act(async () => { buttonByName(second, '틀렸어요').click(); });

    expect(getExamResults()).toEqual({
      [idOf(first)]: 'correct',
      [idOf(second)]: 'incorrect',
    });
    unmount();
  });
});

describe('다른 진도와 섞이지 않는다', () => {
  it('모의고사 채점은 quiz_results 를 건드리지 않는다', async () => {
    // 이 맵은 코드 퀴즈 40문항의 진도를 센다. 모의고사 id 가 섞이면 진도가 40 을 넘는다
    const { container, unmount } = render();
    const { card } = await toResult(container);

    await act(async () => { buttonByName(card, '틀렸어요').click(); });

    expect(loadProgress('quiz_results', null)).toBeNull();
    unmount();
  });

  it('지난 시험의 기록 위에 덧쌓인다', async () => {
    saveExamResults({ '999': 'incorrect' });
    const { container, unmount } = render();
    const { card, id } = await toResult(container);

    await act(async () => { buttonByName(card, '맞았어요').click(); });

    expect(getExamResults()['999']).toBe('incorrect');
    expect(getExamResults()[id]).toBe('correct');
    unmount();
  });

  it('용량이 꽉 차도 결과 화면이 죽지 않는다', async () => {
    const { container, unmount } = render();
    const { card } = await toResult(container);

    const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw quota; });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await act(async () => { buttonByName(card, '맞았어요').click(); });

    expect(card.textContent).toContain('정답으로 기록됨');
    unmount();
  });
});
