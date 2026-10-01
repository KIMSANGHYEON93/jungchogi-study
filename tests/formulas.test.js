import { describe, it, expect } from 'vitest';
import {
  CIDR_TABLE,
  CLASSIC_REFS,
  cidrInfo,
  cyclomatic,
  hrn,
  simulatePageReplacement,
} from '../src/domain/formulas.js';

describe('cidrInfo', () => {
  it('/24 는 255.255.255.0 에 호스트 254', () => {
    expect(cidrInfo(24)).toEqual({ prefix: 24, mask: '255.255.255.0', hosts: 254, blockSize: 256 });
  });
  it('옥텟 경계가 아닌 접두사도 마스크를 맞게 만든다', () => {
    expect(cidrInfo(26).mask).toBe('255.255.255.192');
    expect(cidrInfo(20).mask).toBe('255.255.240.0');
    expect(cidrInfo(16).hosts).toBe(65534);
    expect(cidrInfo(30).hosts).toBe(2);
  });
  it('경계: 0 은 호스트 2^32−2, 31·32 는 0', () => {
    expect(cidrInfo(0)).toMatchObject({ mask: '0.0.0.0', hosts: 4294967294 });
    expect(cidrInfo(31)).toMatchObject({ mask: '255.255.255.254', hosts: 0 });
    expect(cidrInfo(32)).toMatchObject({ mask: '255.255.255.255', hosts: 0, blockSize: 1 });
  });
  it('범위 밖이거나 정수가 아니면 null', () => {
    for (const bad of [33, -1, 1.5, NaN, '24', null, undefined]) expect(cidrInfo(bad)).toBeNull();
  });
  it('CIDR_TABLE 은 /16 ~ /30', () => {
    expect(CIDR_TABLE.map((r) => r.prefix)).toEqual(Array.from({ length: 15 }, (_, i) => 16 + i));
  });
});

describe('hrn', () => {
  it('(대기 + 서비스) / 서비스', () => {
    expect(hrn(10, 5)).toBe(3);
    expect(hrn(0, 4)).toBe(1);
  });
  it('서비스시간이 0 이하면 null', () => {
    expect(hrn(5, 0)).toBeNull();
    expect(hrn(5, -2)).toBeNull();
    expect(hrn(NaN, 3)).toBeNull();
  });
});

describe('cyclomatic', () => {
  it('E − N + 2', () => {
    expect(cyclomatic({ edges: 9, nodes: 7 })).toBe(4);
    expect(cyclomatic({ edges: 1, nodes: 2 })).toBe(1);
  });
});

describe('simulatePageReplacement', () => {
  it('고전 참조열, 프레임 3: FIFO=15, LRU=12 (교재 값)', () => {
    expect(simulatePageReplacement('FIFO', CLASSIC_REFS, 3).faults).toBe(15);
    expect(simulatePageReplacement('LRU', CLASSIC_REFS, 3).faults).toBe(12);
  });
  it('LFU 는 동률일 때 가장 오래 적재된 것을 교체 (독립 구현으로 교차 검증한 값 13)', () => {
    expect(simulatePageReplacement('LFU', CLASSIC_REFS, 3).faults).toBe(13);
  });
  it('steps 는 참조마다 하나이고 같은 칸에 교체한다', () => {
    const { steps } = simulatePageReplacement('FIFO', CLASSIC_REFS, 3);
    expect(steps).toHaveLength(20);
    expect(steps[0]).toEqual({ ref: 7, frames: [7], fault: true });
    expect(steps[2]).toEqual({ ref: 1, frames: [7, 0, 1], fault: true });
    expect(steps[3]).toEqual({ ref: 2, frames: [2, 0, 1], fault: true });
    expect(steps[4]).toEqual({ ref: 0, frames: [2, 0, 1], fault: false });
  });
  it('폴트 수는 steps 의 fault 개수와 같다', () => {
    for (const a of ['FIFO', 'LRU', 'LFU']) {
      const r = simulatePageReplacement(a, CLASSIC_REFS, 4);
      expect(r.faults).toBe(r.steps.filter((s) => s.fault).length);
    }
  });
  it('경계: 빈 참조열·잘못된 프레임은 빈 결과, 모르는 알고리즘은 던진다', () => {
    expect(simulatePageReplacement('LRU', [], 3)).toEqual({ faults: 0, steps: [] });
    expect(simulatePageReplacement('LRU', [1, 2], 0)).toEqual({ faults: 0, steps: [] });
    expect(() => simulatePageReplacement('OPT', [1], 1)).toThrow();
  });
});
