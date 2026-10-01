// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import SqlQuizCard from '../src/components/SqlQuizCard.jsx';
import { SQL_BLANK_ITEMS } from '../src/domain/sqlBlanks.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ITEM = SQL_BLANK_ITEMS.find((i) => i.id === 'SQ-04'); // 빈칸 2개, 대안 정답(JOIN) 포함

let mounted = [];

function render(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(SqlQuizCard, props)));
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
});

// React 가 입력 변경을 알아채도록 네이티브 setter 로 값을 넣는다
function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const button = (c, label) => [...c.querySelectorAll('button')].find((b) => b.textContent === label);
const click = (el) => act(() => el.click());
const blank = (c, n) => c.querySelector(`input[aria-label="빈칸 ${n}"]`);
const status = (c) => c.querySelector('[role="status"]');

describe('SqlQuizCard', () => {
  it('빈칸마다 입력칸을 렌더하고 스키마를 항상 보여준다', () => {
    const c = render({ item: ITEM });
    expect(c.querySelectorAll('input').length).toBe(ITEM.blanks.length);
    expect(blank(c, 1)).not.toBeNull();
    expect(blank(c, 2)).not.toBeNull();
    expect(c.querySelector('details')).toBeNull();
    expect(c.textContent).toContain('emp');
    expect(c.textContent).toContain('dept_name');
  });

  it('채점 전에는 결과 문구가 비어 있다', () => {
    const c = render({ item: ITEM });
    expect(status(c).textContent).toBe('');
  });

  it('채점하면 칸별 정오와 N/M 정답을 보여준다', () => {
    const c = render({ item: ITEM });
    type(blank(c, 1), 'join'); // 대안 정답
    type(blank(c, 2), 'where');
    click(button(c, '채점'));
    expect(status(c).textContent).toBe('1/2 정답');
    expect(blank(c, 1).className).toContain('sqlq-input--ok');
    expect(blank(c, 2).className).toContain('sqlq-input--bad');
  });

  it('입력을 고치면 낡은 채점 표시를 지운다', () => {
    const c = render({ item: ITEM });
    click(button(c, '채점'));
    expect(status(c).textContent).toBe('0/2 정답');
    type(blank(c, 1), 'JOIN');
    expect(status(c).textContent).toBe('');
    expect(blank(c, 1).className).not.toContain('sqlq-input--');
  });

  it('정답 보기는 완성 SQL 을 공개한다', () => {
    const c = render({ item: ITEM });
    expect(c.querySelector('[aria-label="정답 SQL"]')).toBeNull();
    click(button(c, '정답 보기'));
    expect(c.querySelector('[aria-label="정답 SQL"]').textContent).toBe(ITEM.solution);
  });

  it('다시 풀기는 입력·채점·정답 공개를 초기화한다', () => {
    const c = render({ item: ITEM });
    type(blank(c, 1), 'JOIN');
    click(button(c, '채점'));
    click(button(c, '정답 보기'));
    click(button(c, '다시 풀기'));
    expect(blank(c, 1).value).toBe('');
    expect(status(c).textContent).toBe('');
    expect(c.querySelector('[aria-label="정답 SQL"]')).toBeNull();
  });

  it('모두 맞히면 M/M 정답', () => {
    const c = render({ item: ITEM });
    type(blank(c, 1), 'INNER JOIN');
    type(blank(c, 2), 'on');
    click(button(c, '채점'));
    expect(status(c).textContent).toBe('2/2 정답');
  });
});
