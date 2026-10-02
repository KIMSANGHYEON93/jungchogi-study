// 암기 119선 보강 덱의 카드 구성 — 옛 id(섹션 단위 `B07`)와 새 id(카드 단위 `B07-2`)를 잇는다.
//
// 처음에는 `### 보강 N` 섹션 하나가 카드 한 장(`B07`)이었다. 지금은 섹션 안의 덩어리마다 한 장(`B07-1`, `B07-2` …)이다
// (utils/parseBogang.js). 옛 id 로 남은 기록(외움 표시 · 링크)을 읽으려면 섹션마다 카드가 몇 장인지 알아야 하는데,
// 그건 md 를 받아야 알 수 있다. 대시보드·저장소는 md 없이 동작해야 하므로 여기에 상수로 둔다.
// `tests/bogangDeck.test.js` 가 실제 md 와 같은지 확인한다 — md 를 고쳐 카드 수가 바뀌면 그 테스트가 실패한다.

/** 섹션 id → 그 섹션의 카드 수 */
export const BOGANG_SECTION_SIZES = Object.freeze({
  B01: 3,
  B02: 2,
  B03: 2,
  B04: 1,
  B05: 1,
  B06: 4,
  B07: 2,
  B08: 4,
  B09: 4,
  B10: 4,
  B11: 5,
  B12: 3,
  B13: 4,
  B14: 4,
  B15: 3,
  B16: 3,
  B17: 1,
  B18: 2,
  B19: 3,
  B20: 6,
  B21: 3,
  B22: 6,
  B23: 6,
  B24: 4,
});

export const BOGANG_CARD_COUNT = Object.values(BOGANG_SECTION_SIZES).reduce((a, b) => a + b, 0);

const LEGACY_ID = /^B\d{2,3}$/;

/** 섹션 id 의 카드 id 목록 (`B07` → `B07-1`, `B07-2`). 모르는 섹션이면 빈 배열 */
export function bogangCardIds(section) {
  const n = BOGANG_SECTION_SIZES[section] ?? 0;
  return Array.from({ length: n }, (_, i) => `${section}-${i + 1}`);
}

/**
 * 옛 형식의 외움 기록(`{ B07: true }`)을 카드 단위(`{ 'B07-1': true, 'B07-2': true }`)로 펼친다.
 * 섹션을 외웠다고 표시한 사용자의 기록을 그대로 이어 주려고 그 섹션의 모든 카드에 같은 값을 준다.
 * 이미 카드 단위인 기록은 건드리지 않고, 카드 단위 값이 있으면 옛 값보다 우선한다.
 * @param {Record<string, unknown>} known
 * @returns {{ known: Record<string, unknown>, changed: boolean }}
 */
export function expandLegacyBogangKnown(known) {
  const out = {};
  let changed = false;
  for (const [id, value] of Object.entries(known ?? {})) {
    if (!LEGACY_ID.test(id)) {
      out[id] = value;
      continue;
    }
    changed = true;
    for (const child of bogangCardIds(id)) out[child] ??= !!value;
  }
  // 카드 단위 기록이 옛 기록보다 우선하도록, 위에서 `??=` 로 채운 값을 카드 단위 원본으로 덮는다
  for (const [id, value] of Object.entries(known ?? {})) if (!LEGACY_ID.test(id)) out[id] = value;
  return { known: out, changed };
}

/**
 * 딥링크 id 를 이 덱의 카드 id 로 맞춘다. 옛 섹션 id(`B07`)는 그 섹션의 첫 카드로 보낸다.
 * @param {string|null} id
 * @param {{id: string, section?: string}[]} cards
 */
export function resolveBogangId(id, cards) {
  if (!id || cards.some((c) => c.id === id)) return id;
  return cards.find((c) => c.section === id)?.id ?? id;
}
