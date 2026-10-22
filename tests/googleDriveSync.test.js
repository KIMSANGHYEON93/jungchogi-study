// @vitest-environment jsdom
//
// Google Drive 앱 폴더 동기화 — 받아서 합치고, 합친 결과를 올린다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_SCOPE, LAST_SYNC_KEY, SYNC_FILE_NAME, SyncError, syncWithDrive } from '../src/services/googleDriveSync.js';
import { buildBackup } from '../src/utils/backup.js';

const TOKEN = 'ya29.secret-token';

function fakeGoogle({ errorType } = {}) {
  const initTokenClient = vi.fn((config) => ({
    requestAccessToken: () => (errorType ? config.error_callback({ type: errorType }) : config.callback({ access_token: TOKEN })),
  }));
  return { accounts: { oauth2: { initTokenClient } } };
}

/** 가짜 Drive — appDataFolder 에 파일 하나를 들고 있는 메모리 저장소 */
function fakeDrive(initialText = null) {
  const state = { file: initialText === null ? null : { id: 'f1', text: initialText }, calls: [] };
  const res = (body, status = 200, text) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text ?? JSON.stringify(body),
  });
  const fetch = vi.fn(async (url, init = {}) => {
    state.calls.push({ url, method: init.method ?? 'GET', auth: init.headers?.Authorization, body: init.body });
    if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      return res({ files: state.file ? [{ id: state.file.id, size: String(state.file.text.length) }] : [] });
    }
    if (url.includes('?alt=media')) return res(null, 200, state.file.text);
    if (url.includes('uploadType=media') && init.method === 'PATCH') {
      state.file.text = init.body;
      return res({ id: state.file.id });
    }
    if (url.includes('uploadType=multipart')) {
      const m = /\r\n\r\n(\{"schema"[\s\S]*)\r\n--/.exec(init.body);
      state.file = { id: 'new', text: m[1] };
      return res({ id: 'new' });
    }
    return res({}, 404);
  });
  return { state, fetch };
}

const deps = (drive, extra = {}) => ({
  fetch: drive.fetch,
  loadScript: async () => {},
  getClientId: () => 'client-id.apps.googleusercontent.com',
  google: fakeGoogle(),
  storage: localStorage,
  now: () => new Date('2026-10-22T09:00:00Z'),
  ...extra,
});

/** 다른 기기에서 만든 백업 파일 내용 */
function otherDeviceBackup(entries) {
  const data = Object.fromEntries(Object.entries(entries).map(([k, v]) => [`jungchogi_${k}`, JSON.stringify(v)]));
  return JSON.stringify({ schema: 1, exportedAt: '2026-10-21T00:00:00Z', data });
}

beforeEach(() => localStorage.clear());

