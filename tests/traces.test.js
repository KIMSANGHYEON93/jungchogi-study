import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCodeDrill } from '../src/utils/parseCodeDrill.js';
import { TRACES, traceFor } from '../src/domain/traces.js';

const md = readFileSync(resolve(process.cwd(), 'public/data/정처기_코드트레이싱_드릴.md'), 'utf8');
const problems = new Map(parseCodeDrill(md).map((p) => [p.id, p]));
const normalize = (s) => s.split(/\s+/).filter(Boolean).join(' ');

describe('traces', () => {
  it('언어별 최소 2문제, 총 8문제 이상', () => {
    const ids = Object.keys(TRACES);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const prefix of ['C-', 'J-', 'P-']) {
      expect(ids.filter((id) => id.startsWith(prefix)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('traceFor — 없는 id 는 null', () => {
    expect(traceFor('C-01')).toBe(TRACES['C-01']);
    expect(traceFor('X-99')).toBeNull();
    expect(traceFor('toString')).toBeNull();
  });

  describe.each(Object.entries(TRACES))('%s', (id, trace) => {
    const problem = problems.get(id);

    it('문제 id 가 드릴에 존재한다', () => {
      expect(problem).toBeDefined();
    });

    it('step 번호가 1부터 연속이다', () => {
      trace.steps.forEach((s, i) => expect(s.step).toBe(i + 1));
    });

    it('line 이 코드 줄 수 범위 안이다', () => {
      const lineCount = problem.code.split('\n').length;
      for (const s of trace.steps) {
        expect(Number.isInteger(s.line)).toBe(true);
        expect(s.line).toBeGreaterThanOrEqual(1);
        expect(s.line).toBeLessThanOrEqual(lineCount);
      }
    });

    it('변수 값은 문자열/숫자/null 뿐이다', () => {
      for (const s of trace.steps) {
        for (const v of Object.values(s.variables)) {
          expect(v === null || typeof v === 'string' || typeof v === 'number').toBe(true);
        }
      }
    });

    it('output 을 이어 붙이면 expectedOutput 과 같다', () => {
      const joined = trace.steps.map((s) => s.output ?? '').join('');
      expect(normalize(joined)).toBe(normalize(problem.expectedOutput));
    });
  });
});
