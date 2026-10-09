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

describe('정답 확인에서 문제도 함께 보인다', () => {
  async function toResult() {
    const { container, unmount } = render();
    await startExam(container);
    await submitExam(container);
    return { container, unmount };
  }

  it('모든 문항의 정답 확인 안에 문제와 정답이 나란히 있다', async () => {
    const { container, unmount } = await toResult();
    const cards = questionCards(container);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const details = card.querySelector('details');
      expect(details.querySelector('.exam-review-problem')).not.toBeNull();
      const labels = [...details.querySelectorAll('.exam-review-label')].map((e) => e.textContent);
      expect(labels).toEqual(['문제', '정답']);
    }
    unmount();
  });

  it('단답형은 문제 문장을, 코드 문항은 코드를 보여 준다', async () => {
    const { container, unmount } = await toResult();
    const cards = questionCards(container);
    const quizCard = cards.find((c) => c.textContent.includes('단답형'));
    const codeCard = cards.find((c) => !c.textContent.includes('단답형') && c.querySelector('details pre'));

    const headerText = quizCard.querySelector('strong').textContent; // '문제 N. <문제 문장>'
    const question = quizCard.querySelector('.exam-review-question').textContent;
    expect(question.length).toBeGreaterThan(0);
    expect(headerText).toContain(question);

    expect(codeCard).toBeTruthy();
    expect(codeCard.querySelector('.exam-review-problem pre').textContent.length).toBeGreaterThan(0);
    expect(codeCard.querySelector('.exam-review-question')).toBeNull();
    unmount();
  });

  it('정답의 마크다운 코드 펜스가 그대로 노출되지 않는다', async () => {
    const { container, unmount } = await toResult();
    const codeCard = questionCards(container).find((c) => !c.textContent.includes('단답형') && c.querySelector('details pre'));
    const answer = codeCard.querySelector('details .md-content');
    expect(answer.textContent).not.toContain('```');
    expect(answer.textContent.length).toBeGreaterThan(0);
    unmount();
  });
});

describe('점수는 직접 채점 결과로만 정한다', () => {
  it('답을 다 쓰고 채점하지 않으면 합격으로 보지 않는다 — 예전에는 작성 문항 수로 100점이 나왔다', async () => {
    const { container, unmount } = render();
    await startExam(container);
    const ta = container.querySelector('textarea');
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => { set.call(ta, '아무 답'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await submitExam(container);
    const score = container.querySelector('.score');
    expect(score.textContent).toContain('0점');
    expect(container.textContent).toContain('채점 중');
    expect(container.textContent).not.toContain('합격 기준(60점) 이상');
    unmount();
  });

  it('모두 채점하면 맞힌 수 × 5점, 회차 기록(exam_sessions)과 영역별 결과가 남고 틀린 문항은 오답노트에 들어간다', async () => {
    const { container, unmount } = render();
    await startExam(container);
    await submitExam(container);
    const cards = questionCards(container);
    for (const [i, card] of cards.entries()) {
      await act(async () => { buttonByName(card, i === 0 ? '틀렸어요' : '맞았어요').click(); });
    }
    const [session] = loadProgress('exam_sessions', []);
    expect(session.items).toHaveLength(cards.length);
    expect(session.items.every((it) => it.verdict)).toBe(true);
    expect(container.querySelector('.score').textContent).toBe(`${(cards.length - 1) * 5}점`);
    expect(container.textContent).toContain('영역별 정답');
    const wrong = loadProgress('wrong_notes', []);
    expect(wrong).toHaveLength(1);
    expect(wrong[0].source).toBe('exam');
    unmount();
  });

  it('시작 화면은 실전 시간·문항 출처(자체 제작, 복원 기출 아님)·시험 시간 출처를 밝힌다', async () => {
    const { container, unmount } = render();
    await flush();
    expect(container.textContent).toContain('150분');
    expect(container.textContent).toContain('연도·회차별 복원 기출이 아닙니다');
    expect(container.textContent).toContain('큐넷 원문 미확인');
    unmount();
  });
});
