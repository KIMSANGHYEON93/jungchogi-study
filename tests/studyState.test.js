// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  bookmarkEntries, bookmarkKey, getSnapshot, migrateLegacyBookmarks, normalizeBookmarks, normalizeFlags,
  resetStudyState, subscribe, toggleBookmark, toggleDone,
} from '../src/utils/studyState.js';

beforeEach(() => {
  localStorage.clear();
  resetStudyState();
});

describe('normalizeFlags', () => {
  it('true 인 항목만 남기고 깨진 형식은 빈 객체', () => {
    expect(normalizeFlags({ 24: true, 23: false, 22: 1, 21: null })).toEqual({ 24: true });
    expect(normalizeFlags(null)).toEqual({});
    expect(normalizeFlags([true])).toEqual({});
    expect(normalizeFlags('x')).toEqual({});
  });
});

describe('학습 상태 저장소', () => {
  it('완료·북마크를 토글하고 localStorage 에 저장한다', () => {
    toggleDone(24);
    toggleBookmark('lesson', 'c-operators');
    expect(getSnapshot().checks).toEqual({ 24: true });
    expect(getSnapshot().bookmarks).toEqual({ 'lesson:c-operators': expect.any(Number) });
    expect(JSON.parse(localStorage.getItem('jungchogi_roadmap_checks'))).toEqual({ 24: true });
    expect(Object.keys(JSON.parse(localStorage.getItem('jungchogi_bookmarks')))).toEqual(['lesson:c-operators']);
    toggleDone(24);
    expect(getSnapshot().checks).toEqual({});
  });

  it('저장값을 복원한다 — 기존 로드맵 기록({d:true}) 호환, false 는 무시', () => {
    localStorage.setItem('jungchogi_roadmap_checks', JSON.stringify({ 24: true, 23: false }));
    expect(getSnapshot().checks).toEqual({ 24: true });
  });

  it('깨진 JSON 은 빈 상태로 보고 원본 문자열은 지우지 않는다', () => {
    localStorage.setItem('jungchogi_bookmarks', '{oops');
    expect(getSnapshot().bookmarks).toEqual({});
    expect(localStorage.getItem('jungchogi_bookmarks')).toBe('{oops');
  });

  it('값이 같으면 같은 스냅샷 참조를 돌려준다', () => {
    expect(getSnapshot()).toBe(getSnapshot());
  });

  it('구독자에게 알리고 해제하면 더 알리지 않는다', () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    toggleDone(1);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    toggleDone(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('다른 탭의 변경(storage 이벤트)을 반영한다', () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    localStorage.setItem('jungchogi_roadmap_checks', JSON.stringify({ 5: true }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'jungchogi_roadmap_checks' }));
    expect(fn).toHaveBeenCalled();
    expect(getSnapshot().checks).toEqual({ 5: true });
    off();
  });

  it('용량 초과로 저장이 실패해도 이번 세션 화면은 바뀌고 saveFailed 가 켜진다', () => {
    const orig = Storage.prototype.setItem;
    const err = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    Storage.prototype.setItem = () => { throw err; };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      toggleBookmark('doc', 'x');
      expect(getSnapshot().bookmarks).toEqual({ 'doc:x': expect.any(Number) });
      expect(getSnapshot().saveFailed).toBe(true);
    } finally {
      Storage.prototype.setItem = orig;
      warn.mockRestore();
    }
  });

  it('localStorage 접근이 막혀도 던지지 않는다', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    try {
      expect(getSnapshot().checks).toEqual({});
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});

describe('북마크 맵', () => {
  it('종류 구분 없이 종류:id 한 맵에 모으고, 같은 id 도 종류가 다르면 따로 센다', () => {
    toggleBookmark('quiz100', '001');
    toggleBookmark('bogang', '001');
    toggleBookmark('codeDrill', 'C-01');
    expect(Object.keys(getSnapshot().bookmarks).sort()).toEqual(['bogang:001', 'codeDrill:C-01', 'quiz100:001']);
    toggleBookmark('quiz100', '001'); // 다시 누르면 해제
    expect(bookmarkKey('quiz100', '001') in getSnapshot().bookmarks).toBe(false);
    expect(bookmarkKey('bogang', '001') in getSnapshot().bookmarks).toBe(true);
  });

  it('id 에 콜론이 있어도 종류와 id 를 첫 콜론에서 나눈다', () => {
    toggleBookmark('doc', 'a:b');
    expect(bookmarkEntries(getSnapshot().bookmarks)).toEqual([{ type: 'doc', id: 'a:b', addedAt: expect.any(Number) }]);
  });

  it('최근에 북마크한 것이 먼저 오고, 같은 시각이면 종류·id 순이다', () => {
    expect(bookmarkEntries({ 'doc:a': 5, 'lesson:z': 9, 'doc:b': 5 }).map((e) => `${e.type}:${e.id}`)).toEqual([
      'lesson:z', 'doc:a', 'doc:b',
    ]);
  });

  it('normalizeBookmarks: 형식에 맞는 항목만 남긴다', () => {
    expect(normalizeBookmarks({ 'lesson:a': 5, 'lesson:b': true, bad: 1, 'x:y': 'no', 'x:z': -1, 'x:w': NaN })).toEqual({
      'lesson:a': 5, 'lesson:b': 0,
    });
    expect(normalizeBookmarks(null)).toEqual({});
    expect(normalizeBookmarks([1])).toEqual({});
  });
});

describe('옛 lesson_bookmarks 마이그레이션', () => {
  it('lesson:<id> 로 옮기고 옛 키를 지운다', () => {
    localStorage.setItem('jungchogi_lesson_bookmarks', JSON.stringify({ 'c-operators': true, 'sql-join-group': false }));
    expect(migrateLegacyBookmarks()).toBe(true);
    expect(Object.keys(getSnapshot().bookmarks)).toEqual(['lesson:c-operators']);
    expect(localStorage.getItem('jungchogi_lesson_bookmarks')).toBeNull();
  });

  it('새 기록이 이미 있으면 거기에 합치고 기존 시각은 유지한다', () => {
    localStorage.setItem('jungchogi_bookmarks', JSON.stringify({ 'lesson:c-operators': 123, 'doc:x': 5 }));
    localStorage.setItem('jungchogi_lesson_bookmarks', JSON.stringify({ 'c-operators': true, 'c-control-flow': true }));
    migrateLegacyBookmarks();
    expect(getSnapshot().bookmarks).toEqual({ 'lesson:c-operators': 123, 'doc:x': 5, 'lesson:c-control-flow': 0 });
  });

  it('옛 기록이 없으면 아무것도 하지 않고, 깨졌으면 그대로 둔다', () => {
    expect(migrateLegacyBookmarks()).toBe(false);
    localStorage.setItem('jungchogi_lesson_bookmarks', '{oops');
    expect(migrateLegacyBookmarks()).toBe(false);
    expect(localStorage.getItem('jungchogi_lesson_bookmarks')).toBe('{oops');
  });

  it('저장이 실패하면 옛 키를 남겨 다음에 다시 시도한다', () => {
    localStorage.setItem('jungchogi_lesson_bookmarks', JSON.stringify({ a: true }));
    const orig = Storage.prototype.setItem;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Storage.prototype.setItem = () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
    try {
      expect(migrateLegacyBookmarks()).toBe(false);
    } finally {
      Storage.prototype.setItem = orig;
      warn.mockRestore();
    }
    expect(localStorage.getItem('jungchogi_lesson_bookmarks')).not.toBeNull();
    expect(migrateLegacyBookmarks()).toBe(true);
  });
});

