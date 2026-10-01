// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import CodeTracingTable from '../src/components/CodeTracingTable.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CODE = 'int a = 1;\na = a + 1;\nprintf("%d", a);';
const STEPS = [
  { step: 1, line: 1, variables: { a: 1, p: null } },
  { step: 2, line: 2, variables: { a: 2, p: null } },
  { step: 3, line: 3, variables: { a: 2, p: null }, output: '2' },
];

let mounted = [];

function render(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(CodeTracingTable, props)));
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

function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const button = (c, label) => [...c.querySelectorAll('button')].find((b) => b.textContent === label);
const click = (el) => act(() => el.click());
const bodyRows = (c) => c.querySelectorAll('tbody tr');
const status = (c) => c.querySelector('[role="status"]');

describe('CodeTracingTable', () => {
  it('steps 가 비었거나 변수가 없으면 던지지 않고 안내를 보여준다', () => {
    const a = render({ steps: [] });
    expect(a.textContent).toContain('실행 추적 데이터가 없습니다');
    const b = render({ steps: [{ step: 1, line: 1, variables: {} }] });
    expect(b.textContent).toContain('실행 추적 데이터가 없습니다');
    const c = render({ steps: undefined });
    expect(c.querySelector('table')).toBeNull();
  });

  it('표 머리글은 step · line · 변수 합집합 · output 이고 th scope 를 가진다', () => {
    const c = render({ code: CODE, lang: 'c', steps: STEPS });
    const heads = [...c.querySelectorAll('thead th')];
    expect(heads.map((h) => h.textContent)).toEqual(['step', 'line', 'a', 'p', 'output']);
    expect(heads.every((h) => h.getAttribute('scope') === 'col')).toBe(true);
    expect(c.querySelector('tbody th').getAttribute('scope')).toBe('row');
  });

  it('변수 합집합은 등장 순서이고 없는 변수 칸은 - 로 나온다', () => {
    const c = render({
      steps: [
        { step: 1, line: 1, variables: { a: 1 } },
        { step: 2, line: 2, variables: { a: 1, b: 5 } },
      ],
    });
    expect([...c.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['step', 'line', 'a', 'b', 'output']);
    expect(bodyRows(c)[0].querySelectorAll('td')[2].textContent).toBe('-');
  });

  it('트레이싱 보기는 한 칸씩 공개하고 현재 줄을 강조한다', () => {
    const c = render({ code: CODE, lang: 'c', steps: STEPS });
    expect(button(c, '트레이싱 보기').getAttribute('aria-pressed')).toBe('true');
    expect(button(c, '직접 채워보기').getAttribute('aria-pressed')).toBe('false');
    expect(bodyRows(c).length).toBe(1);
    expect(c.querySelector('.trace-line--active .trace-ln').textContent).toBe('1');
    expect(button(c, '이전').disabled).toBe(true);

    click(button(c, '다음'));
    expect(bodyRows(c).length).toBe(2);
    expect(c.querySelector('.trace-line--active .trace-ln').textContent).toBe('2');
    expect(status(c).textContent).toBe('step 2 / 3 · 2번째 줄');

    click(button(c, '다음'));
    expect(bodyRows(c).length).toBe(3);
    expect(button(c, '다음').disabled).toBe(true);
    expect(bodyRows(c)[2].querySelector('.trace-output').textContent).toBe('2');

    click(button(c, '이전'));
    expect(bodyRows(c).length).toBe(2);
  });

  it('전체 보기는 모든 행을 펼친다', () => {
    const c = render({ code: CODE, steps: STEPS });
    click(button(c, '전체 보기'));
    expect(bodyRows(c).length).toBe(3);
    expect(c.querySelector('.trace-line--active')).toBeNull();
    click(button(c, '이전'));
    expect(bodyRows(c).length).toBe(2); // 마지막에서 한 칸 뒤로
  });

  it('코드가 없으면 코드 블록을 그리지 않는다', () => {
    const c = render({ steps: STEPS });
    expect(c.querySelector('pre')).toBeNull();
  });

  it('직접 채워보기: 변수 칸은 입력칸, null 칸은 - 고정', () => {
    const c = render({ code: CODE, steps: STEPS });
    click(button(c, '직접 채워보기'));
    expect(button(c, '직접 채워보기').getAttribute('aria-pressed')).toBe('true');
    expect(bodyRows(c).length).toBe(3);
    // a 는 3행 모두 입력칸, p 는 전부 null 이라 입력칸 없음
    expect(c.querySelectorAll('tbody input').length).toBe(3);
    expect(c.querySelectorAll('.trace-cell--unset').length).toBe(3);
  });

  it('채점은 칸별로 정답/오답을 표시하고 공백은 무시한다', () => {
    const c = render({ steps: STEPS });
    click(button(c, '직접 채워보기'));
    type(c.querySelector('input[aria-label="step 1 a"]'), ' 1 ');
    type(c.querySelector('input[aria-label="step 2 a"]'), '5');
    click(button(c, '채점'));
    expect(c.querySelector('input[aria-label="step 1 a"]').closest('td').className).toContain('trace-cell--ok');
    expect(c.querySelector('input[aria-label="step 2 a"]').closest('td').className).toContain('trace-cell--bad');
    expect(c.querySelector('input[aria-label="step 3 a"]').closest('td').className).toContain('trace-cell--bad');
    expect(status(c).textContent).toBe('1/3 정답');
  });

  it('정답 보기는 값을 공개하고, 초기화는 입력을 비운다', () => {
    const c = render({ steps: STEPS });
    click(button(c, '직접 채워보기'));
    click(button(c, '정답 보기'));
    expect(c.querySelector('input[aria-label="step 2 a"]').value).toBe('2');
    expect(c.querySelector('input[aria-label="step 2 a"]').readOnly).toBe(true);
    click(button(c, '초기화'));
    expect(c.querySelector('input[aria-label="step 2 a"]').value).toBe('');
    expect(status(c).textContent).toBe('입력을 초기화했습니다.');
  });

  it('모드를 오가도 채워 둔 입력이 남는다', () => {
    const c = render({ steps: STEPS });
    click(button(c, '직접 채워보기'));
    type(c.querySelector('input[aria-label="step 1 a"]'), '1');
    click(button(c, '트레이싱 보기'));
    click(button(c, '직접 채워보기'));
    expect(c.querySelector('input[aria-label="step 1 a"]').value).toBe('1');
  });
});
