// @vitest-environment jsdom
//
// 대시보드 목표 카드의 Google 캘린더 가져오기 흐름. 서비스(네트워크·GIS)는 목킹하고,
// 가져온 일정이 플랜과 저장소에 어떻게 반영되는지를 본다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DailyGoalCard from '../src/components/DailyGoalCard.jsx';
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

function render(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(DailyGoalCard, { examDate: '2026-10-25', dayChecks: {}, onToggleDay: () => {}, ...props })
      )
    )
  );
  mounted.push({ root, container });
  return container;
}

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const byText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const todayUnits = (c) => [...c.querySelectorAll('a.goal-unit-title')].map((a) => a.textContent);

/** 서울 시간 2026-10-01 09:00~16:00 (7시간) — 바쁜 날 */
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
  it('클라이언트 ID 가 없으면 버튼이 꺼지고 설정 안내를 보여준다', () => {
    gcal.isGoogleCalendarConfigured.mockReturnValue(false);
    const c = render();
    expect(byText(c, '캘린더에서 일정 가져오기').disabled).toBe(true);
    expect(c.textContent).toContain('VITE_GOOGLE_CLIENT_ID');
  });

  it('오늘부터 시험 당일 끝까지의 기간으로 조회한다', async () => {
    gcal.fetchCalendarEvents.mockResolvedValue([]);
    const c = render();
    await act(async () => { byText(c, '캘린더에서 일정 가져오기').click(); });
    await flush();

    const [range] = gcal.fetchCalendarEvents.mock.calls[0];
    expect(range.timeMin).toBe(new Date(2026, 9, 1).toISOString());
    expect(range.timeMax).toBe(new Date(2026, 9, 26).toISOString()); // 10/25 다음 날 0시
    expect(c.textContent).toContain('일정이 많은 날이 없어');
  });

  it('바쁜 날을 피해 오늘 몫이 다음 날로 밀리고, 날짜만 저장한다', async () => {
    gcal.fetchCalendarEvents.mockResolvedValue([busyEvent('2026-10-01')]);
    const c = render();
    expect(todayUnits(c)).toEqual(['Day01 · C언어']);

    await act(async () => { byText(c, '캘린더에서 일정 가져오기').click(); });
    await flush();

    expect(todayUnits(c)).toEqual([]); // 오늘은 일정이 많아 새 Day 가 없다
    expect(c.querySelector('.goal-review').textContent).toContain('일정이 많아');
    expect(c.textContent).toContain('일정이 많은 1일을 피해');
    // 저장은 날짜 목록과 시각뿐 — 일정 내용은 남지 않는다
    const stored = loadProgress('calendar_busy', null);
    expect(stored.busyDates).toEqual(['2026-10-01']);
    expect(Object.keys(stored).sort()).toEqual(['busyDates', 'syncedAt']);
  });

  it('저장된 바쁜 날은 다시 열어도 적용된다', () => {
    saveProgress('calendar_busy', { busyDates: ['2026-10-01'], syncedAt: 1 });
    const c = render();
    expect(todayUnits(c)).toEqual([]);
    expect(byText(c, '가져온 일정 해제')).toBeDefined();
  });

  it('해제하면 저장이 지워지고 원래 일정으로 돌아온다', async () => {
    saveProgress('calendar_busy', { busyDates: ['2026-10-01'], syncedAt: 1 });
    const c = render();
    await act(async () => { byText(c, '가져온 일정 해제').click(); });
    expect(todayUnits(c)).toEqual(['Day01 · C언어']);
    expect(loadProgress('calendar_busy', null)).toBeNull();
  });

  it('실패하면 서비스가 준 한국어 메시지를 보여주고 기존 일정은 유지한다', async () => {
    gcal.fetchCalendarEvents.mockRejectedValue(new Error('로그인 팝업이 닫혔거나 차단되었습니다.'));
    const c = render();
    await act(async () => { byText(c, '캘린더에서 일정 가져오기').click(); });
    await flush();

    expect(c.textContent).toContain('로그인 팝업이 닫혔거나 차단되었습니다.');
    expect(todayUnits(c)).toEqual(['Day01 · C언어']);
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
    expect(todayUnits(c)).toEqual(['Day01 · C언어']);
  });
});
