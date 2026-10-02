import { describe, it, expect } from 'vitest';
import { LESSONS, lessonByDay, lessonById } from '../src/domain/lessons.js';
import { ROADMAP_DAYS } from '../src/domain/roadmap.js';
import { matchesExpectedOutput } from '../src/domain/grading.js';
import { CIDR_TABLE, cidrInfo, cyclomatic, hrn, simulatePageReplacement } from '../src/domain/formulas.js';

describe('레슨 데이터', () => {
  it('D-24 ~ D-17(1단계)와 D-15 ~ D-11(2단계) 13개 일차가 일차 내림차순으로 있다 (D-16 · D-10 은 점검일)', () => {
    expect(LESSONS.map((l) => l.d)).toEqual([24, 23, 22, 21, 20, 19, 18, 17, 15, 14, 13, 12, 11]);
    expect(LESSONS.map((l) => l.track)).toEqual([
      'C', 'C', 'C', 'Java', 'Java', 'Python', 'SQL', 'SQL', 'OS', 'OS', '네트워크', '네트워크', '테스트',
    ]);
    expect(lessonByDay(16)).toBeNull();
    expect(lessonByDay(10)).toBeNull();
    expect(lessonByDay(24).title).toContain('연산자');
    expect(lessonByDay('23').title).toContain('제어문');
    expect(lessonByDay(17).track).toBe('SQL');
    expect(lessonByDay(1)).toBeNull();
    expect(lessonById('sql-join-group').d).toBe(17);
  });

  it('id·일차가 유일하고 로드맵 1단계 일차와 맞는다', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    expect(new Set(LESSONS.map((l) => l.d)).size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      const day = ROADMAP_DAYS.find((x) => x.d === l.d);
      expect(day, `D-${l.d}`).toBeTruthy();
      expect(l.d).toBeGreaterThanOrEqual(11);
    }
  });

  it('모든 레슨에 개념·예제·퀴즈가 있고 퀴즈 정답이 자기 정답과 일치한다', () => {
    for (const l of LESSONS) {
      expect(l.goals.length).toBeGreaterThan(0);
      expect(l.sections.length).toBeGreaterThan(0);
      expect(l.pitfalls.length).toBeGreaterThan(0);
      expect(l.questions.length).toBeGreaterThanOrEqual(4);
      expect(new Set(l.questions.map((q) => q.id)).size).toBe(l.questions.length);
      for (const q of l.questions) {
        expect(q.prompt && q.answer && q.explain, `${l.id}/${q.id}`).toBeTruthy();
        expect(matchesExpectedOutput(q.answer, q.answer)).toBe(true);
      }
    }
  });

  it('SQL 레슨은 샘플 표를 갖고 모든 행이 열 수와 맞는다', () => {
    expect(lessonByDay(17).tables.map((x) => x.name)).toEqual(['DEPT', 'EMP']);
    expect(lessonByDay(18).tables.map((x) => x.name)).toEqual(['STUDENT']);
    for (const l of LESSONS.filter((x) => x.tables)) {
      for (const table of l.tables) for (const row of table.rows) expect(row).toHaveLength(table.columns.length);
    }
  });

  it('예제 코드의 개행·역슬래시가 보존되고 앞뒤 공백은 없다', () => {
    const c = lessonByDay(22).sections[0].code;
    expect(c.startsWith('#include')).toBe(true);
    expect(c.endsWith('}')).toBe(true);
    expect(c).toContain('printf("%d %d\\n", a, *p);');
    for (const l of LESSONS) {
      for (const s of l.sections) if (s.code) expect(s.code, `${l.id}/${s.heading}`).toBe(s.code.trim());
      for (const q of l.questions) if (q.code) expect(q.code, `${l.id}/${q.id}`).toBe(q.code.trim());
    }
  });
});

