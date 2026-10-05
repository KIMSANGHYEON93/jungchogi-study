// 핵심 암기 카드 덱 — public/data/정처기_핵심암기_카드.md
//
// 이 앱에서 직접 쓴 자료다. 예전 '암기 119선 보강' 덱은 특정 교재(수제비 필수암기 119선)의 구성 · 번호를
// 그대로 따른 자료라 공개 저장소 · 공개 사이트에 둘 수 없어 이 덱으로 바꿨다(docs/content-sources.md).
//
// 대시보드는 md 를 받지 않고 진도의 분모를 알아야 하므로 카드 수를 상수로 둔다.
// `tests/coreDeck.test.js` 가 실제 md 의 카드 수와 같은지 확인한다.

export const CORE_DECK_KEY = 'core';
export const CORE_DECK_FILE = '정처기_핵심암기_카드.md';
export const CORE_CARD_COUNT = 68;
