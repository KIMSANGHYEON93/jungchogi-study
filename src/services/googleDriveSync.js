// Google Drive "앱 전용 폴더"(appDataFolder)로 학습 기록을 기기 사이에 동기화한다.
//
// 왜 이 방식인가:
//  - 서버가 없는 정적 앱이라 기록을 모을 곳이 필요하다. 사용자 본인의 Drive 에 두면 서버·DB·비밀키가 필요 없다.
//  - appDataFolder 는 Drive 화면에 보이지 않는 이 앱 전용 공간이다. 스코프 `drive.appdata` 는
//    이 앱이 만든 파일만 읽고 쓸 수 있어 사용자의 다른 Drive 파일에는 손댈 수 없다.
//  - 액세스 토큰은 함수 지역 변수로만 쓰고 저장하지 않는다(캘린더 연동과 같은 원칙).
//
// 동기화 = "받아서 합치고 → 합친 결과를 올린다". 합치기는 백업 가져오기(utils/backup.js)의 규칙 그대로라
// 같은 파일을 여러 번 합쳐도 결과가 같고(멱등), 어느 기기에서 먼저 눌러도 두 기기를 한 번씩 누르면 같아진다.
// 원격 파일이 깨졌거나 이 앱보다 새 형식이면 **아무것도 쓰지 않고** 멈춘다 — 깨진 파일 위에 덮어쓰거나
// 이 기기 기록을 망가뜨리지 않기 위해서다.

import { CalendarError, loadGisScript, requestAccessToken } from './googleCalendar';
import { MAX_BACKUP_BYTES, applyBackup, buildBackup, parseBackup } from '../utils/backup';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const SYNC_FILE_NAME = 'jungchogi-backup.json';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/** 마지막 동기화 시각 — 기기마다 다른 값이라 백업 대상(`jungchogi_` 접두사)이 아닌 키에 둔다 */
export const LAST_SYNC_KEY = 'jungchogi-drive-synced-at';

export class SyncError extends Error {
  /** @param {'NOT_CONFIGURED'|'SCRIPT_LOAD'|'ACCESS_DENIED'|'POPUP_BLOCKED'|'NETWORK'|'API'|'REMOTE_INVALID'|'LOCAL_WRITE'} code */
  constructor(code, message, options) {
    super(message, options);
    this.name = 'SyncError';
    this.code = code;
  }
}

const MESSAGES = {
  NOT_CONFIGURED: 'Google 연동이 설정되지 않았습니다. (VITE_GOOGLE_CLIENT_ID 필요)',
  SCRIPT_LOAD: 'Google 로그인 스크립트를 불러오지 못했습니다. 네트워크나 광고 차단 설정을 확인해 주세요.',
  ACCESS_DENIED: 'Google Drive 접근이 거부되었습니다. 로그인 창에서 "앱 데이터" 권한을 허용했는지 확인해 주세요.',
  POPUP_BLOCKED: '로그인 팝업이 닫혔거나 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.',
  NETWORK: '네트워크 오류로 동기화하지 못했습니다. 이 기기의 기록은 그대로입니다.',
  API: 'Google Drive 요청에 실패했습니다. Drive API 가 켜져 있는지 확인하고 잠시 후 다시 시도해 주세요. 이 기기의 기록은 그대로입니다.',
  REMOTE_INVALID: 'Drive 에 있는 동기화 파일을 읽을 수 없어(손상 또는 더 새 형식) 멈췄습니다. 이 기기와 Drive 모두 그대로입니다.',
  LOCAL_WRITE: '받은 기록을 이 기기에 저장하지 못했습니다(저장 공간 부족 등). 이 기기의 기록은 원래대로 되돌렸습니다.',
};

const fail = (code, cause) => new SyncError(code, MESSAGES[code], cause ? { cause } : undefined);

async function call(doFetch, url, init) {
  let res;
  try {
    res = await doFetch(url, init);
  } catch (e) {
    throw fail('NETWORK', e);
  }
  if (res.status === 401 || res.status === 403) {
    // 403 은 API 미활성(설정)과 권한 거부가 섞여 있다 — 본문 사유로 가른다
    let reason = '';
    try {
      const body = await res.json();
      reason = `${body?.error?.errors?.[0]?.reason ?? ''} ${body?.error?.status ?? ''}`;
    } catch {
      /* 본문이 없으면 권한 문제로 본다 */
    }
    throw fail(/accessNotConfigured|SERVICE_DISABLED|rateLimit|quota/i.test(reason) ? 'API' : 'ACCESS_DENIED');
  }
  if (!res.ok) throw fail('API');
  return res;
}

