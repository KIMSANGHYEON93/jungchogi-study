// scripts/usage-report.mjs — 비용 리포트 (블루프린트 §5 Phase 5 완료 조건).
//
// **API 키가 필요 없는 순수 계산이다.** 입력은 프론트 원장이 내보낸 JSON 이거나
// Vercel 로그를 긁은 JSONL 이고, 출력은 엔드포인트별·일자별 집계다.
//
// 여기서 덮는 경우의 수:
//   빈 입력 · 기록 1건(p50/p95) · 깨진 줄 섞임 · 여러 날짜·엔드포인트 혼재 ·
//   캐시 적중률 0%/100% · 비용을 모르는 기록 · 지연을 모르는 기록 ·
//   원장 내보내기 포맷(배열/래퍼)과 로그 프리픽스가 붙은 JSONL.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  parseRecords,
  percentile,
  seoulDate,
  summarize,
  formatReport,
  main,
  BLUEPRINT_ESTIMATES,
} from '../scripts/usage-report.mjs';

/** 계약된 사용 기록 하나 */
const rec = (overrides = {}) => ({
  ts: '2026-09-04T12:00:00.000Z',
  endpoint: 'tutor',
  model: 'claude-opus-5',
  effort: 'low',
  inputTokens: 1_000,
  outputTokens: 500,
  cacheReadTokens: 10_000,
  cacheCreationTokens: 2_000,
  costUsd: 0.035,
  latencyMs: 1_000,
  ok: true,
  errorCode: null,
  ...overrides,
});

const jsonl = (...records) => records.map((r) => JSON.stringify(r)).join('\n');

