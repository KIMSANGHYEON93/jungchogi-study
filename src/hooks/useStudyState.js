import { useMemo, useSyncExternalStore } from 'react';
import {
  bookmarkEntries,
  bookmarkKey,
  getSnapshot,
  subscribe,
  toggleBookmark,
  toggleDone,
} from '../utils/studyState';

/**
 * 일차 완료 · 북마크를 읽고 바꾸는 훅. 로드맵·레슨·플래시카드·퀴즈·학습 노트·북마크 화면이 같은 저장소를 공유한다.
 * @returns {{
 *   checks: Record<string, true>, bookmarks: Record<string, number>, saveFailed: boolean,
 *   bookmarkEntries: {type: string, id: string, addedAt: number}[],
 *   isDone: (d: number) => boolean,
 *   isBookmarked: (type: string, id: string) => boolean,
 *   toggleDone: (d: number) => void,
 *   toggleBookmark: (type: string, id: string) => void
 * }}
 */
export default function useStudyState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const entries = useMemo(() => bookmarkEntries(state.bookmarks), [state.bookmarks]);
  return {
    ...state,
    // 스냅샷이 바뀔 때만 다시 만든다 — 목록 화면이 렌더마다 정렬하지 않게
    bookmarkEntries: entries,
    isDone: (d) => state.checks[String(d)] === true,
    isBookmarked: (type, id) => bookmarkKey(type, id) in state.bookmarks,
    toggleDone,
    toggleBookmark,
  };
}
