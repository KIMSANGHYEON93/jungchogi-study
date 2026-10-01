// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
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

const radio = (c, label) => [...c.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes(label));
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

  it('동시 대비가 기본으로 선택돼 있다', () => {
    const c = render();
    expect(radio(c, '동시 대비').getAttribute('aria-checked')).toBe('true');
    expect(radio(c, '정보처리기사').getAttribute('aria-checked')).toBe('false');
  });

  it('시험 종류를 바꾸면 3단계 주제 구성이 바뀌고 선택이 저장된다', async () => {
    const c = render();
    const scopes = () => [...dayCard(c, 'D-9').querySelectorAll('.road-topic')].map((e) => e.className.includes('is-engineer'));

    expect(scopes()).toEqual([false, true]); // 동시 대비: 공통 먼저

    await act(async () => { radio(c, '정보처리기사').click(); });
    expect(scopes()).toEqual([true, false]); // 기사: 특화 먼저
    expect(loadProgress('exam_type', null)).toBe('engineer');

    await act(async () => { radio(c, '정보처리산업기사').click(); });
    expect(scopes()).toEqual([false]); // 산업기사: 공통만
    expect(c.textContent).toContain('산업기사 출제 범위는 이 앱이 확정하지 않습니다');
    expect(loadProgress('exam_type', null)).toBe('industrial');
  });

  it('저장된 시험 종류로 열린다 (깨진 값은 기본값)', () => {
    saveProgress('exam_type', 'industrial');
    expect(radio(render(), '정보처리산업기사').getAttribute('aria-checked')).toBe('true');
    saveProgress('exam_type', 'nope');
    const c2 = render();
    expect(radio(c2, '동시 대비').getAttribute('aria-checked')).toBe('true');
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
    expect(loadProgress('roadmap_checks', {})).toEqual({ 24: false });
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
