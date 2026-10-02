// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LESSONS } from '../src/domain/lessons.js';
import LessonPage from '../src/pages/LessonPage.jsx';
import { resetStudyState } from '../src/utils/studyState.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted = [];
function render(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(MemoryRouter, { initialEntries: [path] },
        createElement(Routes, null, createElement(Route, { path: '/lesson/:d', element: createElement(LessonPage) }))),
    ),
  );
  mounted.push({ root, container });
  return container;
}
const click = (el) => act(() => el.click());
const type = (input, value) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

beforeEach(() => {
  localStorage.clear();
  resetStudyState();
});
afterEach(() => {
  for (const { root, container } of mounted) { act(() => root.unmount()); container.remove(); }
  mounted = [];
});

describe('레슨 화면', () => {
  it('D-24 레슨의 개념·예제·퀴즈를 보여준다', () => {
    const c = render('/lesson/24');
    expect(c.querySelector('h1').textContent).toContain('C언어 연산자');
    expect(c.textContent).toContain('7 5 7');
    expect(c.querySelectorAll('ol > li input')).toHaveLength(4);
  });

  it('D-17 SQL 레슨은 샘플 표 DEPT·EMP 를 보여준다', () => {
    const c = render('/lesson/17');
    expect([...c.querySelectorAll('table')]).toHaveLength(2);
    expect(c.textContent).toContain('NULL');
  });

  it('없는 일차는 안내를 보여준다', () => {
    const c = render('/lesson/4');
    expect(c.textContent).toContain('찾을 수 없습니다');
  });

  it('완료 체크가 저장되고 다시 열어도 복원된다', () => {
    let c = render('/lesson/23');
    click(c.querySelector('input[aria-label="D-23 학습 완료"]'));
    expect(JSON.parse(localStorage.getItem('jungchogi_roadmap_checks'))).toEqual({ 23: true });
    // 하단 토글도 같은 상태를 따라온다
    expect(c.querySelector('input[aria-label="D-23 학습 완료 (하단)"]').checked).toBe(true);
    act(() => mounted.pop().root.unmount());
    c = render('/lesson/23');
    expect(c.querySelector('input[aria-label="D-23 학습 완료"]').checked).toBe(true);
  });

  it('북마크가 저장되고 aria-pressed 로 표시된다', () => {
    const c = render('/lesson/24');
    const btn = c.querySelector('button[aria-pressed]');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(localStorage.getItem('jungchogi_lesson_bookmarks'))).toEqual({ 'c-operators': true });
  });

  it('퀴즈: 정답이면 정답, 오답이면 정답을 보여준다 (공백 차이는 무시)', () => {
    const c = render('/lesson/24');
    const first = c.querySelector('#lesson-q-q1');
    type(first, '  4 ');
    click(first.closest('li').querySelector('button[type="submit"]'));
    expect(first.closest('li').querySelector('[role="status"]').textContent).toContain('정답입니다');

    const second = c.querySelector('#lesson-q-q2');
    type(second, '6 5 7');
    click(second.closest('li').querySelector('button[type="submit"]'));
    const msg = second.closest('li').querySelector('[role="status"]').textContent;
    expect(msg).toContain('오답입니다');
    expect(msg).toContain('7 5 7');
  });

  it('모든 레슨의 모든 퀴즈에 자기 정답을 넣으면 정답 처리된다', () => {
    for (const lesson of LESSONS) {
      const c = render(`/lesson/${lesson.d}`);
      for (const q of lesson.questions) {
        const input = c.querySelector(`#lesson-q-${q.id}`);
        type(input, q.answer);
        click(input.closest('li').querySelector('button[type="submit"]'));
        expect(input.closest('li').querySelector('[role="status"]').textContent, `${lesson.id}/${q.id}`).toContain('정답입니다');
      }
      // 한 화면에 한 레슨만 둔다 — 문서에 같은 id 가 남으면 jsdom 의 #id 검색이 앞 레슨의 요소를 집는다
      const m = mounted.pop();
      act(() => m.root.unmount());
      m.container.remove();
    }
  });

  it('용어 문제는 같은 뜻의 다른 표기·대소문자도 정답으로 본다', () => {
    const c = render('/lesson/8');
    const input = c.querySelector('#lesson-q-q1');
    type(input, '싱글턴');
    click(input.closest('li').querySelector('button[type="submit"]'));
    expect(input.closest('li').querySelector('[role="status"]').textContent).toContain('정답입니다');
    const other = c.querySelector('#lesson-q-q3');
    type(other, 'FACADE');
    click(other.closest('li').querySelector('button[type="submit"]'));
    expect(other.closest('li').querySelector('[role="status"]').textContent).toContain('정답입니다');
  });
});
