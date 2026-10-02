// @vitest-environment jsdom
//
// 암기 119선 덱 쪼개기: 실제 md 와 상수의 일치, 본문 보존, 옛 기록 이전.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseBogang } from '../src/utils/parseBogang.js';
import {
  BOGANG_CARD_COUNT, BOGANG_SECTION_SIZES, bogangCardIds, expandLegacyBogangKnown, resolveBogangId,
} from '../src/domain/bogangDeck.js';
import { loadProgress, migrateBogangKnown } from '../src/utils/storage.js';

const md = readFileSync(resolve(process.cwd(), 'public/data/정처기_보강_기출분석_암기119선.md'), 'utf-8');
const cards = parseBogang(md);

describe('실제 암기 119선 자료', () => {
  it('카드 id 는 모두 유일하고 `B섹션-순번` 형식이다', () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    for (const c of cards) expect(c.id).toMatch(/^B\d{2}-\d+$/);
  });

  it('섹션별 카드 수가 domain/bogangDeck.js 상수와 같다 (md 를 고치면 상수도 고쳐야 한다)', () => {
    const sizes = {};
    for (const c of cards) sizes[c.section] = (sizes[c.section] ?? 0) + 1;
    expect(sizes).toEqual(BOGANG_SECTION_SIZES);
    expect(cards).toHaveLength(BOGANG_CARD_COUNT);
    expect(Object.keys(BOGANG_SECTION_SIZES)).toHaveLength(24);
  });

  it('같은 섹션 안의 질문은 서로 다르다 (카드를 구별할 수 있다)', () => {
    for (const section of Object.keys(BOGANG_SECTION_SIZES)) {
      const qs = cards.filter((c) => c.section === section).map((c) => c.question);
      expect(new Set(qs).size, section).toBe(qs.length);
    }
  });

  it('쪼개도 본문이 사라지지 않는다 — 원본 코드블록의 모든 줄이 카드에 들어 있다', () => {
    const body = md.split(/^## Part 3/m)[0];
    const originalLines = [];
    const fence = /```[^\n]*\n([\s\S]*?)```/g;
    // Part 2 의 보강 섹션 안 코드블록만 (Part 1 의 기출 표는 카드가 아니다)
    const part2 = body.slice(body.indexOf('## Part 2'));
    for (let m = fence.exec(part2); m; m = fence.exec(part2)) {
      for (const l of m[1].split('\n')) if (l.trim()) originalLines.push(l.trim());
    }
    const cardLines = cards.flatMap((c) => c.answer.split('\n').map((l) => l.trim()).filter((l) => l && l !== '```'));
    const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
    const have = count(cardLines);
    for (const [line, n] of count(originalLines)) expect(have.get(line) ?? 0, line).toBeGreaterThanOrEqual(n);
  });

  it('모든 카드에 답이 있다', () => {
    for (const c of cards) expect(c.answer.length, c.id).toBeGreaterThan(0);
  });
});

describe('옛 id 와 새 id 잇기', () => {
  it('섹션의 카드 id 목록', () => {
    expect(bogangCardIds('B02')).toEqual(['B02-1', 'B02-2']);
    expect(bogangCardIds('B99')).toEqual([]);
  });

  it('옛 섹션 단위 기록을 카드 단위로 펼친다 (외움은 모든 카드, 모름은 모든 카드 false)', () => {
    const { known, changed } = expandLegacyBogangKnown({ B02: true, B04: false, 'B01-1': true });
    expect(changed).toBe(true);
    expect(known).toEqual({ 'B02-1': true, 'B02-2': true, 'B04-1': false, 'B01-1': true });
  });

  it('카드 단위 기록이 옛 기록보다 우선하고, 옛 기록이 없으면 changed 가 false', () => {
    expect(expandLegacyBogangKnown({ B02: true, 'B02-2': false }).known).toEqual({ 'B02-1': true, 'B02-2': false });
    expect(expandLegacyBogangKnown({ 'B02-1': true }).changed).toBe(false);
    expect(expandLegacyBogangKnown(null)).toEqual({ known: {}, changed: false });
  });

  it('옛 섹션 id 는 그 섹션 첫 카드로, 모르는 id 는 그대로 돌려준다', () => {
    expect(resolveBogangId('B06', cards)).toBe('B06-1');
    expect(resolveBogangId('B06-3', cards)).toBe('B06-3');
    expect(resolveBogangId('B99', cards)).toBe('B99');
    expect(resolveBogangId(null, cards)).toBeNull();
    expect(resolveBogangId('B06', [])).toBe('B06');
  });
});

describe('외움 기록 마이그레이션 (storage)', () => {
  beforeEach(() => localStorage.clear());

  it('localStorage 의 옛 기록을 펼쳐 저장한다', () => {
    localStorage.setItem('jungchogi_flashcard_known_bogang119', JSON.stringify({ B02: true, 'B01-1': true }));
    expect(migrateBogangKnown()).toBe(true);
    expect(loadProgress('flashcard_known_bogang119')).toEqual({ 'B01-1': true, 'B02-1': true, 'B02-2': true });
    expect(migrateBogangKnown()).toBe(false); // 두 번째는 할 일이 없다
  });

  it('기록이 없거나 깨졌거나 모양이 틀리면 건드리지 않는다', () => {
    expect(migrateBogangKnown()).toBe(false);
    localStorage.setItem('jungchogi_flashcard_known_bogang119', '{oops');
    expect(migrateBogangKnown()).toBe(false);
    expect(localStorage.getItem('jungchogi_flashcard_known_bogang119')).toBe('{oops');
    localStorage.setItem('jungchogi_flashcard_known_bogang119', '[1]');
    expect(migrateBogangKnown()).toBe(false);
    expect(localStorage.getItem('jungchogi_flashcard_known_bogang119')).toBe('[1]');
  });
});
