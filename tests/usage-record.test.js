// 사용 기록의 **고정 계약** (블루프린트 §5 Phase 5).
//
// 프론트 원장(`src/utils/usageLedger.js`)·서버 로그·리포트 스크립트가 모두 이 모양을
// 공유한다. 임의로 필드를 늘리거나 이름을 바꾸면 세 곳이 한꺼번에 어긋나므로
// 여기서 **키 집합 자체**를 못 박는다.
//
//   { ts, endpoint, model, provider, effort,
//     inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
//     costUsd, latencyMs, ok, errorCode }
//
// `provider` 는 2026-09-07(무료 라우팅 전환)에 **더한** 항목이다. 기존 열둘은 이름도 뜻도
// 그대로다 — 프론트 원장은 화이트리스트로 읽어 모르는 항목을 버리므로 더하기만 하면 안전하다.
//
// 그리고 하나 더 — **개인 학습 데이터는 여기에 들어오지 못한다.**
// 기록은 열거된 항목만으로 조립되므로 답안·문항 내용은 구조적으로 새어 나갈 수 없다.

import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  buildUsageRecord,
  logUsage,
  toCostPayload,
  USAGE_RECORD_FIELDS,
} from '../lib/ai/usage.js';

const USAGE = {
  input_tokens: 1_000,
  output_tokens: 500,
  cache_read_input_tokens: 10_000,
  cache_creation_input_tokens: 2_000,
};

