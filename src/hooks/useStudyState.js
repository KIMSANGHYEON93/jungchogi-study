import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe, toggleBookmark, toggleDone } from '../utils/studyState';

/**
 * 일차 완료 · 레슨 북마크를 읽고 바꾸는 훅. 로드맵과 레슨 화면이 같은 저장소를 공유한다.
 * @returns {{
 *   checks: Record<string, true>, bookmarks: Record<string, true>, saveFailed: boolean,
 *   isDone: (d: number) => boolean, isBookmarked: (id: string) => boolean,
 *   toggleDone: (d: number) => void, toggleBookmark: (id: string) => void
 * }}
 */
export default function useStudyState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...state,
    isDone: (d) => state.checks[String(d)] === true,
    isBookmarked: (id) => state.bookmarks[String(id)] === true,
    toggleDone,
    toggleBookmark,
  };
}