describe('parseRecords — 입력 형식', () => {
  it('JSONL 한 줄씩 읽는다 (Vercel 로그를 긁은 경우)', () => {
    const { records, skipped } = parseRecords(jsonl(rec(), rec({ endpoint: 'grade' })));
    expect(records).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it('JSON 배열도 읽는다 (프론트 원장 내보내기)', () => {
    const { records } = parseRecords(JSON.stringify([rec(), rec()]));
    expect(records).toHaveLength(2);
  });

  it('{ records: [...] } 래퍼도 읽는다', () => {
    const { records } = parseRecords(JSON.stringify({ exportedAt: 'x', records: [rec()] }));
    expect(records).toHaveLength(1);
  });

  it('{ entries: [...] } 래퍼도 읽는다', () => {
    const { records } = parseRecords(JSON.stringify({ entries: [rec()] }));
    expect(records).toHaveLength(1);
  });

  it('로그 수집기가 앞에 붙인 타임스탬프를 넘기고 JSON 을 찾는다', () => {
    const line = `2026-09-04T12:00:00.123Z  INFO  ${JSON.stringify(rec())}`;
    const { records, skipped } = parseRecords(line);
    expect(records).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('빈 입력은 기록 0건이고 오류가 아니다', () => {
    for (const empty of ['', '   ', '\n\n']) {
      const { records, skipped } = parseRecords(empty);
      expect(records).toEqual([]);
      expect(skipped).toEqual([]);
    }
  });

  it('깨진 줄은 건너뛰고 이유와 함께 남긴다', () => {
    const text = [JSON.stringify(rec()), '{ 이건 JSON 이 아니다', '', JSON.stringify(rec())].join(
      '\n'
    );
    const { records, skipped } = parseRecords(text);

    expect(records).toHaveLength(2);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ line: 2 });
    expect(skipped[0].reason).toMatch(/JSON/);
  });

  it('사용 기록이 아닌 JSON 줄도 건너뛴다 (다른 구조화 로그가 섞여도)', () => {
    const text = [JSON.stringify({ level: 'info', msg: 'cold start' }), JSON.stringify(rec())].join(
      '\n'
    );
    const { records, skipped } = parseRecords(text);

    expect(records).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/사용 기록/);
  });

  it('endpoint 가 계약 밖이면 기록으로 보지 않는다', () => {
    const { records, skipped } = parseRecords(jsonl(rec({ endpoint: 'chat' })));
    expect(records).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it('ts 가 없거나 읽을 수 없으면 기록으로 보지 않는다 (일자별 집계가 깨진다)', () => {
    const { records } = parseRecords(jsonl(rec({ ts: 'yesterday' }), rec({ ts: undefined })));
    expect(records).toHaveLength(0);
  });

  it('통째로 깨진 입력도 던지지 않고 skipped 로 알린다', () => {
    const { records, skipped } = parseRecords('<html>404</html>');
    expect(records).toEqual([]);
    expect(skipped.length).toBeGreaterThan(0);
  });
});

describe('percentile — 기록이 하나뿐일 때도 답이 있어야 한다', () => {
  it('한 건이면 p50 도 p95 도 그 값이다', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it('빈 목록은 null 이다 (0 이 아니다)', () => {
    expect(percentile([], 50)).toBeNull();
  });

  it('정렬되지 않은 입력도 받는다', () => {
    expect(percentile([40, 10, 30, 20], 50)).toBe(20);
    expect(percentile([40, 10, 30, 20], 95)).toBe(40);
  });

  it('두 건이면 p50 은 작은 쪽, p95 는 큰 쪽이다', () => {
    expect(percentile([10, 90], 50)).toBe(10);
    expect(percentile([10, 90], 95)).toBe(90);
  });
});

describe('seoulDate — 일자 버킷은 앱과 같은 한국 시간 기준', () => {
  it('UTC 15시는 한국의 다음 날이다', () => {
    expect(seoulDate('2026-09-04T15:30:00.000Z')).toBe('2026-09-05');
  });

  it('UTC 자정은 한국의 같은 날 오전 9시다', () => {
    expect(seoulDate('2026-09-04T00:00:00.000Z')).toBe('2026-09-04');
  });
});

describe('summarize — 빈 입력', () => {
  it('기록이 없으면 빈 집계를 낸다 (던지지 않는다)', () => {
    const summary = summarize([]);

    expect(summary.totals.calls).toBe(0);
    expect(summary.totals.costUsd).toBe(0);
    expect(summary.totals.cacheHitRate).toBeNull();
    expect(summary.totals.latency.p50).toBeNull();
    expect(summary.byEndpoint).toEqual({});
    expect(summary.byDate).toEqual({});
    expect(summary.span).toEqual({ from: null, to: null });
  });

  it('빈 집계도 리포트로 찍힌다', () => {
    const text = formatReport(summarize([]), { now: new Date('2026-09-04T00:00:00Z') });
    expect(text).toContain('기록이 없습니다');
  });
});

describe('summarize — 기록 1건', () => {
  const summary = summarize([rec({ latencyMs: 1_500 })]);

  it('p50 과 p95 가 같은 값이다', () => {
    expect(summary.totals.latency.p50).toBe(1_500);
    expect(summary.totals.latency.p95).toBe(1_500);
  });

  it('호출 수·비용·실패율을 낸다', () => {
    expect(summary.totals.calls).toBe(1);
    expect(summary.totals.costUsd).toBe(0.035);
    expect(summary.totals.failureRate).toBe(0);
  });

  it('엔드포인트별·일자별로도 같은 값이 잡힌다', () => {
    expect(summary.byEndpoint.tutor.calls).toBe(1);
    expect(summary.byDate['2026-09-04'].calls).toBe(1);
    expect(summary.span).toEqual({ from: '2026-09-04', to: '2026-09-04' });
  });
});

describe('summarize — 여러 날짜·엔드포인트 혼재', () => {
  const records = [
    rec({ ts: '2026-09-03T01:00:00.000Z', endpoint: 'tutor', latencyMs: 1_000 }),
    rec({ ts: '2026-09-03T02:00:00.000Z', endpoint: 'grade', latencyMs: 2_000, costUsd: 0.01 }),
    rec({ ts: '2026-09-04T03:00:00.000Z', endpoint: 'plan', latencyMs: 9_000, costUsd: 0.08 }),
    rec({
      ts: '2026-09-04T04:00:00.000Z',
      endpoint: 'plan',
      latencyMs: 11_000,
      costUsd: 0.12,
      ok: false,
      errorCode: 'UPSTREAM',
    }),
  ];
  const summary = summarize(records);

  it('엔드포인트별로 호출 수와 비용을 나눈다', () => {
    expect(summary.byEndpoint.plan.calls).toBe(2);
    expect(summary.byEndpoint.plan.costUsd).toBeCloseTo(0.2, 10);
    expect(summary.byEndpoint.grade.costUsd).toBe(0.01);
  });

  it('일자별로도 나눈다 (한국 시간 기준)', () => {
    expect(Object.keys(summary.byDate).sort()).toEqual(['2026-09-03', '2026-09-04']);
    expect(summary.byDate['2026-09-03'].calls).toBe(2);
    expect(summary.byDate['2026-09-04'].calls).toBe(2);
  });

  it('실패율은 엔드포인트별로 따로 센다', () => {
    expect(summary.byEndpoint.plan.failureRate).toBe(0.5);
    expect(summary.byEndpoint.plan.failed).toBe(1);
    expect(summary.byEndpoint.tutor.failureRate).toBe(0);
    expect(summary.totals.failureRate).toBe(0.25);
  });

  it('p50·p95 는 지연 분포에서 뽑는다', () => {
    expect(summary.totals.latency.p50).toBe(2_000);
    expect(summary.totals.latency.p95).toBe(11_000);
    expect(summary.totals.latency.count).toBe(4);
  });

  it('기간을 첫 날과 마지막 날로 잡는다', () => {
    expect(summary.span).toEqual({ from: '2026-09-03', to: '2026-09-04' });
  });
});

describe('summarize — 캐시 적중률', () => {
  it('캐시 읽기 / (캐시 읽기 + 입력) 로 센다', () => {
    const summary = summarize([rec({ inputTokens: 1_000, cacheReadTokens: 9_000 })]);
    expect(summary.totals.cacheHitRate).toBeCloseTo(0.9, 10);
  });

  it('캐시 적중 0% — 캐시를 하나도 못 읽은 경우', () => {
    const summary = summarize([rec({ inputTokens: 5_000, cacheReadTokens: 0 })]);
    expect(summary.totals.cacheHitRate).toBe(0);
  });

  it('캐시 적중 100% — 입력이 전부 캐시에서 온 경우', () => {
    const summary = summarize([rec({ inputTokens: 0, cacheReadTokens: 12_000 })]);
    expect(summary.totals.cacheHitRate).toBe(1);
  });

  it('분모가 0 이면 0% 가 아니라 null 이다 (잴 것이 없다)', () => {
    const summary = summarize([rec({ inputTokens: 0, cacheReadTokens: 0 })]);
    expect(summary.totals.cacheHitRate).toBeNull();
  });

  it('토큰을 모르는 기록은 적중률 계산에서 빼고 그 사실을 센다', () => {
    const summary = summarize([
      rec({ inputTokens: 1_000, cacheReadTokens: 9_000 }),
      rec({ inputTokens: null, cacheReadTokens: null }),
    ]);

    expect(summary.totals.cacheHitRate).toBeCloseTo(0.9, 10); // 아는 기록만으로 잰다
    expect(summary.totals.cacheHitSamples).toBe(1);
    expect(summary.totals.unknownTokenCalls).toBe(1);
  });
});

describe('summarize — "모름" 을 0 으로 세지 않는다', () => {
  const records = [
    rec({ costUsd: 0.035 }),
    rec({ costUsd: null, outputTokens: null }), // 스트림이 끊긴 요청
  ];
  const summary = summarize(records);

  it('총액은 아는 기록만 더한다', () => {
    expect(summary.totals.costUsd).toBe(0.035);
    expect(summary.totals.costKnownCalls).toBe(1);
    expect(summary.totals.costUnknownCalls).toBe(1);
  });

  it('모르는 기록의 아는 항목까지 더한 하한을 함께 낸다', () => {
    // 두 번째 기록: 입력 1000 + 캐시읽기 10000 + 캐시쓰기 2000 (출력만 모름)
    expect(summary.totals.costAtLeastUsd).toBeCloseTo(0.035 + 0.0225, 10);
    expect(summary.totals.costAtLeastUsd).toBeGreaterThan(summary.totals.costUsd);
  });

  it('평균 회당 비용은 아는 기록으로만 낸다', () => {
    expect(summary.totals.avgCostUsd).toBe(0.035);
  });

  it('아는 기록이 하나도 없으면 평균은 null 이다', () => {
    const only = summarize([rec({ costUsd: null })]);
    expect(only.totals.avgCostUsd).toBeNull();
    expect(only.totals.costUsd).toBe(0);
  });

  it('지연을 모르는 기록은 백분위 표본에서 뺀다', () => {
    const summary = summarize([rec({ latencyMs: null }), rec({ latencyMs: 500 })]);
    expect(summary.totals.latency.count).toBe(1);
    expect(summary.totals.latency.p50).toBe(500);
  });

  it('토큰 합계는 아는 값만 더하고 표본 수를 함께 남긴다', () => {
    const summary = summarize([rec({ inputTokens: 1_000 }), rec({ inputTokens: null })]);
    expect(summary.totals.tokens.inputTokens).toBe(2_000 - 1_000);
    expect(summary.totals.tokens.inputTokens).toBe(1_000);
  });

  it('가격표에 없는 모델이 섞이면 그 기록을 따로 센다', () => {
    const summary = summarize([rec(), rec({ model: 'claude-opus-6', costUsd: null })]);
    expect(summary.unknownModels).toEqual(['claude-opus-6']);
  });
});

describe('formatReport — 블루프린트 §6 추정치와 나란히', () => {
  const records = [
    rec({ endpoint: 'tutor', costUsd: 0.035, latencyMs: 1_000 }),
    rec({ endpoint: 'grade', costUsd: 0.012, latencyMs: 2_000 }),
    rec({ endpoint: 'plan', costUsd: 0.3, latencyMs: 20_000 }),
  ];
  const text = formatReport(summarize(records), { now: new Date('2026-09-04T00:00:00Z') });

  it('§6 추정치를 코드가 들고 있다', () => {
    expect(BLUEPRINT_ESTIMATES.tutor.usd).toBe(0.01);
    expect(BLUEPRINT_ESTIMATES.grade.usd).toBe(0.01);
    expect(BLUEPRINT_ESTIMATES.plan.usd).toBe(0.075);
  });

  it('추정과 실측을 같은 줄에 놓는다', () => {
    expect(text).toContain('추정');
    expect(text).toContain('실측');
  });

  it('추정이 크게 빗나가면 배율로 드러낸다', () => {
    // plan 은 추정 $0.075 인데 실측 $0.3 — 4배다
    expect(text).toMatch(/4\.0×|4\.00×|×4/);
  });

  it('엔드포인트별·일자별 절을 모두 낸다', () => {
    expect(text).toContain('엔드포인트별');
    expect(text).toContain('일자별');
  });

  it('캐시 적중률·지연·실패율을 낸다', () => {
    expect(text).toContain('캐시');
    expect(text).toContain('p95');
    expect(text).toContain('실패');
  });

  it('가격표 기준일을 머리글에 밝힌다', () => {
    expect(text).toContain('2026-06');
  });

  it('가격표가 오래되면 경고한다', () => {
    const stale = formatReport(summarize(records), { now: new Date('2027-06-01T00:00:00Z') });
    expect(stale).toMatch(/가격표.*(오래|개월)/);
  });

  it('깨진 줄이 있었다면 몇 줄을 버렸는지 밝힌다', () => {
    const withSkips = formatReport(summarize(records), {
      now: new Date('2026-09-04T00:00:00Z'),
      skipped: [{ line: 3, reason: 'JSON 이 아닙니다' }],
    });
    expect(withSkips).toMatch(/건너뛴 줄.*1|1.*건너뛰/);
  });

  it('비용을 모르는 기록이 있으면 하한을 함께 밝힌다', () => {
    const partial = formatReport(summarize([rec(), rec({ costUsd: null, outputTokens: null })]), {
      now: new Date('2026-09-04T00:00:00Z'),
    });
    expect(partial).toMatch(/모름|하한/);
  });
});

describe('CLI — 파일에서 읽어 리포트를 낸다', () => {
  const dirs = [];
  const workdir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-report-'));
    dirs.push(dir);
    return dir;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('JSONL 파일을 읽어 stdout 으로 낸다', () => {
    const dir = workdir();
    const file = join(dir, 'usage.jsonl');
    writeFileSync(file, `${jsonl(rec(), rec({ endpoint: 'plan', costUsd: 0.08 }))}\n`, 'utf8');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(main([file])).toBe(0);

    const text = log.mock.calls.map(([line]) => line).join('\n');
    expect(text).toContain('기록 2건');
    expect(text).toContain('엔드포인트별');
  });

  it('--json 은 집계를 그대로 JSON 으로 낸다', () => {
    const dir = workdir();
    const file = join(dir, 'usage.jsonl');
    writeFileSync(file, `${jsonl(rec())}\n`, 'utf8');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(main([file, '--json'])).toBe(0);

    const parsed = JSON.parse(log.mock.calls[0][0]);
    expect(parsed.totals.calls).toBe(1);
    expect(parsed.skipped).toEqual([]);
  });

  it('--out 은 파일로 쓴다', () => {
    const dir = workdir();
    const file = join(dir, 'usage.jsonl');
    const out = join(dir, 'report.txt');
    writeFileSync(file, `${jsonl(rec())}\n`, 'utf8');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(main([file, '--out', out])).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('AI 사용량·비용 리포트');
  });

  it('없는 파일을 주면 던지지 않고 1 로 끝난다', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(main([join(workdir(), 'nope.jsonl')])).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('입력을 읽지 못했습니다'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 무료 라우팅(OpenRouter) 전환 (2026-09-07)
//
// 무료 모델이면 비용이 전부 $0 이라 비용 표가 무의미해진다. 그때 실질 제약은
// **호출 수와 한도**다 — 분당 20회, 무입금 계정 하루 50회(누적 $10 결제 이력이 있으면 1,000회).
// 리포트가 비용만 보여 주면 사용자는 무엇에 막혔는지 알 수 없다.
// ─────────────────────────────────────────────────────────────────────────────

const FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const PAID_OPENROUTER_MODEL = 'deepseek/deepseek-chat';

/** 무료 모델 기록 하나 (비용은 아는 값 0) */
const freeRec = (overrides = {}) =>
  rec({ model: FREE_MODEL, provider: 'openrouter', costUsd: 0, ...overrides });

const at = (iso) => ({ ts: iso });

describe('summarize — 모델별·경로별 분해', () => {
  const summary = summarize([
    rec(),
    freeRec({ endpoint: 'grade' }),
    freeRec({ endpoint: 'grade', ok: false, errorCode: 'RATE_LIMITED' }),
  ]);

  it('모델별로 나눈다', () => {
    expect(Object.keys(summary.byModel).sort()).toEqual(['claude-opus-5', FREE_MODEL]);
    expect(summary.byModel[FREE_MODEL].calls).toBe(2);
    expect(summary.byModel['claude-opus-5'].calls).toBe(1);
    expect(summary.byModel['claude-opus-5'].costUsd).toBe(0.035);
  });

  it('모델별 실패율도 따로 센다 (무료 모델은 429 가 곧 한도다)', () => {
    expect(summary.byModel[FREE_MODEL].failureRate).toBe(0.5);
    expect(summary.byModel[FREE_MODEL].errorCodes).toEqual({ RATE_LIMITED: 1 });
  });

  it('경로별로도 나눈다', () => {
    expect(Object.keys(summary.byProvider).sort()).toEqual(['anthropic', 'openrouter']);
    expect(summary.byProvider.openrouter.calls).toBe(2);
    expect(summary.byProvider.anthropic.calls).toBe(1);
  });

  it('기록에 provider 가 없는 옛 로그도 모델 id 로 경로를 알아낸다', () => {
    const old = summarize([rec({ model: FREE_MODEL, provider: undefined, costUsd: 0 })]);
    expect(Object.keys(old.byProvider)).toEqual(['openrouter']);
  });
});

describe('summarize — 무료 모델의 $0 은 아는 값이다', () => {
  it('총액을 아는 기록으로 센다 (모름으로 세지 않는다)', () => {
    const summary = summarize([freeRec()]);

    expect(summary.totals.costUsd).toBe(0);
    expect(summary.totals.costKnownCalls).toBe(1);
    expect(summary.totals.costUnknownCalls).toBe(0);
    expect(summary.totals.avgCostUsd).toBe(0);
  });

  it('무료 모델은 "가격표에 없는 모델" 이 아니다', () => {
    expect(summarize([freeRec()]).unknownModels).toEqual([]);
  });

  it('무료가 아닌 OpenRouter 모델은 가격표에 없는 모델로 센다 (0 으로 접지 않는다)', () => {
    const summary = summarize([rec({ model: PAID_OPENROUTER_MODEL, costUsd: null })]);

    expect(summary.unknownModels).toEqual([PAID_OPENROUTER_MODEL]);
    expect(summary.totals.costUnknownCalls).toBe(1);
    expect(summary.totals.costUsd).toBe(0); // 아는 기록이 없어 합계가 0 일 뿐
    expect(summary.totals.avgCostUsd).toBeNull(); // 평균은 모름 — $0 이 아니다
  });

  it('기록이 costUsd 를 안 들고 와도 무료 모델이면 0 이다', () => {
    // 0 짜리 표에서는 총액이 흔들릴 여지가 없다 — 우리가 아는 유일한 답이 0 이다.
    const summary = summarize([freeRec({ costUsd: null, outputTokens: null })]);

    expect(summary.totals.costUsd).toBe(0);
    expect(summary.totals.costKnownCalls).toBe(1);
    expect(summary.totals.costUnknownCalls).toBe(0);
  });

  it('유료 모델의 costUsd 누락은 여전히 모름이다 (되계산하지 않는다)', () => {
    const summary = summarize([rec({ costUsd: null })]);
    expect(summary.totals.costKnownCalls).toBe(0);
    expect(summary.totals.avgCostUsd).toBeNull();
  });

  it('무료 호출 수를 따로 센다', () => {
    const summary = summarize([freeRec(), freeRec(), rec()]);
    expect(summary.totals.freeCalls).toBe(2);
    expect(summary.byEndpoint.tutor.freeCalls).toBe(2);
  });
});

describe('summarize — 무료 한도 소진', () => {
  it('날짜별 무료 호출 수를 센다', () => {
    const summary = summarize([
      freeRec(at('2026-09-04T01:00:00.000Z')),
      freeRec(at('2026-09-04T02:00:00.000Z')),
      freeRec(at('2026-09-04T16:00:00.000Z')), // 한국 시간으로는 다음 날
      rec(at('2026-09-04T03:00:00.000Z')), // 유료는 한도와 무관하다
    ]);

    expect(summary.freeQuota.calls).toBe(3);
    expect(summary.freeQuota.byDate).toEqual({ '2026-09-04': 2, '2026-09-05': 1 });
  });

  it('60초 창에서 가장 많이 부른 횟수를 잰다 (분당 한도가 실제 병목이다)', () => {
    const summary = summarize([
      freeRec(at('2026-09-04T01:00:00.000Z')),
      freeRec(at('2026-09-04T01:00:20.000Z')),
      freeRec(at('2026-09-04T01:00:50.000Z')),
      freeRec(at('2026-09-04T01:02:00.000Z')), // 창 밖
    ]);

    expect(summary.freeQuota.peakPerMinute).toBe(3);
  });

  it('무료 기록이 없으면 0 이고 던지지 않는다', () => {
    const summary = summarize([rec()]);
    expect(summary.freeQuota).toEqual({ calls: 0, byDate: {}, peakPerMinute: 0 });
  });

  it('기록이 아예 없어도 빈 한도 집계를 낸다', () => {
    expect(summarize([]).freeQuota.calls).toBe(0);
  });
});

describe('formatReport — 무료 모델이면 비용 대신 호출 수·한도를 보여 준다', () => {
  const now = new Date('2026-09-04T00:00:00Z');
  const freeOnly = formatReport(
    summarize([
      freeRec(),
      freeRec(),
      freeRec({ ok: false, errorCode: 'RATE_LIMITED' }),
    ]),
    { now }
  );

  it('비용이 아니라 호출 수가 제약이라고 말한다', () => {
    expect(freeOnly).toContain('무료');
    expect(freeOnly).toMatch(/호출 수|한도/);
  });

  it('일일 한도 대비 소진율을 낸다', () => {
    expect(freeOnly).toContain('3/50');
    expect(freeOnly).toContain('6.0%');
  });

  it('분당 한도도 함께 낸다 (비용이 0 이어도 여기서 막힌다)', () => {
    expect(freeOnly).toMatch(/분당.*20/);
  });

  it('무료 절에서도 실패율을 낸다 (429 가 곧 한도에 걸린 신호다)', () => {
    expect(freeOnly).toContain('RATE_LIMITED');
  });

  it('모델별 표를 낸다', () => {
    expect(freeOnly).toContain('모델별');
    expect(freeOnly).toContain(FREE_MODEL);
  });

  it('한도를 넘긴 날을 눈에 띄게 표시한다', () => {
    const many = summarize(
      Array.from({ length: 51 }, (_, i) =>
        freeRec(at(`2026-09-04T0${Math.floor(i / 30)}:${String(i % 30).padStart(2, '0')}:00.000Z`))
      )
    );
    const text = formatReport(many, { now });

    expect(text).toContain('51/50');
    expect(text).toMatch(/한도 초과/);
  });

  it('결제 이력이 있으면 한도를 1,000 으로 바꿀 수 있다', () => {
    const text = formatReport(summarize([freeRec()]), { now, freeDailyLimit: 1_000 });
    expect(text).toContain('1/1000');
    expect(text).not.toContain('1/50');
  });

  it('무료 기록이 없으면 무료 절을 내지 않는다 (없는 제약을 말하지 않는다)', () => {
    const paidOnly = formatReport(summarize([rec()]), { now });
    expect(paidOnly).not.toContain('무료 모델');
  });

  it('무료와 유료가 섞이면 둘 다 보여 준다', () => {
    const mixed = formatReport(summarize([rec(), freeRec(), rec({ costUsd: 0.02 })]), { now });

    expect(mixed).toContain('무료');
    expect(mixed).toContain('1/50'); // 무료는 1건만
    expect(mixed).toContain('모델별');
    expect(mixed).toContain('claude-opus-5');
  });
});

describe('formatReport — 캐시 적중률의 세 가지 상태를 가른다', () => {
  const now = new Date('2026-09-04T00:00:00Z');

  it('캐시 항목을 한 번도 못 받았으면 "측정 불가" 다 (0% 가 아니다)', () => {
    // OpenRouter 는 cached_tokens 를 줄 수도 안 줄 수도 있고 cacheCreation 은 아예 모른다.
    const text = formatReport(
      summarize([freeRec({ cacheReadTokens: null, cacheCreationTokens: null })]),
      { now }
    );
    expect(text).toMatch(/캐시 적중률 측정 불가|적중률[^\n]*측정 불가/);
  });

  it('캐시읽기가 아는 0 이면 "적중 0%" 다 (측정 불가가 아니다)', () => {
    const text = formatReport(
      summarize([freeRec({ inputTokens: 5_000, cacheReadTokens: 0 })]),
      { now }
    );
    expect(text).toContain('0.0%');
    expect(text).not.toMatch(/캐시 적중률 측정 불가/);
  });

  it('집계가 두 상태를 구분해 셀 수 있게 표본 수를 남긴다', () => {
    const summary = summarize([
      freeRec({ cacheReadTokens: null, cacheCreationTokens: null }),
      freeRec({ cacheReadTokens: 0, cacheCreationTokens: 0 }),
    ]);

    expect(summary.totals.tokenSamples.cacheReadTokens).toBe(1); // 값을 준 기록만
    expect(summary.totals.tokenSamples.cacheCreationTokens).toBe(1);
    expect(summary.totals.cacheHitSamples).toBe(1);
  });
});

describe('CLI — 무료 일일 한도 옵션', () => {
  const dirs = [];
  const workdir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-report-free-'));
    dirs.push(dir);
    return dir;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('--free-daily-limit 로 한도를 바꾼다', () => {
    const dir = workdir();
    const file = join(dir, 'usage.jsonl');
    writeFileSync(file, `${jsonl(freeRec())}\n`, 'utf8');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(main([file, '--free-daily-limit', '1000'])).toBe(0);

    const text = log.mock.calls.map(([line]) => line).join('\n');
    expect(text).toContain('1/1000');
  });

  it('한도를 읽을 수 없으면 기본값(50)으로 돌아간다', () => {
    const dir = workdir();
    const file = join(dir, 'usage.jsonl');
    writeFileSync(file, `${jsonl(freeRec())}\n`, 'utf8');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(main([file, '--free-daily-limit', 'many'])).toBe(0);
    expect(log.mock.calls.map(([line]) => line).join('\n')).toContain('1/50');
  });
});

describe('회귀 — Anthropic 만 있는 리포트의 수치는 그대로다', () => {
  const records = [
    rec({ ts: '2026-09-03T01:00:00.000Z', endpoint: 'tutor', latencyMs: 1_000 }),
    rec({ ts: '2026-09-03T02:00:00.000Z', endpoint: 'grade', latencyMs: 2_000, costUsd: 0.01 }),
    rec({ ts: '2026-09-04T03:00:00.000Z', endpoint: 'plan', latencyMs: 9_000, costUsd: 0.08 }),
  ];
  const summary = summarize(records);

  it('합계·평균·적중률·백분위가 확장 전과 같다', () => {
    expect(summary.totals.calls).toBe(3);
    expect(summary.totals.costUsd).toBeCloseTo(0.125, 10);
    expect(summary.totals.costKnownCalls).toBe(3);
    expect(summary.totals.cacheHitRate).toBeCloseTo(30_000 / 33_000, 10);
    expect(summary.totals.latency.p50).toBe(2_000);
    expect(summary.totals.latency.p95).toBe(9_000);
    expect(summary.span).toEqual({ from: '2026-09-03', to: '2026-09-04' });
  });

  it('무료 관련 수치는 전부 0 이고 무료 절이 나오지 않는다', () => {
    expect(summary.totals.freeCalls).toBe(0);
    expect(summary.freeQuota.calls).toBe(0);
    const text = formatReport(summary, { now: new Date('2026-09-04T00:00:00Z') });
    expect(text).not.toContain('무료 모델');
    expect(text).toContain('블루프린트');
  });
});

describe('formatReport — 표의 비용 칸이 "모름" 을 $0 으로 보이게 하지 않는다', () => {
  const now = new Date('2026-09-04T00:00:00Z');
  // 모델 이름은 머리글 경고에도 나온다 — 표의 줄은 마지막 등장이다.
  const rowFor = (text, needle) =>
    text
      .split('\n')
      .filter((line) => line.includes(needle))
      .at(-1);

  it('총액을 아는 기록이 없으면 $0 이 아니라 모름으로 적는다', () => {
    // 무료의 $0 과 나란히 놓이면 유료 호출의 "모름" 이 공짜처럼 보인다 — 가장 나쁜 오독이다.
    const text = formatReport(summarize([rec({ model: PAID_OPENROUTER_MODEL, costUsd: null })]), {
      now,
    });
    const row = rowFor(text, PAID_OPENROUTER_MODEL);

    expect(row).toContain('모름');
    expect(row).not.toContain('$0');
  });

  it('무료 모델의 $0 은 그대로 $0 이다 (아는 값이다)', () => {
    const row = rowFor(formatReport(summarize([freeRec()]), { now }), FREE_MODEL);

    expect(row).toContain('$0');
    expect(row).not.toContain('모름');
  });

  it('아는 기록과 모르는 기록이 섞이면 하한임을 표시한다', () => {
    const text = formatReport(summarize([rec(), rec({ costUsd: null, outputTokens: null })]), {
      now,
    });
    const row = text.split('\n').find((line) => line.startsWith('  tutor'));

    expect(row).toContain('$0.0350+');
  });
});