const args = (overrides = {}) => ({
  endpoint: 'tutor',
  model: 'claude-opus-5',
  effort: 'low',
  usage: USAGE,
  latencyMs: 1_234,
  ok: true,
  errorCode: null,
  ts: '2026-09-04T12:00:00.000Z',
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildUsageRecord — 계약된 열세 필드', () => {
  it('계약 그대로의 기록을 만든다', () => {
    const { record } = buildUsageRecord(args());

    expect(record).toEqual({
      ts: '2026-09-04T12:00:00.000Z',
      endpoint: 'tutor',
      model: 'claude-opus-5',
      provider: 'anthropic',
      effort: 'low',
      inputTokens: 1_000,
      outputTokens: 500,
      cacheReadTokens: 10_000,
      cacheCreationTokens: 2_000,
      costUsd: 0.035,
      latencyMs: 1_234,
      ok: true,
      errorCode: null,
    });
  });

  it('키 집합은 계약에 없는 것을 하나도 더하지 않는다', () => {
    const { record } = buildUsageRecord(args());
    expect(Object.keys(record).sort()).toEqual([...USAGE_RECORD_FIELDS].sort());
  });

  it('비용 계산 결과를 기록과 함께 돌려준다 (응답에 실을 cost 객체)', () => {
    const { cost } = buildUsageRecord(args());
    expect(cost).toMatchObject({
      usd: 0.035,
      known: true,
      model: 'claude-opus-5',
      batch: false,
      warning: null,
    });
  });

  it('ts 를 주지 않으면 지금 시각을 ISO 문자열로 찍는다', () => {
    const { record } = buildUsageRecord(args({ ts: undefined }));
    expect(record.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('Date 객체로 준 ts 도 받는다', () => {
    const { record } = buildUsageRecord(args({ ts: new Date('2026-01-02T03:04:05.678Z') }));
    expect(record.ts).toBe('2026-01-02T03:04:05.678Z');
  });
});

describe('buildUsageRecord — "모름" 을 0 으로 때우지 않는다', () => {
  it('usage 가 통째로 없으면 토큰 네 항목과 비용이 모두 null 이다', () => {
    const { record, cost } = buildUsageRecord(args({ usage: undefined }));

    expect(record.inputTokens).toBeNull();
    expect(record.outputTokens).toBeNull();
    expect(record.cacheReadTokens).toBeNull();
    expect(record.cacheCreationTokens).toBeNull();
    expect(record.costUsd).toBeNull();
    expect(cost.warning).toBe('NO_USAGE');
    expect(cost.usdAtLeast).toBe(0);
  });

  it('일부만 와도 총액은 null 이고 아는 항목은 그대로 남는다', () => {
    const { record, cost } = buildUsageRecord(
      args({ usage: { input_tokens: 1_000, output_tokens: 500 } })
    );

    expect(record.inputTokens).toBe(1_000);
    expect(record.cacheReadTokens).toBeNull();
    expect(record.costUsd).toBeNull();
    expect(cost.usdAtLeast).toBe(0.0175);
    expect(cost.warning).toBe('PARTIAL_USAGE');
  });

  it('모르는 모델이면 비용을 null 로 두고 경고한다', () => {
    const { record, cost } = buildUsageRecord(args({ model: 'claude-opus-6' }));

    expect(record.model).toBe('claude-opus-6');
    expect(record.costUsd).toBeNull();
    expect(cost.warning).toBe('UNKNOWN_MODEL');
  });

  it('토큰이 실제로 0 이면 비용도 0 으로 기록한다 (null 이 아니다)', () => {
    const { record } = buildUsageRecord(
      args({
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      })
    );
    expect(record.costUsd).toBe(0);
  });
});

describe('buildUsageRecord — 실패한 요청도 기록한다', () => {
  it('ok:false 와 errorCode 를 남긴다', () => {
    const { record } = buildUsageRecord(
      args({ ok: false, errorCode: 'UPSTREAM', usage: undefined })
    );
    expect(record.ok).toBe(false);
    expect(record.errorCode).toBe('UPSTREAM');
  });

  it('실패했지만 토큰을 쓴 경우도 그대로 계산한다', () => {
    const { record } = buildUsageRecord(args({ ok: false, errorCode: 'UPSTREAM' }));
    expect(record.costUsd).toBe(0.035);
    expect(record.ok).toBe(false);
  });

  it('errorCode 가 문자열이 아니면 null 로 정리한다', () => {
    expect(buildUsageRecord(args({ errorCode: 42 })).record.errorCode).toBeNull();
    expect(buildUsageRecord(args({ errorCode: '' })).record.errorCode).toBeNull();
  });

  it('ok 는 언제나 불리언이다', () => {
    expect(buildUsageRecord(args({ ok: 1 })).record.ok).toBe(true);
    expect(buildUsageRecord(args({ ok: undefined })).record.ok).toBe(false);
  });
});

describe('buildUsageRecord — 값 정리', () => {
  it('endpoint 는 계약된 넷 중 하나여야 한다', () => {
    expect(() => buildUsageRecord(args({ endpoint: 'chat' }))).toThrow(/endpoint/);
    for (const endpoint of ['tutor', 'plan', 'grade', 'generate']) {
      expect(buildUsageRecord(args({ endpoint })).record.endpoint).toBe(endpoint);
    }
  });

  it('effort 는 low|medium|high 아니면 null 이다', () => {
    expect(buildUsageRecord(args({ effort: 'high' })).record.effort).toBe('high');
    expect(buildUsageRecord(args({ effort: 'turbo' })).record.effort).toBeNull();
    expect(buildUsageRecord(args({ effort: undefined })).record.effort).toBeNull();
  });

  it('latencyMs 는 음이 아닌 정수로 조인다', () => {
    expect(buildUsageRecord(args({ latencyMs: 1_234.7 })).record.latencyMs).toBe(1_235);
    expect(buildUsageRecord(args({ latencyMs: -5 })).record.latencyMs).toBe(0);
    expect(buildUsageRecord(args({ latencyMs: 'slow' })).record.latencyMs).toBeNull();
    expect(buildUsageRecord(args({ latencyMs: undefined })).record.latencyMs).toBeNull();
  });

  it('Batch 할인은 비용에만 반영되고 기록의 형태는 그대로다', () => {
    const { record, cost } = buildUsageRecord(args({ endpoint: 'generate', batch: true }));
    expect(record.costUsd).toBe(0.0175);
    expect(cost.batch).toBe(true);
    expect(Object.keys(record).sort()).toEqual([...USAGE_RECORD_FIELDS].sort());
  });
});

describe('buildUsageRecord — 개인 학습 데이터가 새지 않는다', () => {
  it('열거되지 않은 인자는 기록에 들어오지 못한다', () => {
    const { record } = buildUsageRecord({
      ...args(),
      userAnswer: '정규화는 원자값으로 쪼개는 것',
      snapshot: { wrongNotes: [{ id: '002', question: '트랜잭션의 ACID' }] },
      source: 'quiz100',
      id: '002',
    });

    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain('정규화');
    expect(serialized).not.toContain('quiz100');
    expect(serialized).not.toContain('002');
    expect(record).not.toHaveProperty('userAnswer');
    expect(record).not.toHaveProperty('source');
  });
});

describe('logUsage — 기계가 파싱할 한 줄', () => {
  it('stdout 에 JSON 한 줄만 찍는다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { record } = buildUsageRecord(args());

    logUsage(record);

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0];
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual(record);
  });

  it('모르는 모델을 만나면 별도의 경고를 함께 남긴다', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { record, cost } = buildUsageRecord(args({ model: 'claude-opus-6' }));

    logUsage(record, cost);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('claude-opus-6'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('2026-06'));
  });

  it('정상 비용에는 경고를 붙이지 않는다', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { record, cost } = buildUsageRecord(args());

    logUsage(record, cost);

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('toCostPayload — 응답에 싣는 cost 객체', () => {
  it('계약된 열두 필드를 그대로 담는다 (프론트 원장이 이 이름으로 읽는다)', () => {
    const { record, cost } = buildUsageRecord(args());
    const payload = toCostPayload(record, cost);

    for (const field of USAGE_RECORD_FIELDS) {
      expect(payload[field]).toEqual(record[field]);
    }
  });

  it('토큰 수를 함께 실어 원장이 다시 계산하지 않아도 되게 한다', () => {
    const payload = toCostPayload(...Object.values(buildUsageRecord(args())));
    expect(payload.inputTokens).toBe(1_000);
    expect(payload.outputTokens).toBe(500);
    expect(payload.cacheReadTokens).toBe(10_000);
    expect(payload.cacheCreationTokens).toBe(2_000);
  });

  it('가격 판단의 근거를 함께 싣는다', () => {
    const { record, cost } = buildUsageRecord(args());
    const payload = toCostPayload(record, cost);

    expect(payload).toMatchObject({
      usd: 0.035,
      usdAtLeast: 0.035,
      known: true,
      unknownFields: [],
      batch: false,
      pricingAsOf: '2026-06',
      warning: null,
    });
  });

  it('usd 와 costUsd 는 같은 값이다 (이름만 둘)', () => {
    const { record, cost } = buildUsageRecord(args());
    const payload = toCostPayload(record, cost);
    expect(payload.usd).toBe(payload.costUsd);
  });

  it('총액을 모르면 두 이름 모두 null 이고 하한만 값이 있다', () => {
    const { record, cost } = buildUsageRecord(args({ usage: { input_tokens: 1_000 } }));
    const payload = toCostPayload(record, cost);

    expect(payload.costUsd).toBeNull();
    expect(payload.usd).toBeNull();
    expect(payload.usdAtLeast).toBe(0.005);
    expect(payload.warning).toBe('PARTIAL_USAGE');
  });

  it('여기에도 개인 학습 데이터는 없다', () => {
    const { record, cost } = buildUsageRecord(args());
    const serialized = JSON.stringify(toCostPayload(record, cost));

    expect(serialized).not.toContain('quiz100');
    expect(serialized).not.toContain('정규화');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// provider — 어느 경로로 나간 호출인가 (2026-09-07 · 무료 라우팅 전환)
//
// 기록에 모델만 있으면 나중에 로그를 볼 때 그 호출이 Anthropic 으로 갔는지
// OpenRouter 로 갔는지 알 수 없다. 비용이 0 인 호출이 섞이기 시작하면 그 구분이
// 곧 "왜 이 호출은 공짜인가" 의 답이 된다.
// ─────────────────────────────────────────────────────────────────────────────

const FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const PAID_OPENROUTER_MODEL = 'deepseek/deepseek-chat';

describe('buildUsageRecord — 프로바이더를 기록에 남긴다', () => {
  it('계약 항목이 열둘에서 열셋으로 늘었고, 기존 열둘은 이름 그대로다', () => {
    // 더하기만 한다 — 이름을 바꾸거나 빼면 프론트 원장·서버 로그·리포트가 한꺼번에 어긋난다.
    expect(USAGE_RECORD_FIELDS).toContain('provider');
    expect(USAGE_RECORD_FIELDS).toHaveLength(13);
    expect([
      'ts',
      'endpoint',
      'model',
      'effort',
      'inputTokens',
      'outputTokens',
      'cacheReadTokens',
      'cacheCreationTokens',
      'costUsd',
      'latencyMs',
      'ok',
      'errorCode',
    ].every((field) => USAGE_RECORD_FIELDS.includes(field))).toBe(true);
  });

  it('Anthropic 모델은 anthropic 으로 남는다', () => {
    expect(buildUsageRecord(args()).record.provider).toBe('anthropic');
  });

  it('OpenRouter 모델은 openrouter 로 남는다 (무료·유료 모두)', () => {
    expect(buildUsageRecord(args({ model: FREE_MODEL })).record.provider).toBe('openrouter');
    expect(buildUsageRecord(args({ model: PAID_OPENROUTER_MODEL })).record.provider).toBe(
      'openrouter'
    );
  });

  it('호출부가 경로를 알려 주면 그 값을 쓴다', () => {
    const { record } = buildUsageRecord(args({ model: 'claude-opus-5', provider: 'openrouter' }));
    expect(record.provider).toBe('openrouter');
    // 단가는 여전히 모델 id 로 판정한다 — 경로를 바꿔도 비용이 흔들리지 않는다.
    expect(record.costUsd).toBe(0.035);
  });

  it('계약 밖 경로 값은 모델 id 로 되돌린다', () => {
    for (const bad of ['groq', '', null, 7]) {
      expect(buildUsageRecord(args({ provider: bad })).record.provider).toBe('anthropic');
    }
  });

  it('모델 id 를 읽을 수 없으면 경로도 모름(null)이다', () => {
    expect(buildUsageRecord(args({ model: '' })).record.provider).toBeNull();
    expect(buildUsageRecord(args({ model: undefined })).record.provider).toBe('anthropic');
  });

  it('기록의 키 집합은 여전히 계약 목록과 정확히 같다', () => {
    for (const model of [FREE_MODEL, PAID_OPENROUTER_MODEL, '']) {
      const { record } = buildUsageRecord(args({ model }));
      expect(Object.keys(record).sort()).toEqual([...USAGE_RECORD_FIELDS].sort());
    }
  });
});

describe('buildUsageRecord — 무료 모델 기록', () => {
  it('비용을 0 으로 기록한다 (null 이 아니다)', () => {
    const { record, cost } = buildUsageRecord(args({ model: FREE_MODEL }));

    expect(record.costUsd).toBe(0);
    expect(record.provider).toBe('openrouter');
    expect(cost.known).toBe(true);
    expect(cost.free).toBe(true);
    expect(cost.warning).toBeNull();
  });

  it('usage 를 못 받아도 0 이다 — 모르는 토큰도 무료는 무료다', () => {
    const { record, cost } = buildUsageRecord(args({ model: FREE_MODEL, usage: undefined }));

    expect(record.costUsd).toBe(0);
    expect(record.inputTokens).toBeNull(); // 토큰은 여전히 "모름" 이다
    expect(cost.warning).toBe('NO_USAGE');
    expect(cost.known).toBe(true);
  });

  it('토큰은 그대로 남는다 (한도 소진을 세려면 호출 수와 토큰이 필요하다)', () => {
    const { record } = buildUsageRecord(args({ model: FREE_MODEL }));
    expect(record.inputTokens).toBe(1_000);
    expect(record.outputTokens).toBe(500);
  });
});

describe('buildUsageRecord — 유료 OpenRouter 모델 기록', () => {
  it('비용을 0 이 아니라 null 로 남긴다', () => {
    const { record, cost } = buildUsageRecord(args({ model: PAID_OPENROUTER_MODEL }));

    expect(record.costUsd).toBeNull();
    expect(record.costUsd).not.toBe(0);
    expect(cost.warning).toBe('UNKNOWN_MODEL');
    expect(cost.free).toBe(false);
  });
});

describe('logUsage — 모르는 모델 경고는 경로에 맞는 길을 가리킨다', () => {
  it('OpenRouter 모델이면 단가를 어디서 가져오는지 알려 준다', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { record, cost } = buildUsageRecord(args({ model: PAID_OPENROUTER_MODEL }));

    logUsage(record, cost);

    const message = warn.mock.calls[0][0];
    expect(message).toContain(PAID_OPENROUTER_MODEL);
    expect(message).toContain('openrouter.ai/api/v1/models');
  });

  it('무료 모델은 경고 없이 지나간다 (비용이 0 인 것을 안다)', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { record, cost } = buildUsageRecord(args({ model: FREE_MODEL }));

    logUsage(record, cost);

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('toCostPayload — 경로와 무료 여부도 함께 싣는다', () => {
  it('provider 와 free 가 payload 에 있다', () => {
    const { record, cost } = buildUsageRecord(args({ model: FREE_MODEL }));
    const payload = toCostPayload(record, cost);

    expect(payload.provider).toBe('openrouter');
    expect(payload.free).toBe(true);
    expect(payload.costUsd).toBe(0);
    expect(payload.usd).toBe(0);
  });

  it('Anthropic 호출의 payload 값은 확장 전과 같다 (회귀)', () => {
    const { record, cost } = buildUsageRecord(args());
    const payload = toCostPayload(record, cost);

    expect(payload).toMatchObject({
      usd: 0.035,
      costUsd: 0.035,
      usdAtLeast: 0.035,
      known: true,
      unknownFields: [],
      batch: false,
      pricingAsOf: '2026-06',
      warning: null,
      provider: 'anthropic',
      free: false,
    });
  });
});
