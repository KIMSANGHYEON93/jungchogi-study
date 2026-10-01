// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSnapshot, normalizeFlags, resetStudyState, subscribe, toggleBookmark, toggleDone,
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
    toggleBookmark('c-operators');
    expect(getSnapshot().checks).toEqual({ 24: true });
    expect(getSnapshot().bookmarks).toEqual({ 'c-operators': true });
    expect(JSON.parse(localStorage.getItem('jungchogi_roadmap_checks'))).toEqual({ 24: true });
    expect(JSON.parse(localStorage.getItem('jungchogi_lesson_bookmarks'))).toEqual({ 'c-operators': true });
    toggleDone(24);
    expect(getSnapshot().checks).toEqual({});
  });

  it('저장값을 복원한다 — 기존 로드맵 기록({d:true}) 호환, false 는 무시', () => {
    localStorage.setItem('jungchogi_roadmap_checks', JSON.stringify({ 24: true, 23: false }));
    expect(getSnapshot().checks).toEqual({ 24: true });
  });

  it('깨진 JSON 은 빈 상태로 보고 원본 문자열은 지우지 않는다', () => {
    localStorage.setItem('jungchogi_lesson_bookmarks', '{oops');
    expect(getSnapshot().bookmarks).toEqual({});
    expect(localStorage.getItem('jungchogi_lesson_bookmarks')).toBe('{oops');
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
      toggleBookmark('x');
      expect(getSnapshot().bookmarks).toEqual({ x: true });
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
