// 로그인한 사용자의 Google 캘린더 일정을 읽어 온다. 용도는 "어느 날이 바쁜가" 계산 하나뿐이다.
//
// 왜 GIS 토큰 모델인가:
//  - 이 앱은 서버 없는 정적 SPA 라 클라이언트 비밀키를 숨길 곳이 없다.
//    토큰 모델(`initTokenClient`)은 공개 client ID 만으로 브라우저에서 액세스 토큰을 받는다.
//  - 리프레시 토큰이 없으므로 토큰이 유출돼도 약 1시간 뒤 만료된다.
//
// 개인정보 최소화:
//  - 스코프는 읽기 전용 `calendar.events.readonly` 하나.
//  - `fields` 로 상태·시간·참석 응답만 요청한다. 제목·설명·장소·참석자 이메일은
//    아예 응답에 실리지 않으므로 앱이 실수로 저장하거나 로그에 남길 수도 없다.
//  - 액세스 토큰은 함수 지역 변수로만 쓰고 어디에도(localStorage 포함) 저장하지 않는다.

export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
export const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

const EVENT_FIELDS = 'nextPageToken,items(status,transparency,start,end,attendees(self,responseStatus))';
const PAGE_SIZE = 250;

/** 무한 nextPageToken 같은 이상 응답에서 요청이 끝없이 이어지는 것을 막는 가드 */
const MAX_PAGES = 10;

export class CalendarError extends Error {
  /** @param {'NOT_CONFIGURED'|'SCRIPT_LOAD'|'ACCESS_DENIED'|'POPUP_BLOCKED'|'NETWORK'|'API'} code */
  constructor(code, message, options) {
    super(message, options);
    this.name = 'CalendarError';
    this.code = code;
  }
}

const MESSAGES = {
  NOT_CONFIGURED: 'Google 캘린더 연동이 설정되지 않았습니다. (VITE_GOOGLE_CLIENT_ID 필요)',
  SCRIPT_LOAD: 'Google 로그인 스크립트를 불러오지 못했습니다. 네트워크나 광고 차단 설정을 확인해 주세요.',
  ACCESS_DENIED: 'Google 캘린더 접근이 거부되었습니다. 권한을 허용했는지 확인해 주세요.',
  POPUP_BLOCKED: '로그인 팝업이 닫혔거나 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.',
  NETWORK: '네트워크 오류로 Google 캘린더를 불러오지 못했습니다.',
  API: 'Google 캘린더 API 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',
};

const fail = (code, cause) => new CalendarError(code, MESSAGES[code], cause ? { cause } : undefined);

/** `VITE_GOOGLE_CLIENT_ID` 가 비어 있지 않은 문자열이면 연동 가능 */
export function isGoogleCalendarConfigured(env = import.meta.env) {
  const id = env?.VITE_GOOGLE_CLIENT_ID;
  return typeof id === 'string' && id.trim() !== '';
}

// ── GIS 스크립트 로더 ──────────────────────────────────────────────────

let scriptPromise = null;

/** 테스트에서 모듈 캐시를 초기화하기 위한 용도 */
export function resetGisScriptCache() {
  scriptPromise = null;
}

/**
 * GIS 스크립트를 한 번만 로드한다. 로딩 중·완료 후 재호출은 같은 Promise 를 돌려준다.
 * 실패하면 캐시를 비워, 사용자가 네트워크를 고친 뒤 다시 눌렀을 때 재시도가 가능하다.
 */
export function loadGisScript(doc = document) {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error('GIS script load failed'));
    };
    doc.head.appendChild(script);
  });
  // 실패한 Promise 가 캐시에 남으면 영영 재시도할 수 없다
  scriptPromise.catch(() => {
    scriptPromise = null;
  });
  return scriptPromise;
}

// ── 토큰 요청 ─────────────────────────────────────────────────────────

const POPUP_ERRORS = new Set(['popup_closed', 'popup_failed_to_open']);

function mapTokenError(type) {
  if (POPUP_ERRORS.has(type)) return fail('POPUP_BLOCKED');
  // access_denied 외 알 수 없는 오류도 사용자 입장에서는 "권한을 못 받음" 이다
  return fail('ACCESS_DENIED');
}

/** 사용자 클릭 직후 호출해야 브라우저가 팝업을 막지 않는다 */
function requestAccessToken(google, clientId) {
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: CALENDAR_SCOPE,
        callback: (resp) => {
          if (!resp || resp.error || !resp.access_token) {
            reject(mapTokenError(resp?.error));
          } else {
            resolve(resp.access_token);
          }
        },
        // 팝업이 닫히거나 열리지 못한 경우는 callback 이 아니라 여기로 온다
        error_callback: (err) => reject(mapTokenError(err?.type)),
      });
      client.requestAccessToken();
    } catch (e) {
      reject(fail('ACCESS_DENIED', e));
    }
  });
}

// ── Calendar API ──────────────────────────────────────────────────────

/** 403 은 권한 문제와 API 미활성(설정 문제)이 섞여 있어 응답 사유로 구분한다 */
async function classifyHttpError(res) {
  if (res.status === 401) return fail('ACCESS_DENIED');
  if (res.status === 403) {
    let reason = '';
    try {
      const body = await res.json();
      reason = `${body?.error?.errors?.[0]?.reason ?? ''} ${body?.error?.status ?? ''}`;
    } catch {
      // 본문을 읽을 수 없으면 일반 접근 거부로 취급한다
    }
    if (/accessNotConfigured|SERVICE_DISABLED|rateLimitExceeded|quotaExceeded|dailyLimitExceeded/i.test(reason)) {
      return fail('API');
    }
    return fail('ACCESS_DENIED');
  }
  return fail('API');
}

function buildUrl({ timeMin, timeMax }, pageToken) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(PAGE_SIZE),
    timeMin,
    timeMax,
    fields: EVENT_FIELDS,
  });
  if (pageToken) params.set('pageToken', pageToken);
  return `${EVENTS_URL}?${params.toString()}`;
}

/**
 * 기간 내 일정을 가져온다.
 * @param {{ timeMin: string, timeMax: string }} range ISO 문자열
 * @param {{ fetch?: Function, loadScript?: Function, getClientId?: Function, google?: object }} deps
 */
export async function fetchCalendarEvents({ timeMin, timeMax }, deps = {}) {
  const doFetch = deps.fetch ?? ((...args) => globalThis.fetch(...args));
  const loadScript = deps.loadScript ?? loadGisScript;
  const getClientId = deps.getClientId ?? (() => import.meta.env.VITE_GOOGLE_CLIENT_ID);

  const clientId = getClientId();
  if (typeof clientId !== 'string' || clientId.trim() === '') throw fail('NOT_CONFIGURED');

  try {
    await loadScript();
  } catch (e) {
    throw fail('SCRIPT_LOAD', e);
  }

  // 로드 후에 읽어야 window.google 이 채워져 있다
  const google = deps.google ?? globalThis.window?.google;
  if (!google?.accounts?.oauth2) throw fail('SCRIPT_LOAD');

  const token = await requestAccessToken(google, clientId.trim());

  const events = [];
  let pageToken;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let res;
    try {
      res = await doFetch(buildUrl({ timeMin, timeMax }, pageToken), {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      throw fail('NETWORK', e);
    }
    if (!res.ok) throw await classifyHttpError(res);

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw fail('API', e);
    }
    if (Array.isArray(data?.items)) events.push(...data.items);

    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}
