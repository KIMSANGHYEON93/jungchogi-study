// 공개 저장소 · 공개 사이트의 학습 자료 규칙(docs/content-sources.md)을 지키는지 확인한다.
// 기출 회차를 붙인 복원 문제를 다시 넣거나, 삭제한 교재 기반 자료가 되살아나는 것을 막는다.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.cwd(), 'public/data');
const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
const read = (f) => readFileSync(resolve(dir, f), 'utf-8');

describe('학습 자료 출처 규칙', () => {
  it('문제에 기출 회차 표기([2021년 1회] 등)를 붙인 복원 문제가 없다', () => {
    for (const f of files) expect(read(f), f).not.toMatch(/\[?20[12]\d년 ?[1-4]회\]?/);
  });

  it('삭제한 교재 기반 자료(암기 119선)가 되살아나지 않았다', () => {
    expect(files.some((f) => f.includes('119'))).toBe(false);
    for (const f of files) expect(read(f), f).not.toMatch(/필수암기 ?119|\[암기 \d{3}/);
  });

  it('Day 01~03 의 코드 트레이싱 연습은 자체 제작 표기를 달고 있다', () => {
    for (const f of ['정처기_Day01_C언어.md', '정처기_Day02_Java.md', '정처기_Day03_Python_SQL.md']) {
      const md = read(f);
      expect(md, f).toContain('## PART 5: 코드 트레이싱 연습');
      expect(md, f).toContain('이 앱에서 새로 만든 문제');
      expect(md, f).not.toContain('기출 코드 트레이싱');
    }
  });

  it('Day09 · Day11 모의고사는 직접 만든 문항 표기를 달고 20문항씩이다', () => {
    for (const f of ['정처기_Day09_모의고사1회.md', '정처기_Day11_모의고사2회.md']) {
      const md = read(f);
      expect(md, f).toContain('이 앱에서 직접 만든 문항');
      expect(md.match(/^### 문제 \d+\./gm), f).toHaveLength(20);
    }
  });
});
