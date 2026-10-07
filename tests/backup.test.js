// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BACKUP_SCHEMA, applyBackup, buildBackup, failureMessage, isValidValue, mergeValue, parseBackup, successMessage,
} from '../src/utils/backup.js';

/** setItem 을 n 번째 호출부터 던지게 할 수 있는 메모리 저장소 */
class FakeStorage {
  constructor(initial = {}, { failAfter = Infinity, errorName = 'QuotaExceededError' } = {}) {
    this.map = new Map(Object.entries(initial));
    this.calls = 0;
    this.failAfter = failAfter;
    this.errorName = errorName;
  }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    this.calls += 1;
    // 지정한 호출 번호 하나만 실패한다 — 되돌리기(setItem)는 성공해야 되돌렸는지 볼 수 있다
    if (this.calls === this.failAfter + 1) throw Object.assign(new Error('boom'), { name: this.errorName });
    this.map.set(k, String(v));
  }
  removeItem(k) { this.map.delete(k); }
}

const J = JSON.stringify;
const envelope = (data, schema = 1) => J({ schema, exportedAt: '2026-10-02T00:00:00.000Z', data });
const raw = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [`jungchogi_${k}`, J(v)]));

describe('parseBackup', () => {
  it('새 형식(schema 1)을 읽어 키 접두사를 떼고 값을 파싱한다', () => {
    const r = parseBackup(envelope(raw({ roadmap_checks: { 24: true }, exam_date: '2026-10-25' })));
    expect(r).toMatchObject({ ok: true, schema: 1, legacy: false, skipped: [] });
    expect(r.items).toEqual({ roadmap_checks: { 24: true }, exam_date: '2026-10-25' });
  });

  it('옛 형식(평면 객체)도 읽는다', () => {
    const r = parseBackup(J(raw({ bookmarks: { 'lesson:a': 5 } })));
    expect(r).toMatchObject({ ok: true, legacy: true });
    expect(r.items).toEqual({ bookmarks: { 'lesson:a': 5 } });
  });

  it('JSON 이 아니면 json, 객체가 아니거나 envelope 구조가 틀리면 shape', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, reason: 'json' });
    expect(parseBackup('[1]')).toEqual({ ok: false, reason: 'shape' });
    expect(parseBackup('"x"')).toEqual({ ok: false, reason: 'shape' });
    expect(parseBackup(J({ schema: 1 }))).toEqual({ ok: false, reason: 'shape' });
    expect(parseBackup(J({ schema: 'x', data: {} }))).toEqual({ ok: false, reason: 'shape' });
  });

  it('더 새 버전의 백업은 거절한다', () => {
    expect(parseBackup(envelope(raw({ exam_date: '2026-10-25' }), BACKUP_SCHEMA + 1))).toEqual({ ok: false, reason: 'schema' });
  });

  it('모양이 틀린 키·JSON 이 아닌 값·접두사 없는 키는 건너뛰고 나머지는 읽는다', () => {
    const data = {
      ...raw({ roadmap_checks: { 24: true } }),
      jungchogi_quiz_results: J(['x']), // 맵이어야 한다
      jungchogi_study_time: '{oops', // JSON 아님
      jungchogi_bookmarks: 5, // 문자열이 아님
      'jungchogi-theme': J('dark'), // 접두사가 다르다(테마는 백업 대상이 아니다)
      other: J(1),
    };
    const r = parseBackup(envelope(data));
    expect(r.ok).toBe(true);
    expect(Object.keys(r.items)).toEqual(['roadmap_checks']);
    expect(r.skipped.map((s) => `${s.key}:${s.reason}`).sort()).toEqual([
      'bookmarks:shape', 'jungchogi-theme:foreign', 'other:foreign', 'quiz_results:shape', 'study_time:json',
    ]);
  });

  it('읽을 수 있는 키가 하나도 없으면 empty', () => {
    expect(parseBackup(envelope({}))).toEqual({ ok: false, reason: 'empty' });
    expect(parseBackup(envelope({ jungchogi_quiz_results: J([]) }))).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('isValidValue', () => {
  it('키별로 기대하는 모양만 통과시킨다', () => {
    expect(isValidValue('roadmap_checks', { 24: true, 23: false })).toBe(true);
    expect(isValidValue('roadmap_checks', { 24: 1 })).toBe(false);
    expect(isValidValue('flashcard_known_quiz100', [])).toBe(false);
    expect(isValidValue('quiz_results', { 'C-01': 'correct' })).toBe(true);
    expect(isValidValue('exam_results', { 1: 3 })).toBe(false);
    expect(isValidValue('bookmarks', { 'lesson:a': 0, 'doc:b': true })).toBe(true);
    expect(isValidValue('bookmarks', { 'lesson:a': -1 })).toBe(false);
    expect(isValidValue('study_time', { '2026-10-01': 30 })).toBe(true);
    expect(isValidValue('study_time', { '2026-10-01': 'x' })).toBe(false);
    expect(isValidValue('wrong_notes', [{ source: 'quiz', id: 'C-01' }])).toBe(true);
    expect(isValidValue('wrong_notes', [{ source: 'quiz' }])).toBe(false);
    expect(isValidValue('wrong_notes', [null])).toBe(false);
    expect(isValidValue('calendar_busy', { busyDates: ['2026-10-01'], syncedAt: 1 })).toBe(true);
    expect(isValidValue('calendar_busy', { busyDates: 'x' })).toBe(false);
    expect(isValidValue('exam_date', '2026-10-25')).toBe(true);
    expect(isValidValue('exam_date', '10/25')).toBe(false);
    expect(isValidValue('unknown_key', { anything: [1] })).toBe(true);
  });
});

describe('mergeValue', () => {
  it('현재 값이 없으면 들어온 값을 그대로 쓴다', () => {
    expect(mergeValue('roadmap_checks', undefined, { 1: true })).toEqual({ 1: true });
  });

  it('완료·외움: 어느 한쪽이라도 true 면 true (합집합)', () => {
    expect(mergeValue('roadmap_checks', { 24: true, 23: false }, { 23: true, 22: false })).toEqual({ 24: true, 23: true, 22: false });
    expect(mergeValue('flashcard_known_quiz100', { '001': true }, { '001': false, '002': true })).toEqual({ '001': true, '002': true });
  });

  it('퀴즈·모의고사 결과: 채점된 결과를 우선하고, 같은 수준이면 이 기기의 기록을 지킨다', () => {
    const cur = { a: 'answered', b: 'correct', c: 'incorrect' };
    const inc = { a: 'incorrect', b: 'incorrect', c: 'correct', d: 'answered' };
    expect(mergeValue('quiz_results', cur, inc)).toEqual({ a: 'incorrect', b: 'correct', c: 'incorrect', d: 'answered' });
  });

  it('북마크: 합집합이고 같은 항목은 더 최근 시각을 쓴다', () => {
    expect(mergeValue('bookmarks', { 'doc:a': 5, 'doc:b': 9 }, { 'doc:a': 7, 'lesson:c': true })).toEqual({
      'doc:a': 7, 'doc:b': 9, 'lesson:c': 0,
    });
  });

  it('학습 시간: 날짜별로 큰 값 (같은 파일을 두 번 가져와도 두 배가 되지 않는다)', () => {
    const once = mergeValue('study_time', { d1: 30, d2: 10 }, { d1: 20, d3: 5 });
    expect(once).toEqual({ d1: 30, d2: 10, d3: 5 });
    expect(mergeValue('study_time', once, { d1: 20, d3: 5 })).toEqual(once);
  });

  it('오답노트: source+id 로 합치고 복습을 더 많이 한 기록·숙달을 살린다', () => {
    const cur = [{ source: 'quiz', id: 'C-01', reviewCount: 1, addedAt: 1, mastered: false }, { source: 'exam', id: '1', reviewCount: 0, addedAt: 1 }];
    const inc = [
      { source: 'quiz', id: 'C-01', reviewCount: 3, addedAt: 2, mastered: true, userAnswer: 'x' },
      { source: 'quiz', id: 'J-01', reviewCount: 0, addedAt: 3 },
    ];
    const out = mergeValue('wrong_notes', cur, inc);
    expect(out).toHaveLength(3);
    expect(out.find((n) => n.id === 'C-01')).toMatchObject({ reviewCount: 3, mastered: true, userAnswer: 'x' });
    expect('mastered' in out.find((n) => n.id === 'J-01')).toBe(false); // 없던 키를 만들지 않는다
    expect(out.find((n) => n.id === '1').source).toBe('exam');
    expect(out.find((n) => n.id === 'J-01')).toBeTruthy();
  });

  it('오답노트: 복습 횟수가 같으면 더 늦게 추가한 쪽을, 어느 한쪽이 숙달이면 숙달을 유지한다', () => {
    const out = mergeValue(
      'wrong_notes',
      [{ source: 'quiz', id: 'x', reviewCount: 2, addedAt: 1, mastered: true, title: 'old' }],
      [{ source: 'quiz', id: 'x', reviewCount: 2, addedAt: 9, mastered: false, title: 'new' }]
    );
    expect(out).toEqual([{ source: 'quiz', id: 'x', reviewCount: 2, addedAt: 9, mastered: true, title: 'new' }]);
  });

  it('바쁜 날: 날짜 합집합과 더 최근 가져온 시각', () => {
    expect(mergeValue('calendar_busy', { busyDates: ['2026-10-03'], syncedAt: 5 }, { busyDates: ['2026-10-01', '2026-10-03'], syncedAt: 9 })).toEqual({
      busyDates: ['2026-10-01', '2026-10-03'], syncedAt: 9,
    });
  });

  it('실기 연습 결과: 탭별로 합치고, 어느 한쪽에서라도 완료했으면 완료', () => {
    const current = { trace: { 'C-01': 'wrong', 'C-02': 'done' }, sql: { Q1: 'wrong' } };
    const incoming = { trace: { 'C-01': 'done', 'C-02': 'wrong', 'C-03': 'wrong' }, short: { S1: 'done' } };
    const merged = mergeValue('practice_done', current, incoming);
    expect(merged).toEqual({
      trace: { 'C-01': 'done', 'C-02': 'done', 'C-03': 'wrong' },
      sql: { Q1: 'wrong' },
      short: { S1: 'done' },
    });
    expect(mergeValue('practice_done', merged, incoming)).toEqual(merged);
    expect(isValidValue('practice_done', merged)).toBe(true);
    expect(isValidValue('practice_done', { trace: { 'C-01': true } })).toBe(false);
    expect(isValidValue('practice_done', { trace: [] })).toBe(false);
  });

  it('시험일 같은 설정과 모르는 키는 이 기기의 값을 지킨다', () => {
    expect(mergeValue('exam_date', '2026-10-25', '2026-11-01')).toBe('2026-10-25');
    expect(mergeValue('weird', { a: 1 }, { b: 2 })).toEqual({ a: 1 });
  });
});

describe('applyBackup', () => {
  it('합치기: 이 기기의 기록을 지우지 않고 백업과 합친다', () => {
    const storage = new FakeStorage({
      ...raw({ roadmap_checks: { 24: true }, bookmarks: { 'doc:a': 5 }, exam_date: '2026-10-25' }),
      'jungchogi-theme': '"dark"',
    });
    const parsed = parseBackup(envelope(raw({ roadmap_checks: { 23: true }, bookmarks: { 'lesson:b': 9 }, exam_date: '2026-12-01', quiz_results: { 'C-01': 'correct' } })));
    expect(applyBackup(parsed, 'merge', storage)).toEqual({ ok: true, written: 4, skipped: 0 });
    expect(JSON.parse(storage.getItem('jungchogi_roadmap_checks'))).toEqual({ 23: true, 24: true });
    expect(JSON.parse(storage.getItem('jungchogi_bookmarks'))).toEqual({ 'doc:a': 5, 'lesson:b': 9 });
    expect(JSON.parse(storage.getItem('jungchogi_exam_date'))).toBe('2026-10-25'); // 설정은 이 기기 값
    expect(JSON.parse(storage.getItem('jungchogi_quiz_results'))).toEqual({ 'C-01': 'correct' });
    expect(storage.getItem('jungchogi-theme')).toBe('"dark"'); // 테마는 건드리지 않는다
  });

  it('같은 백업을 두 번 합쳐도 결과가 같다 (멱등)', () => {
    const storage = new FakeStorage(raw({ study_time: { d1: 30 }, wrong_notes: [{ source: 'quiz', id: 'a', reviewCount: 1 }] }));
    const parsed = parseBackup(envelope(raw({ study_time: { d1: 20, d2: 5 }, wrong_notes: [{ source: 'quiz', id: 'a', reviewCount: 2 }, { source: 'quiz', id: 'b' }], roadmap_checks: { 24: true } })));
    applyBackup(parsed, 'merge', storage);
    const first = JSON.stringify([...storage.map]);
    applyBackup(parsed, 'merge', storage);
    expect(JSON.stringify([...storage.map])).toBe(first);
  });

  it('덮어쓰기: 백업에 있는 키는 백업 값으로, 없는 키는 그대로 둔다', () => {
    const storage = new FakeStorage(raw({ roadmap_checks: { 24: true }, study_time: { d1: 30 } }));
    const parsed = parseBackup(envelope(raw({ roadmap_checks: { 23: true } })));
    expect(applyBackup(parsed, 'replace', storage).ok).toBe(true);
    expect(JSON.parse(storage.getItem('jungchogi_roadmap_checks'))).toEqual({ 23: true });
    expect(JSON.parse(storage.getItem('jungchogi_study_time'))).toEqual({ d1: 30 });
  });

  it('쓰다가 용량 초과가 나면 이미 쓴 키까지 모두 원래대로 되돌린다', () => {
    const initial = raw({ roadmap_checks: { 24: true }, bookmarks: { 'doc:a': 5 } });
    const storage = new FakeStorage(initial, { failAfter: 2 });
    const parsed = parseBackup(envelope(raw({ roadmap_checks: { 23: true }, bookmarks: { 'doc:b': 1 }, quiz_results: { x: 'correct' }, study_time: { d: 1 } })));
    expect(applyBackup(parsed, 'merge', storage)).toEqual({ ok: false, reason: 'quota' });
    expect(Object.fromEntries(storage.map)).toEqual(initial); // 새로 만든 키도 없다
  });

  it('용량 초과가 아닌 저장 오류는 error 로 알리고 되돌린다', () => {
    const initial = raw({ roadmap_checks: { 24: true } });
    const storage = new FakeStorage(initial, { failAfter: 1, errorName: 'SecurityError' });
    const parsed = parseBackup(envelope(raw({ roadmap_checks: { 23: true }, quiz_results: { x: 'correct' } })));
    expect(applyBackup(parsed, 'merge', storage)).toEqual({ ok: false, reason: 'error' });
    expect(Object.fromEntries(storage.map)).toEqual(initial);
  });

  it('이 기기의 값이 깨져 있으면 백업 값을 쓰되, 오답노트는 쓸 수 있는 항목을 살린다', () => {
    const storage = new FakeStorage({
      jungchogi_roadmap_checks: '{oops',
      jungchogi_wrong_notes: J([{ source: 'quiz', id: 'keep' }, null, { id: 'no-source' }]),
    });
    const parsed = parseBackup(envelope(raw({ roadmap_checks: { 24: true }, wrong_notes: [{ source: 'exam', id: '7' }] })));
    expect(applyBackup(parsed, 'merge', storage).ok).toBe(true);
    expect(JSON.parse(storage.getItem('jungchogi_roadmap_checks'))).toEqual({ 24: true });
    expect(JSON.parse(storage.getItem('jungchogi_wrong_notes')).map((n) => n.id)).toEqual(['keep', '7']);
  });

  it('건너뛴 항목 수를 결과에 싣는다', () => {
    const storage = new FakeStorage();
    const parsed = parseBackup(envelope({ ...raw({ roadmap_checks: { 24: true } }), jungchogi_quiz_results: J([1]) }));
    expect(applyBackup(parsed, 'merge', storage)).toEqual({ ok: true, written: 1, skipped: 1 });
  });
});

describe('buildBackup', () => {
  beforeEach(() => localStorage.clear());

  it('jungchogi_ 키만 담고 테마·남의 키는 담지 않으며 원본 문자열 그대로다', () => {
    localStorage.setItem('jungchogi_roadmap_checks', '{"24":true}');
    localStorage.setItem('jungchogi_bookmarks', '{"doc:a":5}');
    localStorage.setItem('jungchogi-theme', 'dark');
    localStorage.setItem('other', 'x');
    const b = buildBackup(localStorage, new Date('2026-10-02T03:04:05.000Z'));
    expect(b).toEqual({
      schema: 1,
      exportedAt: '2026-10-02T03:04:05.000Z',
      data: { jungchogi_roadmap_checks: '{"24":true}', jungchogi_bookmarks: '{"doc:a":5}' },
    });
  });

  it('내보낸 파일을 다른 기기에서 합치면 두 기기의 기록이 모두 남는다 (폰 ↔ PC)', () => {
    const phone = new FakeStorage(raw({ roadmap_checks: { 24: true }, bookmarks: { 'doc:a': 5 }, study_time: { d1: 20 } }));
    const pc = new FakeStorage(raw({ roadmap_checks: { 23: true }, bookmarks: { 'lesson:b': 9 }, study_time: { d1: 30, d2: 10 } }));
    const file = J(buildBackup(phone));
    const parsed = parseBackup(file);
    expect(parsed.ok).toBe(true);
    applyBackup(parsed, 'merge', pc);
    expect(JSON.parse(pc.getItem('jungchogi_roadmap_checks'))).toEqual({ 23: true, 24: true });
    expect(JSON.parse(pc.getItem('jungchogi_bookmarks'))).toEqual({ 'lesson:b': 9, 'doc:a': 5 });
    expect(JSON.parse(pc.getItem('jungchogi_study_time'))).toEqual({ d1: 30, d2: 10 });
  });
});

describe('문구', () => {
  it('실패 이유마다 다른 문구, 모르는 이유는 일반 오류 문구', () => {
    const reasons = ['json', 'shape', 'schema', 'empty', 'quota', 'error'];
    expect(new Set(reasons.map(failureMessage)).size).toBe(reasons.length);
    expect(failureMessage('quota')).toContain('기존 데이터는 그대로');
    expect(failureMessage('nope')).toBe(failureMessage('error'));
  });

  it('성공 문구는 방식과 건너뛴 개수를 담는다', () => {
    expect(successMessage({ written: 5, skipped: 0 }, 'merge')).toBe('5개 항목을 합쳤습니다.');
    expect(successMessage({ written: 5, skipped: 2 }, 'replace')).toContain('덮어썼습니다');
    expect(successMessage({ written: 5, skipped: 2 }, 'replace')).toContain('2개 항목은 건너뛰었습니다');
  });
});