describe('2단계 계산 레슨 — 앱의 계산 함수와 교차 검증', () => {
  const q = (d, id) => lessonByDay(d).questions.find((x) => x.id === id).answer;

  it('D-14 페이지 교체: 정답과 표가 시뮬레이터와 같다', () => {
    const A = [1, 2, 3, 1, 4, 1, 2];
    const B = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
    expect(q(14, 'q1')).toBe(String(simulatePageReplacement('FIFO', A, 3).faults));
    expect(q(14, 'q2')).toBe(String(simulatePageReplacement('LRU', A, 3).faults));
    expect(q(14, 'q3')).toBe(String(simulatePageReplacement('FIFO', B, 4).faults));
    expect(simulatePageReplacement('FIFO', B, 3).faults).toBe(9);
    expect(q(14, 'q4')).toBe(String(simulatePageReplacement('LFU', [2, 3, 2, 1, 5, 2, 4, 5, 3, 2, 5, 2], 3).faults));
    // 표의 폴트 열 수가 제목의 폴트 횟수와 같다
    for (const [t, alg] of lessonByDay(14).tables.map((x, i) => [x, ['FIFO', 'LRU'][i]])) {
      expect(t.rows.filter((r) => r[4] === '폴트').length).toBe(simulatePageReplacement(alg, A, 3).faults);
      t.rows.forEach((r, i) => expect(r[0]).toBe(A[i]));
    }
  });

  it('D-13 CIDR: 표·정답이 cidrInfo 와 같다', () => {
    expect(q(13, 'q1')).toBe(String(cidrInfo(27).hosts));
    expect(q(13, 'q2')).toBe(cidrInfo(20).mask);
    for (const [prefix, mask, block, hosts] of lessonByDay(13).tables[0].rows) {
      const c = CIDR_TABLE.find((x) => `/${x.prefix}` === prefix);
      expect([mask, block, hosts]).toEqual([c.mask, c.blockSize, c.hosts]);
    }
  });

  it('D-13 네트워크·브로드캐스트: 블록 크기 방법의 결과', () => {
    // /26 → 블록 64, 77 은 64~127 / /21 → 3번째 옥텟 블록 8, 37 은 32~39
    const block = (v, size) => [Math.floor(v / size) * size, Math.floor(v / size) * size + size - 1];
    expect(block(77, cidrInfo(26).blockSize)).toEqual([64, 127]);
    expect(q(13, 'q4')).toBe('192.168.10.127');
    expect(block(37, 2 ** (24 - 21))).toEqual([32, 39]);
    expect(q(13, 'q3')).toBe('172.16.32.0');
  });

  it('D-15 스케줄링: 프로세스 표로 FCFS·SJF·HRN 을 다시 계산해도 정답과 같다', () => {
    const table = lessonByDay(15).tables[0].rows.map(([p, a, b]) => ({ p, a, b }));
    const run = (pick) => {
      let t = 0;
      const rest = [...table];
      const out = [];
      while (rest.length) {
        let ready = rest.filter((x) => x.a <= t);
        if (!ready.length) {
          t = Math.min(...rest.map((x) => x.a));
          ready = rest.filter((x) => x.a <= t);
        }
        const next = pick(ready, t);
        rest.splice(rest.indexOf(next), 1);
        out.push({ p: next.p, wait: t - next.a, turn: t - next.a + next.b });
        t += next.b;
      }
      return out;
    };
    const avg = (xs, k) => (xs.reduce((s, x) => s + x[k], 0) / xs.length).toFixed(2);
    const fcfs = run((r) => r.reduce((a, b) => (b.a < a.a ? b : a)));
    const sjf = run((r) => r.reduce((a, b) => (b.b < a.b ? b : a)));
    const hr = run((r, t) => r.reduce((a, b) => (hrn(t - b.a, b.b) > hrn(t - a.a, a.b) ? b : a)));
    expect(q(15, 'q1')).toBe(avg(fcfs, 'wait'));
    expect(q(15, 'q2')).toBe(sjf.map((x) => x.p).join(' '));
    expect(q(15, 'q3')).toBe(avg(sjf, 'turn'));
    expect(hr.map((x) => x.p)).toEqual(['P1', 'P3', 'P2', 'P4']);
    expect(q(15, 'q4')).toBe(hr[1].p);
  });

  it('D-11 순환 복잡도 · D-12 포트/계층', () => {
    expect(q(11, 'q1')).toBe(String(cyclomatic({ edges: 11, nodes: 9 })));
    expect(q(11, 'q2')).toBe('5');
    const ports = Object.fromEntries(lessonByDay(12).tables[1].rows.map(([n, p]) => [n, String(p)]));
    expect(q(12, 'q1')).toBe(ports.HTTPS);
    expect(q(12, 'q4')).toBe(ports.SSH);
    const osi = lessonByDay(12).tables[0].rows;
    expect(osi.map((r) => r[0])).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(String(osi.find((r) => r[1] === '네트워크')[0])).toBe(q(12, 'q2'));
  });
});
