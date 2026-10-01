// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALENDAR_SCOPE,
  CalendarError,
  fetchCalendarEvents,
  GIS_SCRIPT_URL,
  isGoogleCalendarConfigured,
  loadGisScript,
  resetGisScriptCache,
} from '../src/services/googleCalendar.js';

const RANGE = { timeMin: '2026-10-01T00:00:00.000Z', timeMax: '2026-11-01T00:00:00.000Z' };
const TOKEN = 'ya29.secret-token';

/** 콜백을 즉시 호출하는 가짜 GIS */
function fakeGoogle({ response = { access_token: TOKEN }, errorType } = {}) {
  const initTokenClient = vi.fn((config) => ({
    requestAccessToken: () => {
      if (errorType) config.error_callback({ type: errorType });
      else config.callback(response);
    },
  }));
  return { accounts: { oauth2: { initTokenClient } } };
}

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function makeDeps(overrides = {}) {
  return {
    fetch: vi.fn(async () => jsonRes({ items: [] })),
    loadScript: vi.fn(async () => {}),
    getClientId: () => 'client-id.apps.googleusercontent.com',
    google: fakeGoogle(),
    ...overrides,
  };
}

const codeOf = async (promise) => {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(CalendarError);
    return e.code;
  }
  return null;
};

beforeEach(() => {
  resetGisScriptCache();
  document.head.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

describe('isGoogleCalendarConfigured', () => {
  it('비어 있지 않은 문자열일 때만 true', () => {
    expect(isGoogleCalendarConfigured({ VITE_GOOGLE_CLIENT_ID: 'abc' })).toBe(true);
    expect(isGoogleCalendarConfigured({ VITE_GOOGLE_CLIENT_ID: '' })).toBe(false);
    expect(isGoogleCalendarConfigured({ VITE_GOOGLE_CLIENT_ID: '   ' })).toBe(false);
    expect(isGoogleCalendarConfigured({})).toBe(false);
  });
});

describe('fetchCalendarEvents', () => {
  it('client ID 가 없으면 NOT_CONFIGURED, 네트워크는 건드리지 않는다', async () => {
    const deps = makeDeps({ getClientId: () => '' });
    expect(await codeOf(fetchCalendarEvents(RANGE, deps))).toBe('NOT_CONFIGURED');
    expect(deps.loadScript).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('여러 페이지를 합친다', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ items: [{ status: 'confirmed' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonRes({ items: [{ status: 'tentative' }, { status: 'confirmed' }] }));
    const events = await fetchCalendarEvents(RANGE, makeDeps({ fetch }));
    expect(events).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get('pageToken')).toBe('p2');
  });

  it('필수 쿼리와 fields 를 보내고 summary 는 요청하지 않는다', async () => {
    const deps = makeDeps();
    await fetchCalendarEvents(RANGE, deps);
    const url = new URL(deps.fetch.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    );
    const q = url.searchParams;
    expect(q.get('singleEvents')).toBe('true');
    expect(q.get('orderBy')).toBe('startTime');
    expect(q.get('maxResults')).toBe('250');
    expect(q.get('timeMin')).toBe(RANGE.timeMin);
    expect(q.get('timeMax')).toBe(RANGE.timeMax);
    expect(q.get('fields')).toBe(
      'nextPageToken,items(status,transparency,start,end,attendees(self,responseStatus))',
    );
    for (const forbidden of ['summary', 'description', 'location', 'email']) {
      expect(q.get('fields')).not.toContain(forbidden);
    }
  });

  it('GIS 에는 최소권한 스코프만 요청한다', async () => {
    const deps = makeDeps();
    await fetchCalendarEvents(RANGE, deps);
    const config = deps.google.accounts.oauth2.initTokenClient.mock.calls[0][0];
    expect(config.scope).toBe(CALENDAR_SCOPE);
    expect(config.scope).toBe('https://www.googleapis.com/auth/calendar.events.readonly');
  });

  it('Authorization Bearer 헤더를 보낸다', async () => {
    const deps = makeDeps();
    await fetchCalendarEvents(RANGE, deps);
    expect(deps.fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('401 은 ACCESS_DENIED', async () => {
    const deps = makeDeps({ fetch: vi.fn(async () => jsonRes({}, 401)) });
    expect(await codeOf(fetchCalendarEvents(RANGE, deps))).toBe('ACCESS_DENIED');
  });

  it('403 은 기본 ACCESS_DENIED, API 미활성이면 API', async () => {
    const denied = makeDeps({ fetch: vi.fn(async () => jsonRes({ error: { errors: [{ reason: 'forbidden' }] } }, 403)) });
    expect(await codeOf(fetchCalendarEvents(RANGE, denied))).toBe('ACCESS_DENIED');
    const disabled = makeDeps({
      fetch: vi.fn(async () => jsonRes({ error: { errors: [{ reason: 'accessNotConfigured' }] } }, 403)),
    });
    expect(await codeOf(fetchCalendarEvents(RANGE, disabled))).toBe('API');
  });

  it('그 외 비정상 응답은 API', async () => {
    const deps = makeDeps({ fetch: vi.fn(async () => jsonRes({}, 500)) });
    expect(await codeOf(fetchCalendarEvents(RANGE, deps))).toBe('API');
  });

  it('fetch 가 reject 되면 NETWORK', async () => {
    const deps = makeDeps({ fetch: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) });
    expect(await codeOf(fetchCalendarEvents(RANGE, deps))).toBe('NETWORK');
  });

  it('GIS 에러 콜백을 코드로 매핑한다', async () => {
    for (const type of ['popup_closed', 'popup_failed_to_open']) {
      const deps = makeDeps({ google: fakeGoogle({ errorType: type }) });
      expect(await codeOf(fetchCalendarEvents(RANGE, deps))).toBe('POPUP_BLOCKED');
    }
    const denied = makeDeps({ google: fakeGoogle({ response: { error: 'access_denied' } }) });
    expect(await codeOf(fetchCalendarEvents(RANGE, denied))).toBe('ACCESS_DENIED');
    expect(denied.fetch).not.toHaveBeenCalled();
  });

  it('스크립트 로드 실패는 SCRIPT_LOAD', async () => {
    const deps = makeDeps({ loadScript: vi.fn(async () => { throw new Error('x'); }) });
    expect(await codeOf(fetchCalendarEvents(RANGE, deps))).toBe('SCRIPT_LOAD');
  });

  it('무한 nextPageToken 이어도 10페이지에서 멈춘다', async () => {
    const fetch = vi.fn(async () => jsonRes({ items: [{ status: 'confirmed' }], nextPageToken: 'again' }));
    const events = await fetchCalendarEvents(RANGE, makeDeps({ fetch }));
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(events).toHaveLength(10);
  });

  it('토큰을 웹 스토리지 어디에도 저장하지 않는다', async () => {
    await fetchCalendarEvents(RANGE, makeDeps());
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain(TOKEN);
  });
});

describe('loadGisScript', () => {
  const scripts = () => document.head.querySelectorAll(`script[src="${GIS_SCRIPT_URL}"]`);

  it('로딩 중·완료 후 모두 같은 Promise 를 재사용하고 script 는 한 번만 넣는다', async () => {
    const first = loadGisScript();
    const second = loadGisScript();
    expect(second).toBe(first);
    expect(scripts()).toHaveLength(1);
    scripts()[0].onload();
    await first;
    expect(loadGisScript()).toBe(first);
    expect(scripts()).toHaveLength(1);
  });

  it('실패하면 캐시를 비워 다시 시도할 수 있다', async () => {
    const first = loadGisScript();
    scripts()[0].onerror();
    await expect(first).rejects.toThrow();
    // catch 핸들러가 캐시를 비우는 마이크로태스크를 기다린다
    await Promise.resolve();
    const retry = loadGisScript();
    expect(retry).not.toBe(first);
    expect(scripts()).toHaveLength(1);
    scripts()[0].onload();
    await expect(retry).resolves.toBeUndefined();
  });
});
