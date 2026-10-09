// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import TodayRoadmapCard from '../src/components/TodayRoadmapCard.jsx';
import { downloadIcs } from '../src/utils/icsExport.js';
import { loadProgress, saveProgress } from '../src/utils/storage.js';

// 다운로드(Blob·a[download])만 막고 .ics 생성은 실제 구현을 쓴다
vi.mock('../src/utils/icsExport.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadIcs: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 2026-10-01 (Asia/Seoul) — 시험 10/25 까지 24일 = D-24
const day = (m, d) => new Date(2026, m - 1, d, 12, 0, 0);

let mounted = [];

function render(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, null, createElement(TodayRoadmapCard, { examDate: '2026-10-25', ...props }))));
  mounted.push({ root, container });
  return container;
}
const exportButton = (c) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes('.ics'));

beforeEach(() => {
  localStorage.clear();
  downloadIcs.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(day(10, 1));
});

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  vi.useRealTimers();
});

describe('TodayRoadmapCard — 오늘의 로드맵', () => {
  it('시험일이 없으면 10/25 기본값으로 D-24 와 안내를 보여준다', () => {
    const c = render({ examDate: '' });
    expect(c.querySelector('.goal-dday').textContent).toBe('D-24');
    expect(c.textContent).toContain('2026.10.25 기준');
  });

  it('오늘의 일차: 제목 · 주제 · 학습 노트와 레슨 링크가 나온다', () => {
    const c = render();
    expect(c.querySelector('.goal-unit-title').textContent).toBe('C언어 연산자');
    expect(c.textContent).toContain('1단계');
    expect(c.textContent).toContain('10/1(목)');
    const hrefs = [...c.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/study?day=1');
    expect(hrefs).toContain('/lesson/24');
    expect(c.querySelector('.goal-lesson-link').textContent).toContain('C언어 연산자');
    expect(c.textContent).not.toContain('기준으로 계산했습니다');
  });

  it('레슨이 없는 일차에는 레슨 버튼이 없다 (D-16 점검일)', () => {
    vi.setSystemTime(day(10, 9));
    const c = render();
    expect(c.querySelector('.goal-dday').textContent).toBe('D-16');
    expect(c.querySelector('.goal-lesson-link')).toBeNull();
  });

  it('오늘 2시간 배분(코드 60 · 주제 40 · 복습 20)을 보인다', () => {
    const c = render();
    expect([...c.querySelectorAll('.goal-block strong')].map((e) => e.textContent)).toEqual(['코드 60분', '주제 40분', '복습 20분']);
    expect(c.querySelector('.road-gate')).toBeNull();
  });

  it('D-16 점검일에는 85% 기준이, 실전 모의고사일(D-10)에는 150분 + 채점 30분과 초과 안내가 보인다', () => {
    vi.setSystemTime(day(10, 9));
    let c = render();
    expect(c.querySelector('.road-gate').textContent).toContain('85%');
    c.remove();
    vi.setSystemTime(day(10, 15));
    c = render();
    expect(c.querySelector('.goal-dday').textContent).toBe('D-10');
    expect([...c.querySelectorAll('.goal-block strong')].map((e) => e.textContent)).toEqual(['실전 모의고사 150분', '채점 · 오답 정리 30분']);
    expect(c.querySelector('.road-load').textContent).toContain('60분 초과');
  });

  it('완료 버튼은 로드맵과 같은 저장소(roadmap_checks)에 기록한다', () => {
    const c = render();
    const btn = c.querySelector('button.goal-check');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    act(() => btn.click());
    expect(loadProgress('roadmap_checks', {})).toEqual({ 24: true });
    expect(c.querySelector('button.goal-check').getAttribute('aria-pressed')).toBe('true');
    expect(c.textContent).toContain('1/24일 완료');
    act(() => c.querySelector('button.goal-check').click());
    expect(loadProgress('roadmap_checks', {})).toEqual({});
  });

  it('로드맵 화면에서 한 완료 체크가 카드에 반영된다', () => {
    saveProgress('roadmap_checks', { 24: true, 23: true });
    const c = render();
    expect(c.textContent).toContain('2/24일 완료');
    expect(c.querySelector('.goal-roadmap-day').className).toContain('is-done');
  });

  it('지났는데 못 끝낸 일차를 "밀린 일차"로 알린다', () => {
    vi.setSystemTime(day(10, 4)); // D-21 — D-24 ~ D-22 가 지남
    saveProgress('roadmap_checks', { 24: true });
    const c = render();
    const late = c.querySelector('.road-catchup');
    expect(late.textContent).toContain('밀린 일차 2개');
    expect(late.textContent).toContain('D-23 · D-22');
    expect(late.querySelector('a').getAttribute('href')).toBe('/roadmap');
  });

  it('밀린 일차가 없으면 알림이 없다', () => {
    expect(render().querySelector('.road-catchup')).toBeNull();
  });

  it('시험 당일에는 D-Day 가 나오고 완료 버튼이 없다', () => {
    vi.setSystemTime(day(10, 25));
    const c = render();
    expect(c.querySelector('.goal-dday').textContent).toBe('D-Day');
    expect(c.querySelector('button.goal-check')).toBeNull();
    expect(c.textContent).toContain('시험 당일');
  });

  it('로드맵 시작 전이면 시작일을 알려주고 진도는 그대로 보여준다', () => {
    const c = render({ examDate: '2026-11-30' }); // D-60
    expect(c.textContent).toContain('로드맵은 D-24');
    expect(c.querySelector('button.goal-check')).toBeNull();
    expect(c.textContent).toContain('0/24일 완료');
  });

  it('시험일이 지났으면 안내만 보여주고 목표·내보내기는 없다', () => {
    const c = render({ examDate: '2026-09-20' });
    expect(c.textContent).toContain('시험일이 지났습니다');
    expect(c.querySelector('.goal-roadmap-day')).toBeNull();
    expect(exportButton(c)).toBeUndefined();
  });

  it('다가오는 일정은 최대 6일까지 보여준다', () => {
    const c = render();
    const items = [...c.querySelectorAll('.goal-upcoming-item')];
    expect(items).toHaveLength(6);
    expect(items[0].textContent).toContain('D-23');
    expect(items[0].textContent).toContain('C언어 제어문');
  });

  it('내보내기: 오늘부터의 학습일과 시험 당일을 .ics 로 내려받는다 (제목에 D-n 과 일차 제목)', () => {
    const c = render();
    act(() => exportButton(c).click());
    expect(downloadIcs).toHaveBeenCalledTimes(1);
    const [text, filename] = downloadIcs.mock.calls[0];
    expect(filename).toBe('jungchogi-roadmap-2026-10-01.ics');
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(25); // D-24 ~ D-1 + D-Day
    expect(text).toContain('SUMMARY:D-24 C언어 연산자');
    expect(text).toContain('UID:jungchogi-2026-10-25@jungchogi-study');
  });

  it('내보내기: 이미 끝낸 일차와 지난 날은 뺀다', () => {
    vi.setSystemTime(day(10, 4)); // D-21
    saveProgress('roadmap_checks', { 21: true });
    const c = render();
    act(() => exportButton(c).click());
    const text = downloadIcs.mock.calls[0][0];
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(21); // D-20 ~ D-1 (20) + D-Day, 완료한 D-21 은 제외
    expect(text).not.toContain('SUMMARY:D-21 ');
    expect(text).not.toContain('SUMMARY:D-24 ');
    expect(text).toContain('SUMMARY:D-20 ');
  });
});
