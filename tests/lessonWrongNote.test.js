// @vitest-environment jsdom
//
// 레슨 확인 퀴즈 → 오답노트 → 새로고침 → 재풀이 흐름.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LessonPage from '../src/pages/LessonPage.jsx';
import WrongNotePage from '../src/pages/WrongNotePage.jsx';
import { ThemeProvider } from '../src/hooks/useTheme.js';
import { resetStudyState } from '../src/utils/studyState.js';
import { addWrongNote, getWrongNotes, getSpacedRepetitionDue } from '../src/utils/storage.js';
import { mergeValue } from '../src/utils/backup.js';
import { lessonByDay } from '../src/domain/lessons.js';
import { buildLessonWrongNote } from '../src/domain/lessonQuiz.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted = [];
function render(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(ThemeProvider, { value: { theme: 'light', toggle: () => {} } },
        createElement(MemoryRouter, { initialEntries: [path] },
          createElement(Routes, null,
            createElement(Route, { path: '/lesson/:d', element: createElement(LessonPage) }),
            createElement(Route, { path: '/wrong', element: createElement(WrongNotePage) })))),
    ),
  );
  const entry = { root, container };
  mounted.push(entry);
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); mounted = mounted.filter((m) => m !== entry); } };
}
const setValue = (input, value) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
const submit = (c, qid) => act(() => { c.querySelector(`#lesson-q-${qid}`).form.requestSubmit(); });
const button = (c, name) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === name);

beforeEach(() => {
  localStorage.clear();
  resetStudyState();
});
afterEach(() => {
  for (const { root, container } of mounted) { act(() => root.unmount()); container.remove(); }
  mounted = [];
});

const lesson = lessonByDay(19);
const q1 = lesson.questions[0];
const key = `${lesson.id}:${q1.id}`;