describe('syncWithDrive', () => {
  it('Drive 에 파일이 없으면 이 기기 기록으로 앱 폴더에 새로 만든다 (drive.appdata 스코프만 요청)', async () => {
    localStorage.setItem('jungchogi_quiz_results', JSON.stringify({ 'C-01': 'correct' }));
    const drive = fakeDrive();
    const google = fakeGoogle();
    const r = await syncWithDrive(deps(drive, { google }));
    expect(r).toMatchObject({ created: true, merged: 0 });
    expect(google.accounts.oauth2.initTokenClient.mock.calls[0][0].scope).toBe(DRIVE_SCOPE);
    const upload = drive.state.calls.find((c) => c.url.includes('uploadType=multipart'));
    expect(upload.body).toContain('"parents":["appDataFolder"]');
    expect(upload.body).toContain(SYNC_FILE_NAME);
    expect(JSON.parse(drive.state.file.text).data.jungchogi_quiz_results).toBe(JSON.stringify({ 'C-01': 'correct' }));
  });

  it('폰과 PC: 각 기기에서 한 번씩 누르면 두 기기의 퀴즈 결과가 같아진다', async () => {
    // 폰에서 C-01 을 풀고 동기화
    localStorage.setItem('jungchogi_quiz_results', JSON.stringify({ 'C-01': 'correct' }));
    const drive = fakeDrive();
    await syncWithDrive(deps(drive));
    const phone = buildBackup(localStorage);

    // PC 는 J-01 만 풀었다 → 동기화하면 Drive 의 C-01 이 합쳐진다
    localStorage.clear();
    localStorage.setItem('jungchogi_quiz_results', JSON.stringify({ 'J-01': 'incorrect' }));
    const r = await syncWithDrive(deps(drive));
    expect(r.created).toBe(false);
    expect(JSON.parse(localStorage.getItem('jungchogi_quiz_results'))).toEqual({ 'C-01': 'correct', 'J-01': 'incorrect' });
    expect(drive.state.calls.some((c) => c.method === 'PATCH')).toBe(true);

    // 폰이 다시 동기화하면 J-01 도 받는다
    localStorage.clear();
    for (const [k, v] of Object.entries(phone.data)) localStorage.setItem(k, v);
    await syncWithDrive(deps(drive));
    expect(JSON.parse(localStorage.getItem('jungchogi_quiz_results'))).toEqual({ 'C-01': 'correct', 'J-01': 'incorrect' });
  });

  it('같은 기록을 여러 번 동기화해도 결과가 같다 (오답노트가 불어나지 않는다)', async () => {
    const note = { source: 'quiz', id: 'C-01', reviewCount: 1, addedAt: 5 };
    localStorage.setItem('jungchogi_wrong_notes', JSON.stringify([note]));
    const drive = fakeDrive(otherDeviceBackup({ wrong_notes: [note] }));
    await syncWithDrive(deps(drive));
    await syncWithDrive(deps(drive));
    expect(JSON.parse(localStorage.getItem('jungchogi_wrong_notes'))).toHaveLength(1);
  });

  it('Drive 파일이 깨졌으면 이 기기도 Drive 도 건드리지 않고 멈춘다', async () => {
    localStorage.setItem('jungchogi_quiz_results', JSON.stringify({ 'C-01': 'correct' }));
    const drive = fakeDrive('{ broken');
    await expect(syncWithDrive(deps(drive))).rejects.toMatchObject({ code: 'REMOTE_INVALID' });
    expect(drive.state.file.text).toBe('{ broken');
    expect(drive.state.calls.some((c) => c.method === 'PATCH' || c.method === 'POST')).toBe(false);
    expect(JSON.parse(localStorage.getItem('jungchogi_quiz_results'))).toEqual({ 'C-01': 'correct' });
  });

  it('토큰은 요청 헤더에만 쓰고 저장하지 않는다 · 마지막 동기화 시각은 백업 대상이 아닌 키에 둔다', async () => {
    const drive = fakeDrive();
    await syncWithDrive(deps(drive));
    expect(drive.state.calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
    for (let i = 0; i < localStorage.length; i++) expect(localStorage.getItem(localStorage.key(i))).not.toContain(TOKEN);
    expect(localStorage.getItem(LAST_SYNC_KEY)).toBe('2026-10-22T09:00:00.000Z');
    expect(buildBackup(localStorage).data[LAST_SYNC_KEY]).toBeUndefined();
  });

  it('설정 없음 · 팝업 차단 · 권한 거부 · API 미활성을 구분한다', async () => {
    const drive = fakeDrive();
    await expect(syncWithDrive(deps(drive, { getClientId: () => '' }))).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await expect(syncWithDrive(deps(drive, { google: fakeGoogle({ errorType: 'popup_closed' }) }))).rejects.toMatchObject({ code: 'POPUP_BLOCKED' });
    const denied = { ...drive, fetch: vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'insufficientPermissions' }] } }) })) };
    await expect(syncWithDrive(deps(denied))).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    const disabled = { ...drive, fetch: vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'accessNotConfigured' }] } }) })) };
    const err = await syncWithDrive(deps(disabled)).catch((e) => e);
    expect(err).toBeInstanceOf(SyncError);
    expect(err.code).toBe('API');
  });
});
