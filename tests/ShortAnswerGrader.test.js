// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ShortAnswerGrader from '../src/components/ShortAnswerGrader.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ITEM = {
  id: 't1',
  topic: '운영체제',
  question: '교착상태 조건을 쓰시오.',
  keywords: [{ label: '상호 배제' }, { label: '비선점' }, { label: '환형 대기', aliases: ['순환 대기'] }],
  model: '모범 답안 문장입니다.',
};

let mounted = [];

function render(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(ShortAnswerGrader, props)));
  mounted.push({ root, container });
  return { container, root };
}

function type(container, value) {
  const ta = container.querySelector('textarea');
  // React 가 값 변경을 감지하도록 네이티브 setter 로 값을 넣는다
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  act(() => {
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes(text));

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
});

describe('ShortAnswerGrader', () => {
  it('채점 전에는 키워드와 모범 답안을 보여주지 않는다', () => {
    const { container: c } = render({ item: ITEM });
    expect(c.textContent).toContain(ITEM.question);
    expect(c.textContent).not.toContain('상호 배제');
    expect(c.textContent).not.toContain('모범 답안');
    expect(button(c, '채점').disabled).toBe(true);
  });

  it('채점하면 ✓/✗ 와 N/M 한 줄, 매칭 구간 mark 를 보여준다', () => {
    const { container: c } = render({ item: ITEM });
    type(c, '상호  배제 와 순환 대기가 있다');
    act(() => button(c, '채점').click());

    expect(c.querySelector('[role="status"]').textContent).toBe('2/3 키워드 포함');
    const hit = [...c.querySelectorAll('.sag-kw-hit')].map((e) => e.textContent);
    const miss = [...c.querySelectorAll('.sag-kw-miss')].map((e) => e.textContent);
    expect(hit).toHaveLength(2);
    expect(hit.every((t) => t.includes('✓'))).toBe(true);
    expect(miss).toHaveLength(1);
    expect(miss[0]).toContain('✗');
    expect(miss[0]).toContain('비선점');
    const marks = [...c.querySelectorAll('mark.sag-hit')].map((m) => m.textContent);
    expect(marks).toEqual(['상호  배제', '순환 대기']);
    // 채점 직후에도 모범 답안은 아직 숨겨져 있다
    expect(c.textContent).not.toContain(ITEM.model);
  });

  it('모범 답안 보기 버튼으로 토글한다', () => {
    const { container: c } = render({ item: ITEM });
    type(c, '비선점');
    act(() => button(c, '채점').click());
    act(() => button(c, '모범 답안 보기').click());
    expect(c.textContent).toContain(ITEM.model);
    act(() => button(c, '모범 답안 숨기기').click());
    expect(c.textContent).not.toContain(ITEM.model);
  });

  it('다시 쓰기는 입력·결과를 초기화한다', () => {
    const { container: c } = render({ item: ITEM });
    type(c, '비선점');
    act(() => button(c, '채점').click());
    act(() => button(c, '다시 쓰기').click());
    expect(c.querySelector('textarea').value).toBe('');
    expect(c.querySelector('mark')).toBeNull();
    expect(c.textContent).not.toContain('비선점');
  });

  it('다른 문항이 들어오면 초기화된다', () => {
    const { container: c, root } = render({ item: ITEM });
    type(c, '비선점');
    act(() => button(c, '채점').click());
    act(() => root.render(createElement(ShortAnswerGrader, { item: { ...ITEM, id: 't2', question: '다음 문제' } })));
    expect(c.textContent).toContain('다음 문제');
    expect(c.querySelector('textarea').value).toBe('');
    expect(c.querySelector('[role="status"]')).toBeNull();
  });
});
