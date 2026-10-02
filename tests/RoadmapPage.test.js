// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LESSONS } from '../src/domain/lessons.js';
import RoadmapPage from '../src/pages/RoadmapPage.jsx';
import { loadProgress, saveProgress, setExamDate } from '../src/utils/storage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 9, 1, 12, 0, 0); // 2026-10-01 (Asia/Seoul)

let mounted = [];

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, null, createElement(RoadmapPage))));
  mounted.push({ root, container });
  return container;
}

const days = (c) => [...c.querySelectorAll('.road-day')];
const dayCard = (c, label) => days(c).find((el) => el.querySelector('.road-day-d').textContent === label);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  setExamDate('2026-10-25');
});

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  vi.useRealTimers();
});

describe('25일 로드맵 화면', () => {
  it('4단계 제목과 25칸(학습 24일 + D-Day)을 보여준다', () => {
    const c = render();
    const titles = [...c.querySelectorAll('.road-phase-title')].map((e) => e.textContent);
    expect(titles[0]).toContain('1단계');
    expect(titles[0]).toContain('코딩 · SQL 집중');
    expect(titles[0]).toContain('D-24 ~ D-16');
    expect(titles[2]).toContain('기사 특화');
    expect(titles[3]).toContain('D-3 ~ D-1');
    expect(days(c)).toHaveLength(25);
    expect(dayCard(c, 'D-24').textContent).toContain('10/1(목)');
    expect(dayCard(c, 'D-Day').textContent).toContain('10/25(일)');
  });

  it('오늘(10/1 = D-24)을 표시한다', () => {
    const c = render();
    const today = c.querySelectorAll('.road-day.is-today');
    expect(today).toHaveLength(1);
    expect(today[0].querySelector('.road-day-d').textContent).toBe('D-24');
    expect(today[0].textContent).toContain('오늘');
  });

  it('시험 종류 선택 없이 기사·산업기사 공통 로드맵이라고 안내한다', () => {
    const c = render();
    expect(c.querySelector('[role="radiogroup"]')).toBeNull();
    expect(c.querySelector('.road-controls-title').textContent).toContain('공통 로드맵');
    expect(c.querySelector('.road-controls').textContent).toContain('공통 모듈');
    expect(c.querySelector('.road-controls').textContent).toContain('기사 특화');
  });

  it('3단계는 공통 복습이 먼저, 기사 특화가 뒤다', () => {
    const c = render();
    const scopes = [...dayCard(c, 'D-9').querySelectorAll('.road-topic')].map((e) => e.className.includes('is-engineer'));
    expect(scopes).toEqual([false, true]);
  });

  it('체크하면 저장되고 진도 게이지가 오른다', async () => {
    const c = render();
    expect(c.querySelector('.road-gauge-label').textContent).toContain('0%');

    const box = dayCard(c, 'D-24').querySelector('input[type="checkbox"]');
    await act(async () => { box.click(); });
    expect(loadProgress('roadmap_checks', {})).toEqual({ 24: true });
    expect(c.querySelector('.road-gauge-label').textContent).toContain('1/24일 완료');
    expect(c.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('4');
    expect(dayCard(c, 'D-24').className).toContain('is-done');

    await act(async () => { dayCard(c, 'D-24').querySelector('input[type="checkbox"]').click(); });
    expect(loadProgress('roadmap_checks', {})).toEqual({});
    expect(c.querySelector('.road-gauge-label').textContent).toContain('0/24일 완료');
  });

  it('저장된 체크가 다시 열어도 유지된다', () => {
    saveProgress('roadmap_checks', { 24: true, 23: true });
    const c = render();
    expect(c.querySelector('.road-gauge-label').textContent).toContain('2/24일 완료');
    expect(dayCard(c, 'D-23').querySelector('input').checked).toBe(true);
  });

  it('D-Day 에는 체크박스가 없다', () => {
    expect(dayCard(render(), 'D-Day').querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('주제 링크가 학습 노트·검색·연습 화면으로 간다', () => {
    const c = render();
    const hrefs = [...dayCard(c, 'D-15').querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/study?day=6');
    expect(hrefs).toContain(`/search?q=${encodeURIComponent('스케줄링')}`);
  });

  it('깨진 체크 저장값에도 화면이 그려진다', () => {
    saveProgress('roadmap_checks', 'oops');
    const c = render();
    expect(c.querySelector('.road-gauge-label').textContent).toContain('0/24일 완료');
  });

  it('시험일이 지났으면 안내를 보여준다', () => {
    setExamDate('2026-09-20');
    expect(render().textContent).toContain('설정한 시험일이 지났습니다');
  });
});

describe('1단계 레슨 목록', () => {
  it('레슨 카드 18개와 일차 카드의 레슨 링크를 보여준다 (D-16 · D-10 · D-4 점검일은 레슨 없음)', () => {
    const c = render();
    const shelf = c.querySelector('#road-lessons').closest('section');
    expect([...shelf.querySelectorAll('article h3')].map((h) => h.textContent)).toEqual(LESSONS.map((l) => l.title));
    expect(shelf.querySelectorAll('article')).toHaveLength(18);
    expect(dayCard(c, 'D-24').querySelector('a[href="/lesson/24"]')).not.toBeNull();
    expect(dayCard(c, 'D-17').querySelector('a[href="/lesson/17"]')).not.toBeNull();
    for (const d of [24, 23, 22, 21, 20, 19, 18, 17, 15, 14, 13, 12, 11, 9, 8, 7, 6, 5]) {
      expect(dayCard(c, `D-${d}`).querySelector(`a[href="/lesson/${d}"]`), `D-${d}`).not.toBeNull();
    }
    for (const d of [16, 10, 4]) expect(dayCard(c, `D-${d}`).querySelector('a[href^="/lesson/"]'), `D-${d}`).toBeNull();
  });

  it('북마크하면 저장되고 "북마크만 보기"로 걸러진다', async () => {
    const c = render();
    const shelf = c.querySelector('#road-lessons').closest('section');
    await act(async () => { shelf.querySelectorAll('article button[aria-pressed]')[1].click(); });
    expect(loadProgress('lesson_bookmarks', {})).toEqual({ 'c-control-flow': true });

    await act(async () => { shelf.querySelector('input[type="checkbox"]').click(); });
    expect([...shelf.querySelectorAll('article h3')].map((h) => h.textContent)).toEqual(['C언어 제어문']);
  });

  it('북마크가 없으면 빈 안내를 보여준다', async () => {
    const c = render();
    const shelf = c.querySelector('#road-lessons').closest('section');
    await act(async () => { shelf.querySelector('input[type="checkbox"]').click(); });
    expect(shelf.querySelectorAll('article')).toHaveLength(0);
    expect(shelf.textContent).toContain('북마크한 레슨이 없습니다');
  });

  it('레슨 카드의 완료 표시는 로드맵 완료 체크와 같은 기록을 본다', () => {
    saveProgress('roadmap_checks', { 24: true });
    const c = render();
    const first = c.querySelector('#road-lessons').closest('section').querySelector('article');
    expect(first.textContent).toContain('완료');
  });
});