/** appDataFolder 안의 동기화 파일(없으면 null) */
async function findRemote(doFetch, auth) {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${SYNC_FILE_NAME}' and trashed = false`,
    fields: 'files(id,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: '1',
  });
  const res = await call(doFetch, `${FILES_URL}?${params}`, { headers: auth });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw fail('API', e);
  }
  return Array.isArray(data?.files) && data.files.length > 0 ? data.files[0] : null;
}

async function upload(doFetch, auth, fileId, text) {
  if (fileId) {
    await call(doFetch, `${UPLOAD_URL}/${encodeURIComponent(fileId)}?uploadType=media`, {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: text,
    });
    return;
  }
  const boundary = `jungchogi-${Date.now()}`;
  const meta = JSON.stringify({ name: SYNC_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
  await call(doFetch, `${UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

/**
 * Drive 와 이 기기의 학습 기록을 합친다.
 * @param {{fetch?: Function, loadScript?: Function, getClientId?: Function, google?: object, storage?: Storage, now?: () => Date}} deps
 * @returns {Promise<{created: boolean, merged: number, skipped: number, syncedAt: string}>}
 *   created: Drive 에 파일이 없어 새로 만들었는지 · merged: 받아서 합친 항목 수
 */
export async function syncWithDrive(deps = {}) {
  const doFetch = deps.fetch ?? ((...args) => globalThis.fetch(...args));
  const loadScript = deps.loadScript ?? loadGisScript;
  const getClientId = deps.getClientId ?? (() => import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const storage = deps.storage ?? globalThis.localStorage;
  const now = deps.now ?? (() => new Date());

  const clientId = getClientId();
  if (typeof clientId !== 'string' || clientId.trim() === '') throw fail('NOT_CONFIGURED');
  try {
    await loadScript();
  } catch (e) {
    throw fail('SCRIPT_LOAD', e);
  }
  const google = deps.google ?? globalThis.window?.google;
  if (!google?.accounts?.oauth2) throw fail('SCRIPT_LOAD');

  let token;
  try {
    token = await requestAccessToken(google, clientId.trim(), DRIVE_SCOPE);
  } catch (e) {
    throw fail(e instanceof CalendarError && e.code === 'POPUP_BLOCKED' ? 'POPUP_BLOCKED' : 'ACCESS_DENIED', e);
  }
  const auth = { Authorization: `Bearer ${token}` };

  // 1) 받기 → 합치기
  const remote = await findRemote(doFetch, auth);
  let merged = 0;
  let skipped = 0;
  if (remote) {
    if (Number(remote.size) > MAX_BACKUP_BYTES) throw fail('REMOTE_INVALID');
    const res = await call(doFetch, `${FILES_URL}/${encodeURIComponent(remote.id)}?alt=media`, { headers: auth });
    let text;
    try {
      text = await res.text();
    } catch (e) {
      throw fail('NETWORK', e);
    }
    const parsed = parseBackup(text);
    // 빈 백업(empty)은 합칠 것이 없을 뿐이다. 그 밖의 실패는 깨진 파일이라 덮어쓰지 않고 멈춘다
    if (!parsed.ok && parsed.reason !== 'empty') throw fail('REMOTE_INVALID');
    if (parsed.ok) {
      const result = applyBackup(parsed, 'merge', storage);
      if (!result.ok) throw fail('LOCAL_WRITE');
      merged = result.written;
      skipped = result.skipped;
    }
  }

  // 2) 합친 결과를 올리기
  await upload(doFetch, auth, remote?.id ?? null, JSON.stringify(buildBackup(storage, now())));

  const syncedAt = now().toISOString();
  try {
    storage.setItem(LAST_SYNC_KEY, syncedAt);
  } catch {
    /* 시각 기록 실패는 동기화 결과에 영향이 없다 */
  }
  return { created: !remote, merged, skipped, syncedAt };
}

/** 마지막 동기화 시각(없으면 null) */
export function lastSyncedAt(storage = globalThis.localStorage) {
  try {
    return storage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}
