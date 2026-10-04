// 북마크 대상의 종류와 이동 경로. 저장 형식은 utils/studyState.js (`종류:id` → 시각).
//
// id 는 각 종류가 원래 쓰는 안정적인 식별자를 그대로 쓴다.
//  - 단답형 100선 `001`, 핵심 암기 카드 `K001`, 코드 트레이싱 드릴 `C-01` (자료 번호 — 이 앱의 딥링크와 같다)
//  - `bogang` 은 지금은 없는 '암기 119선' 덱의 옛 북마크다. 가리킬 곳이 없어 목록에서 해제만 할 수 있다
//  - 레슨 id (`c-operators` …), 학습 문서는 파일 이름(목록 순서가 바뀌어도 가리키는 문서가 같다)

import { lessonById } from './lessons';
import { STUDY_FILES } from './studyFiles';

export const BOOKMARK_TYPE = Object.freeze({
  LESSON: 'lesson',
  QUIZ100: 'quiz100',
  CORE: 'core',
  BOGANG: 'bogang',
  CODE_DRILL: 'codeDrill',
  DOC: 'doc',
});

export const BOOKMARK_TYPE_LABEL = Object.freeze({
  [BOOKMARK_TYPE.LESSON]: '레슨',
  [BOOKMARK_TYPE.QUIZ100]: '단답형 100선',
  [BOOKMARK_TYPE.CORE]: '핵심 암기',
  [BOOKMARK_TYPE.BOGANG]: '암기 119선 (삭제됨)',
  [BOOKMARK_TYPE.CODE_DRILL]: '코드 퀴즈',
  [BOOKMARK_TYPE.DOC]: '학습 노트',
});

/** 화면에 나열하는 순서 */
export const BOOKMARK_TYPE_ORDER = Object.freeze(Object.values(BOOKMARK_TYPE));

/** 플래시카드 덱 키 → 북마크 종류 */
export const DECK_BOOKMARK_TYPE = Object.freeze({
  quiz100: BOOKMARK_TYPE.QUIZ100,
  core: BOOKMARK_TYPE.CORE,
});

/**
 * 북마크가 가리키는 화면 경로. 대상이 사라졌거나 모르는 종류면 null.
 * @param {{type: string, id: string}} entry
 * @returns {string|null}
 */
export function bookmarkLink({ type, id }) {
  switch (type) {
    case BOOKMARK_TYPE.LESSON: {
      const lesson = lessonById(id);
      return lesson ? `/lesson/${lesson.d}` : null;
    }
    case BOOKMARK_TYPE.QUIZ100:
    case BOOKMARK_TYPE.CORE:
      return `/flashcard?id=${encodeURIComponent(id)}`;
    case BOOKMARK_TYPE.CODE_DRILL:
      return `/quiz?id=${encodeURIComponent(id)}`;
    case BOOKMARK_TYPE.DOC: {
      const idx = STUDY_FILES.findIndex((f) => f.file === id);
      return idx >= 0 ? `/study?doc=${idx}` : null;
    }
    default:
      return null;
  }
}

/** 학습 문서 파일 이름 → 표시 이름 (없으면 null) */
export function docName(file) {
  return STUDY_FILES.find((f) => f.file === file)?.name ?? null;
}
