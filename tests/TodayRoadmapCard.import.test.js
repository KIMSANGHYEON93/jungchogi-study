// @vitest-environment jsdom
//
// 오늘의 로드맵 카드의 Google 캘린더 가져오기 흐름. 서비스(네트워크·GIS)는 목킹하고,
// 가져온 일정이 로드맵 표시와 저장소에 어떻게 반영되는지를 본다.
// (로드맵은 일차를 옮기지 않는다 — 일정이 많은 날은 "가볍게" 표시만 한다.)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import TodayRoadmapCard from '../src/components/TodayRoadmapCard.jsx';
import RoadmapPage from '../src/pages/RoadmapPage.jsx';
import * as gcal from '../src/services/googleCalendar.js';
import { loadProgress, saveProgress } from '../src/utils/storage.js';

vi.mock('../src/services/googleCalendar.js', () => ({
  isGoogleCalendarConfigured: vi.fn(() => true),
  fetchCalendarEvents: vi.fn(),
  loadGisScript: vi.fn(() => Promise.resolve()),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 9, 1, 12, 0, 0); // 2026-10-01, Asia/Seoul

let mounted = [];

function render(Page = TodayRoadmapCard, props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, null, createElement(Page, { examDate: '2026-10-25', ...props }))));
  mounted.push({ root, container });
  return container;
}

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const byText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const todayTitle = (c) => c.querySelector('.goal-unit-title')?.textContent;

/** 서울 시간 09:00~16:00 (7시간) — 바쁜 날 */
const busyEvent = (date) => ({
  status: 'confirmed',
  start: { dateTime: `${date}T09:00:00+09:00` },
  end: { dateTime: `${date}T16:00:00+09:00` },
});

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  gcal.isGoogleCalendarConfigured.mockReturnValue(true);
  gcal.fetchCalendarEvents.mockReset();
});

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  vi.useRealTimers();
});

describe('Google 캘린더 가져오기', () => {
  it('클라이언트 ID 가 없으면 가져오기 기능을 숨기고 개발자용 설정 문구도 보이지 않는다', () => {
    gcal.isGoogleCalendarConfigured.mockReturnValue(false);
    const c = render();
    expect(byText(c, '캘린더에서 일정 가져오기')).toBeUndefined();
    expect(c.textContent).not.toContain('VITE_GOOGLE_CLIENT_ID');
    // 내보내기(.ics)는 설정과 무관하게 그대로 쓸 수 있다
    expect(byText(c, '.ics')).toBeDefined();
  });

  it('오늘부터 시험 당일 끝까지의 기간으로 조회한다', async () => {
    gcal.fetchCalendarEvents.mockResolvedValue([]);
    const c = render();
    await act(async () => { byText(c, '캘린더에서 일정 가져오기').click(); });
    await flush();

    const [range] = gcal.fetchCalendarEvents.mock.calls[0];
    expect(range.timeMin).toBe(new Date(2026, 9, 1).toISOString());
    expect(range.timeMax).toBe(new Date(2026, 9, 26).toISOString()); // 10/25 다음 날 0시
    expect(c.textContent).toContain('일정이 많은 날이 없습니다');
  });

  it('바쁜 날은 일차를 옮기지 않고 "일정이 많은 날"로 표시하며, 날짜만 저장한다', async () => {
    gcal.fetchCalendarEvents.mockResolvedValue([busyEvent('2026-10-01')]);
    const c = render();
    expect(todayTitle(c)).toBe('C언어 연산자');
    expect(c.querySelector('.goal-unit-phase').textContent).not.toContain('일정이 많은 날');

    await act(async () => { byText(c, '캘린더에서 일정 가져오기').click(); });
    await flush();

    expect(todayTitle(c)).toBe('C언어 연산자'); // 일차는 그대로
    expect(c.querySelector('.goal-unit-phase').textContent).toContain('일정이 많은 날 — 가볍게');
    expect(c.textContent).toContain('일정이 많은 1일을 로드맵에 표시했습니다');
    // 저장은 날짜 목록과 시각뿐 — 일정 내용은 남지 않는다
    const stored = loadProgress('calendar_busy', null);
    expect(stored.busyDates).toEqual(['2026-10-01']);
    expect(Object.keys(stored).sort()).toEqual(['busyDates', 'syncedAt']);
  });

  it('저장된 바쁜 날은 다시 열어도 적용되고, 로드맵 화면에도 표시된다', () => {
    saveProgress('calendar_busy', { busyDates: ['2026-10-01', '2026-10-03'], syncedAt: 1 });
    const card = render();
    expect(card.querySelector('.goal-unit-phase').textContent).toContain('일정이 많은 날');
    expect(byText(card, '가져온 일정 해제')).toBeDefined();

    const page = render(RoadmapPage);
    const badges = [...page.querySelectorAll('.road-day')]
      .filter((el) => el.textContent.includes('일정 많음'))
      .map((el) => el.querySelector('.road-day-d').textContent);
    expect(badges).toEqual(['D-24', 'D-22']);
  });

  it('해제하면 저장이 지워지고 표시가 사라진다', async () => {
    saveProgress('calendar_busy', { busyDates: ['2026-10-01'], syncedAt: 1 });
    const c = render();
    await act(async () => { byText(c, '가져온 일정 해제').click(); });
    expect(c.querySelector('.goal-unit-phase').textContent).not.toContain('일정이 많은 날');
    expect(loadProgress('calendar_busy', null)).toBeNull();
  });

  it('실패하면 서비스가 준 한국어 메시지를 보여주고 기존 표시는 유지한다', async () => {
    gcal.fetchCalendarEvents.mockRejectedValue(new Error('로그인 팝업이 닫혔거나 차단되었습니다.'));
    const c = render();
    await act(async () => { byText(c, '캘린더에서 일정 가져오기').click(); });
    await flush();

    expect(c.textContent).toContain('로그인 팝업이 닫혔거나 차단되었습니다.');
    expect(todayTitle(c)).toBe('C언어 연산자');
    expect(loadProgress('calendar_busy', null)).toBeNull();
  });

  it('버튼에 올리면 로그인 스크립트를 미리 받는다', async () => {
    const c = render();
    await act(async () => {
      byText(c, '캘린더에서 일정 가져오기').dispatchEvent(new Event('focusin', { bubbles: true }));
    });
    expect(gcal.loadGisScript).toHaveBeenCalled();
  });

  it('깨진 저장값이 있어도 카드가 그려진다', () => {
    saveProgress('calendar_busy', { busyDates: 'oops', syncedAt: 'x' });
    const c = render();
    expect(todayTitle(c)).toBe('C언어 연산자');
  });
});
