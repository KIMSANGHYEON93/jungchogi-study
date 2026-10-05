// @vitest-environment jsdom
//
// 대시보드가 25일 로드맵을 유일한 계획으로 쓰는지 — 오늘 카드 · 진도 · 추천.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../src/pages/DashboardPage.jsx';
import { saveProgress, setExamDate } from '../src/utils/storage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const day = (m, d) => new Date(2026, m - 1, d, 12, 0, 0);

let mounted = [];
function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, null, createElement(DashboardPage))));
  mounted.push({ root, container });
  return container;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(day(10, 1));
  setExamDate('2026-10-25');
});
afterEach(() => {
  for (const { root, container } of mounted) { act(() => root.unmount()); container.remove(); }
  mounted = [];
  vi.useRealTimers();
});

describe('대시보드 — 로드맵 하나로 통합', () => {
  it('오늘의 로드맵 카드가 있고, 예전 일일 플랜 카드와 14일 체크리스트는 없다', () => {
    const c = render();
    expect(c.querySelector('#daily-goal-title').textContent).toContain('오늘의 로드맵');
    expect(c.textContent).toContain('C언어 연산자');
    expect(c.textContent).not.toContain('오늘의 목표 단계');
    expect(c.textContent).not.toContain('14일 학습 체크리스트');
  });

  it('로드맵 진도 카드가 있고 로드맵 링크로 간다', () => {
    const c = render();
    expect(c.textContent).toContain('25일 로드맵 진도');
    expect(c.textContent).toContain('0/24일 완료');
    expect([...c.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/roadmap' && a.textContent.includes('로드맵 열기'))).toBe(true);
  });

  it('로드맵 완료 체크가 진도에 반영된다', () => {
    saveProgress('roadmap_checks', { 24: true, 23: true });
    const c = render();
    expect(c.textContent).toContain('2/24일 완료');
  });

  it('추천: 오늘 일차가 안 끝났으면 그 일차의 레슨부터', () => {
    const c = render();
    expect(c.textContent).toContain('오늘의 로드맵 — D-24 C언어 연산자');
    expect([...c.querySelectorAll('button')].some((b) => b.textContent === '레슨 시작')).toBe(true);
  });

  it('추천: 레슨이 없는 일차(점검일)는 로드맵 보기', () => {
    vi.setSystemTime(day(10, 9)); // D-16
    saveProgress('roadmap_checks', {});
    const c = render();
    expect(c.textContent).toContain('오늘의 로드맵 — D-16 1단계 점검');
    expect([...c.querySelectorAll('button')].some((b) => b.textContent === '로드맵 보기')).toBe(true);
  });

  it('추천: 오늘 일차를 끝냈고 밀린 일차가 있으면 이어하기를 권한다', () => {
    vi.setSystemTime(day(10, 4)); // D-21, D-24~D-22 밀림
    saveProgress('roadmap_checks', { 21: true });
    const c = render();
    expect(c.textContent).toContain('밀린 로드맵 일차가 3개 있어요');
    expect([...c.querySelectorAll('button')].some((b) => b.textContent === '이어하기')).toBe(true);
  });

  it('핵심 암기 카드 진도의 분모는 카드 수(68)다', () => {
    saveProgress('flashcard_known_core', { K001: true, K002: true });
    const c = render();
    expect(c.textContent).toContain('핵심 암기 카드');
    expect(c.textContent).toContain('/68');
    expect(c.textContent).toContain('3%'); // 2/68
  });
});