describe('레슨 퀴즈 → 오답노트', () => {
  it('입력만으로는 아무것도 기록하지 않는다', () => {
    const { container } = render('/lesson/19');
    setValue(container.querySelector('#lesson-q-q1'), '틀린 답');
    expect(getWrongNotes()).toEqual([]);
    expect(localStorage.getItem('jungchogi_lesson_results')).toBeNull();
  });

  it('오답 제출 → 오답노트에 레슨 · 문항 · 주제 · 내 답 · 정답 · 해설이 남는다', () => {
    const { container } = render('/lesson/19');
    setValue(container.querySelector('#lesson-q-q1'), '[0, 4]');
    submit(container, 'q1');
    expect(container.textContent).toContain('오답입니다');
    expect(container.textContent).toContain('오답노트에 저장했습니다');
    const notes = getWrongNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      source: 'lesson', id: key, lessonId: lesson.id, lessonDay: 19, questionId: 'q1',
      topic: 'Python', category: 'Python', userAnswer: '[0, 4]', answer: q1.answer, explain: q1.explain,
      wrongCount: 1, reviewCount: 0,
    });
    expect(JSON.parse(localStorage.getItem('jungchogi_lesson_results'))).toEqual({ [key]: 'incorrect' });
  });

  it('같은 문항을 반복해서 틀려도 항목은 하나, 틀린 횟수만 오른다', () => {
    const { container } = render('/lesson/19');
    for (const wrong of ['a', 'b', 'c']) {
      setValue(container.querySelector('#lesson-q-q1'), wrong);
      submit(container, 'q1');
    }
    const notes = getWrongNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].wrongCount).toBe(3);
    expect(notes[0].userAnswer).toBe('c');
  });

  it('새로고침 뒤에도 지난 채점이 보이고, 레슨에서 다시 맞히면 복습 1회로 기록된다', () => {
    let r = render('/lesson/19');
    setValue(r.container.querySelector('#lesson-q-q1'), 'x');
    submit(r.container, 'q1');
    r.unmount();

    r = render('/lesson/19');
    expect(r.container.textContent).toContain('지난 채점: 오답');
    setValue(r.container.querySelector('#lesson-q-q1'), q1.answer);
    submit(r.container, 'q1');
    expect(r.container.textContent).toContain('정답입니다');
    const [note] = getWrongNotes();
    expect(note).toMatchObject({ reviewCount: 1, lastResult: 'correct' });
    expect(JSON.parse(localStorage.getItem('jungchogi_lesson_results'))[key]).toBe('correct');
  });

  it('오답노트: 레슨 필터 · 재풀이 자동 채점(오답이면 복습 단계 초기화, 정답이면 +1)', () => {
    addWrongNote(buildLessonWrongNote(lesson, q1, 0, 'x'));
    const { container } = render('/wrong');
    act(() => button(container, '레슨').click());
    expect(container.textContent).toContain('D-19');
    act(() => container.querySelector('.wrong-note-header').click());

    act(() => button(container, '다시 풀기').click());
    setValue(container.querySelector('input.quiz-input'), '틀림');
    act(() => button(container, '정답 확인').click());
    expect(container.textContent).toContain('또 틀렸습니다');
    expect(getWrongNotes()[0]).toMatchObject({ reviewCount: 0, lastResult: 'incorrect', wrongCount: 2 });

    act(() => button(container, '닫기').click());
    act(() => button(container, '다시 풀기').click());
    setValue(container.querySelector('input.quiz-input'), q1.answer);
    act(() => button(container, '정답 확인').click());
    expect(container.textContent).toContain('맞았습니다');
    expect(getWrongNotes()[0]).toMatchObject({ reviewCount: 1, lastResult: 'correct' });
  });

  it('자동 채점이 안 되는 단답형은 정답을 본 뒤 직접 채점해야 기록된다', () => {
    addWrongNote({ source: 'exam', id: '001', type: 'quiz', question: 'ACID?', answer: '원자성…' });
    const { container } = render('/wrong');
    act(() => container.querySelector('.wrong-note-header').click());
    act(() => button(container, '다시 풀기').click());
    setValue(container.querySelector('input.quiz-input'), '원자성 일관성');
    act(() => button(container, '정답 확인').click());
    expect(getWrongNotes()[0].reviewCount).toBe(0);
    expect(getWrongNotes()[0].lastResult).toBeUndefined();
    act(() => button(container, '맞았어요').click());
    expect(getWrongNotes()[0]).toMatchObject({ reviewCount: 1, lastResult: 'correct' });
  });
});

describe('기존 데이터 호환', () => {
  it('wrongCount 가 없는 옛 오답을 다시 틀리면 2번째로 센다 (복습 횟수는 유지)', () => {
    localStorage.setItem('jungchogi_wrong_notes', JSON.stringify([{ source: 'quiz', id: 'C-01', reviewCount: 2, addedAt: 1 }]));
    addWrongNote({ source: 'quiz', id: 'C-01', type: 'code' });
    const [note] = getWrongNotes();
    expect(note).toMatchObject({ wrongCount: 2, reviewCount: 2 });
    expect(getWrongNotes()).toHaveLength(1);
  });

  it('레슨 오답도 간격 반복 대기 계산에 들어간다', () => {
    addWrongNote(buildLessonWrongNote(lesson, q1, 0, 'x'));
    const notes = getWrongNotes();
    notes[0].addedAt = Date.now() - 2 * 86400000;
    localStorage.setItem('jungchogi_wrong_notes', JSON.stringify(notes));
    expect(getSpacedRepetitionDue().map((n) => n.id)).toEqual([key]);
  });

  it('백업 합치기: 틀린 횟수는 큰 값, 같은 파일을 두 번 합쳐도 같다', () => {
    const a = [{ source: 'lesson', id: key, reviewCount: 1, wrongCount: 2, addedAt: 5 }];
    const b = [{ source: 'lesson', id: key, reviewCount: 0, wrongCount: 3, addedAt: 9 }];
    const once = mergeValue('wrong_notes', a, b);
    expect(once[0]).toMatchObject({ reviewCount: 1, wrongCount: 3 });
    expect(mergeValue('wrong_notes', once, b)).toEqual(once);
  });
});
