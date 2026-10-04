// 핵심 암기 카드 덱 — 실제 md 가 앱의 기대(카드 수 상수 · id 형식 · 영역)와 맞는지,
// 그리고 이 앱이 직접 쓴 자료로서 특정 교재의 구성 · 번호를 따르지 않는지 확인한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseQuiz } from '../src/utils/parseQuiz.js';
import { CORE_CARD_COUNT, CORE_DECK_FILE } from '../src/domain/coreDeck.js';
import { STUDY_FILES } from '../src/domain/studyFiles.js';

const md = readFileSync(resolve(process.cwd(), 'public/data', CORE_DECK_FILE), 'utf-8');
const cards = parseQuiz(md);

describe('핵심 암기 카드 덱', () => {
  it('카드 수가 대시보드 분모 상수와 같다', () => {
    expect(cards).toHaveLength(CORE_CARD_COUNT);
  });

  it('id 는 K001 부터 빠짐없이 이어지고 겹치지 않는다', () => {
    expect(cards.map((c) => c.id)).toEqual(
      Array.from({ length: CORE_CARD_COUNT }, (_, i) => `K${String(i + 1).padStart(3, '0')}`)
    );
  });

  it('모든 카드에 질문 · 정답 · 영역이 있고, 여섯 영역을 모두 다룬다', () => {
    for (const c of cards) {
      expect(c.question.length, c.id).toBeGreaterThan(5);
      expect(c.answer.length, c.id).toBeGreaterThan(5);
      expect(c.category, c.id).toBeTruthy();
    }
    expect(new Set(cards.map((c) => c.category))).toEqual(
      new Set(['데이터베이스', '소프트웨어공학', '디자인패턴/UML', '테스트', '보안/네트워크', 'OS/기타'])
    );
  });

  it('특정 교재의 이름 · 번호 체계를 쓰지 않는다', () => {
    expect(md).not.toMatch(/수제비|시나공|이기적|흥달|해커스|에듀윌/);
    expect(md).not.toMatch(/\[암기 \d{3}/);
  });

  it('학습 노트 목록의 같은 자리(15번째)에 있다 — 다른 문서의 순번이 바뀌지 않는다', () => {
    expect(STUDY_FILES[14].file).toBe(CORE_DECK_FILE);
  });
});
