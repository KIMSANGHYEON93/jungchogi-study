// 학습 노트(Day 문서)의 "학습 완료 체크리스트" 체크 상태.
//
// 저장 키: `study_checklist` = { [문서 파일명]: { [항목 문구]: true } }
// 항목은 순서가 아니라 **문구**로 가리킨다 — 문서에 항목이 끼어들어도 다른 항목의 체크가 밀리지 않는다.
//
// 이 체크는 자기 점검 기록일 뿐이다. 정답률·이해도로 세지 않고, 로드맵 일차 완료(`roadmap_checks`)도
// 자동으로 바꾸지 않는다 — 일차 완료는 사용자가 로드맵·레슨의 완료 버튼으로 직접 정한다.

import { loadProgress, saveProgress } from './storage';

export const STUDY_CHECKLIST_KEY = 'study_checklist';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 저장값 전체. 깨졌으면 빈 맵 */
export function getStudyChecklists() {
  const value = loadProgress(STUDY_CHECKLIST_KEY, {});
  return isPlainObject(value) ? value : {};
}

/** 문서 하나의 체크 맵 — true 인 항목만 */
export function getChecklist(file) {
  const doc = getStudyChecklists()[file];
  if (!isPlainObject(doc)) return {};
  const out = {};
  for (const [k, v] of Object.entries(doc)) if (v === true) out[k] = true;
  return out;
}

/**
 * 항목 하나를 켜거나 끈다. 끈 항목은 지워서 저장값이 불어나지 않게 한다.
 * @returns {{checks: Record<string, true>, saved: boolean}}
 */
export function setChecklistItem(file, item, checked) {
  const all = getStudyChecklists();
  const doc = { ...getChecklist(file) };
  if (checked) doc[item] = true;
  else delete doc[item];
  const next = { ...all };
  if (Object.keys(doc).length > 0) next[file] = doc;
  else delete next[file];
  return { checks: doc, saved: saveProgress(STUDY_CHECKLIST_KEY, next) };
}

/** 마크다운 원문에서 체크리스트 항목 문구를 뽑는다 (`- [ ] 문구`). 진행률 분모로 쓴다 */
export function checklistItemsOf(markdown) {
  const items = [];
  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const m = line.match(/^\s*[-*+]\s+\[[ xX]\]\s+(.+?)\s*$/);
    if (m) items.push(normalizeItemText(m[1]));
  }
  return items;
}

/**
 * 화면에 그려진 문구와 원문의 문구를 같은 키로 맞춘다 — 마크다운 기호(`**`, 백틱)를 걷고 공백을 접는다.
 * 렌더링된 텍스트에는 기호가 없으므로 원문 쪽에서 지운다.
 */
export function normalizeItemText(text) {
  return String(text)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
