import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pickLeastUsed, unseenCount, usageCounts } from '../src/domain/examPick.js';
import { parseQuiz } from '../src/utils/parseQuiz.js';

const pool = (n, prefix = 'Q') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

describe('모의고사 문항 고르기 — 덜 나온 문항부터', () => {
  it('지난 회차에 나온 문항을 세고, 처음 보는 문항부터 고른다', () => {
    const sessions = [{ items: [{ qid: 'Q0' }, { qid: 'Q1' }] }, { items: [{ qid: 'Q0' }] }];
    const counts = usageCounts(sessions);
    expect(counts.get('Q0')).toBe(2);
    expect(counts.get('Q1')).toBe(1);
    const picked = pickLeastUsed(pool(5), 3, counts).map((q) => q.id);
    expect(picked).toHaveLength(3);
    expect(picked).not.toContain('Q0');
    expect(picked).not.toContain('Q1');
    expect(unseenCount(pool(5), counts)).toBe(3);
  });

  it('회차를 거듭해도 풀을 한 바퀴 돌기 전에는 같은 문항이 다시 나오지 않는다', () => {
    const p = pool(180);
    const sessions = [];
    const seen = new Set();
    // 180 / 12 = 15회차 동안 중복 없음
    for (let round = 0; round < 15; round++) {
      const picked = pickLeastUsed(p, 12, usageCounts(sessions));
      for (const q of picked) {
        expect(seen.has(q.id)).toBe(false);
        seen.add(q.id);
      }
      sessions.push({ items: picked.map((q) => ({ qid: q.id })) });
    }
    expect(seen.size).toBe(180);
  });

  it('풀이 모자라면 덜 나온 것부터 채운다', () => {
    const counts = new Map([['Q0', 3], ['Q1', 1]]);
    const picked = pickLeastUsed(pool(2), 2, counts).map((q) => q.id);
    expect(picked).toEqual(['Q1', 'Q0']);
  });
});

describe('출제범위 확장 80선', () => {
  const md = readFileSync(resolve(process.cwd(), 'public/data/정처기_출제범위_확장문항.md'), 'utf8');
  const qs = parseQuiz(md);

  it('X001~X080 80문항이 모두 정답과 영역을 가진다', () => {
    expect(qs).toHaveLength(80);
    expect(qs.map((q) => q.id)).toEqual(Array.from({ length: 80 }, (_, i) => `X${String(i + 1).padStart(3, '0')}`));
    for (const q of qs) {
      expect(q.answer.length).toBeGreaterThan(10);
      expect(q.category).not.toBe('');
    }
    expect(new Set(qs.map((q) => q.category))).toEqual(
      new Set(['데이터베이스', '소프트웨어공학', '디자인패턴/UML', '인터페이스/UI', '테스트', '보안/네트워크', 'OS/기타'])
    );
  });

  it('단답형 100선과 문항 id 가 겹치지 않는다', () => {
    const base = parseQuiz(readFileSync(resolve(process.cwd(), 'public/data/정처기_단답형_100선.md'), 'utf8'));
    const ids = new Set(base.map((q) => q.id));
    expect(qs.some((q) => ids.has(q.id))).toBe(false);
  });
});
