// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DailyGoalCard from '../src/components/DailyGoalCard.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 2026-10-01 (Asia/Seoul) — 시험 10/25 까지 24일
const NOW = new Date(2026, 9, 1, 12, 0, 0);

let mounted = [];

function render(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(MemoryRouter, null, createElement(DailyGoalCard, { dayChecks: {}, ...props }))
    )
  );
  mounted.push({ root, container });
  return container;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  vi.useRealTimers();
});

describe('DailyGoalCard', () => {
  it('시험일이 없으면 10/25 기본값으로 D-24 와 안내를 보여준다', () => {
    const c = render({ examDate: '', onToggleDay: () => {} });
    expect(c.textContent).toContain('D-24');
    expect(c.textContent).toContain('2026.10.25 기준');
  });

  it('오늘의 목표 Day 가 학습 문서 링크와 함께 나온다', () => {
    const c = render({ examDate: '2026-10-25', onToggleDay: () => {} });
    const link = c.querySelector('a.goal-unit-title');
    expect(link.textContent).toContain('Day01');
    expect(link.getAttribute('href')).toBe('/study?day=1');
    expect(c.textContent).not.toContain('기준으로 계산했습니다');
  });

  it('완료 버튼은 대시보드의 토글에 위임한다', () => {
    const onToggleDay = vi.fn();
    const c = render({ examDate: '2026-10-25', onToggleDay });
    const btn = c.querySelector('button.goal-check');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    act(() => btn.click());
    expect(onToggleDay).toHaveBeenCalledWith(1);
  });

  it('완료한 Day 는 빠지고 다음 Day 가 오늘 목표가 된다', () => {
    const c = render({ examDate: '2026-10-25', dayChecks: { 1: true }, onToggleDay: () => {} });
    expect(c.querySelector('a.goal-unit-title').textContent).toContain('Day02');
    expect(c.textContent).toContain('1/14 Day 완료');
  });

  it('Day01~12 를 모두 끝낸 날은 복습 링크를 보여준다', () => {
    const done12 = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, true]));
    const c = render({ examDate: '2026-10-25', dayChecks: done12, onToggleDay: () => {} });
    const hrefs = [...c.querySelectorAll('a.goal-review-link')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/wrong', '/flashcard', '/quiz']);
    expect(c.querySelector('.goal-units')).toBeNull();
  });

  it('시험일이 지났으면 안내만 보여주고 목표는 없다', () => {
    const c = render({ examDate: '2026-09-20', onToggleDay: () => {} });
    expect(c.textContent).toContain('시험일이 지났습니다');
    expect(c.querySelector('.goal-units')).toBeNull();
  });

  it('14일을 모두 마치면 완료 문구를 보여준다', () => {
    const all = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i + 1, true]));
    const c = render({ examDate: '2026-10-25', dayChecks: all, onToggleDay: () => {} });
    expect(c.textContent).toContain('14일 학습을 모두 마쳤습니다');
  });

  it('다가오는 일정은 최대 6일까지 보여준다', () => {
    const c = render({ examDate: '2026-10-25', onToggleDay: () => {} });
    expect(c.querySelectorAll('.goal-upcoming-item')).toHaveLength(6);
  });
});
