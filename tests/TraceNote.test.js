// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import TraceNote from '../src/components/TraceNote.jsx';
import { getTraceNote, getTraceNotes, saveTraceNote } from '../src/utils/storage.js';
import { isValidValue, mergeValue } from '../src/utils/backup.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(TraceNote, props)));
  return container;
}

function type(el, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('TraceNote — 나의 답 · 트레이싱 메모', () => {
  it('입력하면 문제별로 저장되고, 다시 열면 그대로 보인다', () => {
    let c = mount({ problemId: 'C-05', expectedOutput: '18 6' });
    type(c.querySelector('#trace-note-memo-C-05'), 'i=0: sum=4');
    type(c.querySelector('#trace-note-answer-C-05'), '18 6');
    expect(getTraceNote('C-05')).toEqual({ answer: '18 6', memo: 'i=0: sum=4' });
    expect(getTraceNote('C-06')).toEqual({ answer: '', memo: '' });

    act(() => root.unmount());
    container.remove();
    c = mount({ problemId: 'C-05', expectedOutput: '18 6' });
    expect(c.querySelector('#trace-note-memo-C-05').value).toBe('i=0: sum=4');
    expect(c.querySelector('#trace-note-answer-C-05').value).toBe('18 6');
  });

  it('내 답 확인 — 정답 출력과 비교한다', () => {
    const c = mount({ problemId: 'C-05', expectedOutput: '18 6' });
    const btn = [...c.querySelectorAll('button')].find((b) => b.textContent === '내 답 확인');
    act(() => btn.click());
    expect(c.querySelector('[role="status"]').textContent).toContain('먼저 적어');
    type(c.querySelector('#trace-note-answer-C-05'), '18 5');
    act(() => btn.click());
    expect(c.querySelector('[role="status"]').textContent).toContain('다릅니다');
    type(c.querySelector('#trace-note-answer-C-05'), '18 6');
    act(() => btn.click());
    expect(c.querySelector('[role="status"]').textContent).toContain('일치');
  });

  it('두 칸을 모두 비우면 저장 항목을 지운다', () => {
    saveTraceNote('C-05', { answer: 'x', memo: '' });
    saveTraceNote('C-05', { answer: '  ', memo: '' });
    expect(getTraceNotes()).toEqual({});
  });
});

describe('trace_notes 백업 규칙', () => {
  const a = { 'C-01': { answer: '20 5', memo: 'old', updatedAt: 1 } };
  const b = { 'C-01': { answer: '20 5', memo: 'new', updatedAt: 2 }, 'C-02': { answer: '', memo: 'm', updatedAt: 1 } };

  it('모양을 검증한다', () => {
    expect(isValidValue('trace_notes', a)).toBe(true);
    expect(isValidValue('trace_notes', { 'C-01': { answer: 1, memo: '', updatedAt: 1 } })).toBe(false);
    expect(isValidValue('trace_notes', [])).toBe(false);
  });

  it('문제별로 나중에 고친 쪽을 쓰고, 다시 합쳐도 같다', () => {
    const once = mergeValue('trace_notes', a, b);
    expect(once['C-01'].memo).toBe('new');
    expect(once['C-02'].memo).toBe('m');
    expect(mergeValue('trace_notes', once, b)).toEqual(once);
    expect(mergeValue('trace_notes', b, a)['C-01'].memo).toBe('new');
  });
});
