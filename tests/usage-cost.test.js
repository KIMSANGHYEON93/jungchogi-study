// lib/ai/usage.js — 비용 계산의 단일 진실 원천 (블루프린트 §5 Phase 5 · §6).
//
// 여기서 못 박는 것:
//   1. 가격표는 **모델 id 로 키를 잡는다.** 모르는 모델이면 계산을 거부한다 —
//      조용히 틀린 비용을 보고하는 것이 가장 나쁘다.
//   2. **"모름" 과 "0" 은 다르다.** usage 필드가 없으면 0 으로 때우지 않고 null 로 남긴다.
//      하나라도 모르면 총액(usd)은 null 이고, 아는 항목만 더한 하한(usdAtLeast)만 준다.
//   3. 가격 상수는 이 테스트가 값 그대로 박아 둔다. 가격표를 고치면 여기가 깨져서
//      "가격이 바뀌었다" 는 사실이 CI 에 드러난다.
//
// API 키가 필요 없는 순수 계산이다.

import { describe, it, expect } from 'vitest';

import {
  PRICING,
  PRICING_AS_OF,
  PRICING_SOURCE,
  BATCH_MULTIPLIER,
  DEFAULT_MODEL,
  FREE_PRICING,
  PROVIDERS,
  OPENROUTER_FREE_LIMITS,
  OPENROUTER_MODELS_ENDPOINT,
  providerForModel,
  isFreeModel,
  priceTableFor,
  toUsdPerMillion,
  normalizeUsage,
  calculateCost,
  pricingAgeMonths,
} from '../lib/ai/usage.js';

const MODEL = 'claude-opus-5';

/** SDK 가 주는 usage 모양 (snake_case) */
const sdkUsage = (overrides = {}) => ({
  input_tokens: 1_000,
  output_tokens: 500,
  cache_read_input_tokens: 10_000,
  cache_creation_input_tokens: 2_000,
  ...overrides,
});

describe('가격표 — 2026-06 기준 Claude Opus 5', () => {
  it('$/1M 토큰 네 항목을 값 그대로 고정한다', () => {
    expect(PRICING[MODEL]).toEqual({
      input: 5.0,
      output: 25.0,
      cacheRead: 0.5,
      cacheWrite: 6.25,
    });
  });

  it('캐시 읽기는 입력의 0.1배, 캐시 쓰기는 1.25배다', () => {
    const p = PRICING[MODEL];
    expect(p.cacheRead).toBeCloseTo(p.input * 0.1, 10);
    expect(p.cacheWrite).toBeCloseTo(p.input * 1.25, 10);
  });

  it('Batch 할인은 0.5배다', () => {
    expect(BATCH_MULTIPLIER).toBe(0.5);
  });

  it('기준일과 출처를 코드가 들고 있다 (수치의 출처를 따라갈 수 있게)', () => {
    expect(PRICING_AS_OF).toBe('2026-06');
    expect(PRICING_SOURCE).toMatch(/https?:\/\//);
  });

  it('기본 모델은 앱이 실제로 쓰는 모델과 같다', () => {
    expect(DEFAULT_MODEL).toBe(MODEL);
    expect(PRICING).toHaveProperty(DEFAULT_MODEL);
  });

  it('가격표의 나이를 개월 수로 알려 준다 (오래되면 리포트가 경고한다)', () => {
    expect(pricingAgeMonths(new Date('2026-06-15T00:00:00Z'))).toBe(0);
    expect(pricingAgeMonths(new Date('2026-09-04T00:00:00Z'))).toBe(3);
    expect(pricingAgeMonths(new Date('2027-06-01T00:00:00Z'))).toBe(12);
  });
});

describe('normalizeUsage — SDK usage 를 계약 필드로 옮긴다', () => {
  it('네 항목을 모두 읽는다', () => {
    expect(normalizeUsage(sdkUsage())).toMatchObject({
      inputTokens: 1_000,
      outputTokens: 500,
      cacheReadTokens: 10_000,
      cacheCreationTokens: 2_000,
      unknownFields: [],
      coercedFields: [],
    });
  });

  it('명시된 0 은 "0" 이지 "모름" 이 아니다', () => {
    const tally = normalizeUsage(
      sdkUsage({ cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
    );
    expect(tally.cacheReadTokens).toBe(0);
    expect(tally.cacheCreationTokens).toBe(0);
    expect(tally.unknownFields).toEqual([]);
  });

  it('없는 필드는 0 이 아니라 null 이고 unknownFields 에 이름이 남는다', () => {
    const tally = normalizeUsage({ input_tokens: 100 });
    expect(tally.inputTokens).toBe(100);
    expect(tally.outputTokens).toBeNull();
    expect(tally.cacheReadTokens).toBeNull();
    expect(tally.cacheCreationTokens).toBeNull();
    expect(tally.unknownFields.sort()).toEqual([
      'cacheCreationTokens',
      'cacheReadTokens',
      'outputTokens',
    ]);
  });

  it('usage 자체가 없으면 네 항목 전부 모름이다', () => {
    for (const missing of [undefined, null, 'nope', 42, []]) {
      const tally = normalizeUsage(missing);
      expect(tally.inputTokens).toBeNull();
      expect(tally.unknownFields).toHaveLength(4);
    }
  });

  it('usage 필드가 null 이면 모름으로 다룬다', () => {
    const tally = normalizeUsage(sdkUsage({ output_tokens: null }));
    expect(tally.outputTokens).toBeNull();
    expect(tally.unknownFields).toEqual(['outputTokens']);
  });

  it('문자열로 온 숫자는 받아들이되 coercedFields 에 기록한다', () => {
    const tally = normalizeUsage({
      input_tokens: '1200',
      output_tokens: '0',
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(tally.inputTokens).toBe(1_200);
    expect(tally.outputTokens).toBe(0);
    expect(tally.unknownFields).toEqual([]);
    expect(tally.coercedFields.sort()).toEqual(['inputTokens', 'outputTokens']);
  });

  it('숫자가 아닌 문자열은 모름이다 (0 으로 때우지 않는다)', () => {
    const tally = normalizeUsage(sdkUsage({ input_tokens: 'many' }));
    expect(tally.inputTokens).toBeNull();
    expect(tally.unknownFields).toEqual(['inputTokens']);
  });

  it('음수·NaN·Infinity 는 모름으로 막는다', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, -0.5]) {
      const tally = normalizeUsage(sdkUsage({ output_tokens: bad }));
      expect(tally.outputTokens).toBeNull();
      expect(tally.unknownFields).toEqual(['outputTokens']);
    }
  });

  it('camelCase 로 온 기록(프론트 원장)도 그대로 읽는다', () => {
    const tally = normalizeUsage({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheCreationTokens: 40,
    });
    expect(tally).toMatchObject({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheCreationTokens: 40,
      unknownFields: [],
    });
  });
});

describe('calculateCost — 네 항목 조합', () => {
  const cost = (usage, options) => calculateCost(normalizeUsage(usage), options);

  it('네 항목을 각각의 단가로 더한다', () => {
    // 1000·5 + 500·25 + 10000·0.5 + 2000·6.25 (모두 /1e6)
    const result = cost(sdkUsage(), { model: MODEL });
    expect(result.usd).toBeCloseTo(0.005 + 0.0125 + 0.005 + 0.0125, 10);
    expect(result.usd).toBe(0.035);
    expect(result.known).toBe(true);
    expect(result.warning).toBeNull();
  });

  it('토큰이 전부 0 이면 비용도 0 이다 (null 이 아니다)', () => {
    const result = cost(
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      { model: MODEL }
    );
    expect(result.usd).toBe(0);
    expect(result.known).toBe(true);
  });

  it('캐시 읽기만 있는 경우 (캐시 100% 적중)', () => {
    const result = cost(
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 20_000,
        cache_creation_input_tokens: 0,
      },
      { model: MODEL }
    );
    expect(result.usd).toBe(0.01);
  });

  it('캐시 쓰기만 있는 경우 (첫 호출)', () => {
    const result = cost(
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 16_000,
      },
      { model: MODEL }
    );
    expect(result.usd).toBe(0.1);
  });

  it('Batch 는 전체에 0.5배를 건다', () => {
    const plain = cost(sdkUsage(), { model: MODEL });
    const batch = cost(sdkUsage(), { model: MODEL, batch: true });
    expect(batch.usd).toBe(plain.usd * 0.5);
    expect(batch.batch).toBe(true);
    expect(plain.batch).toBe(false);
  });

  it('모델 인자를 생략하면 기본 모델로 계산한다', () => {
    expect(cost(sdkUsage(), {}).usd).toBe(0.035);
    expect(cost(sdkUsage()).model).toBe(DEFAULT_MODEL);
  });

  it('아주 큰 토큰 수도 정밀도를 잃지 않는다', () => {
    const result = cost(
      {
        input_tokens: 1_000_000_000,
        output_tokens: 1_000_000_000,
        cache_read_input_tokens: 1_000_000_000,
        cache_creation_input_tokens: 1_000_000_000,
      },
      { model: MODEL }
    );
    expect(result.usd).toBe(5_000 + 25_000 + 500 + 6_250);
    expect(Number.isFinite(result.usd)).toBe(true);
  });

  it('아주 작은 비용도 0 으로 뭉개지 않는다', () => {
    const result = cost(
      {
        input_tokens: 1,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      { model: MODEL }
    );
    expect(result.usd).toBe(0.000005);
    expect(result.usd).toBeGreaterThan(0);
  });

  it('부동소수 잔재를 남기지 않는다 (0.30000000000000004 같은 값)', () => {
    const result = cost(
      {
        input_tokens: 3,
        output_tokens: 3,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 3,
      },
      { model: MODEL }
    );
    expect(String(result.usd)).not.toMatch(/0{6}\d|9{6}\d/);
  });
});

describe('calculateCost — 모르는 모델', () => {
  it('가격표에 없는 모델이면 계산을 거부한다', () => {
    const result = calculateCost(normalizeUsage(sdkUsage()), { model: 'claude-opus-6' });
    expect(result.usd).toBeNull();
    expect(result.usdAtLeast).toBeNull();
    expect(result.known).toBe(false);
    expect(result.warning).toBe('UNKNOWN_MODEL');
    expect(result.model).toBe('claude-opus-6');
  });

  it('모델 id 가 비어 있어도 조용히 기본 모델로 넘어가지 않는다', () => {
    for (const bad of ['', '   ', null, 123]) {
      const result = calculateCost(normalizeUsage(sdkUsage()), { model: bad });
      expect(result.usd).toBeNull();
      expect(result.warning).toBe('UNKNOWN_MODEL');
    }
  });

  it('경고에 기준일을 함께 실어 어떤 가격표로 판단했는지 남긴다', () => {
    const result = calculateCost(normalizeUsage(sdkUsage()), { model: 'claude-opus-6' });
    expect(result.pricingAsOf).toBe(PRICING_AS_OF);
  });
});

describe('calculateCost — usage 가 일부만 오거나 아예 없을 때', () => {
  it('한 항목이라도 모르면 총액은 null 이다 (과소보고 방지)', () => {
    const result = calculateCost(normalizeUsage({ input_tokens: 1_000 }), { model: MODEL });
    expect(result.usd).toBeNull();
    expect(result.known).toBe(false);
    expect(result.warning).toBe('PARTIAL_USAGE');
  });

  it('아는 항목만 더한 하한을 함께 준다 ("최소 이만큼은 썼다")', () => {
    const result = calculateCost(
      normalizeUsage({ input_tokens: 1_000, output_tokens: 500 }),
      { model: MODEL }
    );
    expect(result.usdAtLeast).toBe(0.0175);
    expect(result.usd).toBeNull();
    expect(result.unknownFields.sort()).toEqual(['cacheCreationTokens', 'cacheReadTokens']);
  });

  it('usage 가 통째로 없으면 하한도 0 이고 NO_USAGE 로 표시한다', () => {
    const result = calculateCost(normalizeUsage(undefined), { model: MODEL });
    expect(result.usd).toBeNull();
    expect(result.usdAtLeast).toBe(0);
    expect(result.warning).toBe('NO_USAGE');
    expect(result.unknownFields).toHaveLength(4);
  });

  it('모르는 모델 경고가 usage 누락 경고보다 앞선다', () => {
    const result = calculateCost(normalizeUsage(undefined), { model: 'claude-opus-6' });
    expect(result.warning).toBe('UNKNOWN_MODEL');
  });

  it('문자열 숫자를 받아들인 사실을 비용 객체에도 남긴다', () => {
    const result = calculateCost(
      normalizeUsage({
        input_tokens: '1000',
        output_tokens: 500,
        cache_read_input_tokens: 10_000,
        cache_creation_input_tokens: 2_000,
      }),
      { model: MODEL }
    );
    expect(result.usd).toBe(0.035);
    expect(result.coercedFields).toEqual(['inputTokens']);
  });

  it('tally 대신 원시 usage 를 그대로 줘도 같은 결과를 낸다', () => {
    expect(calculateCost(sdkUsage(), { model: MODEL }).usd).toBe(0.035);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 프로바이더 확장 (2026-09-07) — 무료 라우팅(OpenRouter)으로 갈아타면서.
//
// 여기서 못 박는 것 하나 더:
//   4. **무료 모델의 0 은 "아는 값 0" 이다.** `:free` 접미사가 붙은 OpenRouter 모델은
//      단가가 0 이라는 것을 우리가 안다 — `usd: 0` · `known: true` 로 나와야 한다.
//      반대로 무료가 아닌 OpenRouter 모델은 단가를 모르므로 **0 으로 접지 않고 거부**한다.
//      이 둘을 섞으면 유료 호출의 비용이 조용히 $0 으로 사라진다.
// ─────────────────────────────────────────────────────────────────────────────

const FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const PAID_OPENROUTER_MODEL = 'deepseek/deepseek-chat';

describe('가격표 — 무료 모델의 0 도 값 그대로 고정한다', () => {
  it('무료 단가 네 항목이 모두 0 이다 (모름이 아니라 0)', () => {
    expect(FREE_PRICING).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it('프로바이더 목록은 둘뿐이다', () => {
    expect(PROVIDERS).toEqual(['anthropic', 'openrouter']);
  });

  it('OpenRouter 무료 한도를 값 그대로 고정한다 (비용이 0 이어도 이게 실질 제약이다)', () => {
    expect(OPENROUTER_FREE_LIMITS).toEqual({
      requestsPerMinute: 20,
      requestsPerDay: 50,
      requestsPerDayWithCredits: 1_000,
      creditsThresholdUsd: 10,
    });
  });

  it('유료 OpenRouter 단가를 어디서 가져오는지 코드가 들고 있다', () => {
    expect(OPENROUTER_MODELS_ENDPOINT).toBe('https://openrouter.ai/api/v1/models');
  });
});

describe('providerForModel — 모델 id 만으로 경로를 판정한다', () => {
  it('슬래시가 없는 id 는 Anthropic 경로다', () => {
    expect(providerForModel('claude-opus-5')).toBe('anthropic');
    expect(providerForModel('  claude-opus-5  ')).toBe('anthropic');
  });

  it('vendor/model 꼴은 OpenRouter 경로다', () => {
    expect(providerForModel(FREE_MODEL)).toBe('openrouter');
    expect(providerForModel(PAID_OPENROUTER_MODEL)).toBe('openrouter');
    expect(providerForModel('anthropic/claude-opus-5')).toBe('openrouter');
  });

  it('id 를 읽을 수 없으면 기본값으로 넘어가지 않고 모름(null)이다', () => {
    for (const bad of ['', '   ', null, undefined, 123, {}]) {
      expect(providerForModel(bad)).toBeNull();
    }
  });
});

describe('isFreeModel — :free 접미사만 무료로 본다', () => {
  it('OpenRouter 의 :free 변형이면 무료다', () => {
    expect(isFreeModel(FREE_MODEL)).toBe(true);
    expect(isFreeModel('deepseek/deepseek-r1:free')).toBe(true);
    expect(isFreeModel(`  ${FREE_MODEL}  `)).toBe(true);
  });

  it('접미사가 없으면 무료가 아니다', () => {
    expect(isFreeModel(PAID_OPENROUTER_MODEL)).toBe(false);
    expect(isFreeModel('meta-llama/llama-3.3-70b-instruct')).toBe(false);
  });

  it('OpenRouter id 꼴이 아닌 이름에 :free 를 붙여도 무료가 아니다', () => {
    // 이름만 바꿔서 유료 모델을 0 원으로 만들 수 있으면 판정 규칙이 무너진다.
    expect(isFreeModel('claude-opus-5:free')).toBe(false);
  });

  it('대소문자를 바꾼 접미사는 인정하지 않는다 (추측하느니 거부한다)', () => {
    expect(isFreeModel('meta-llama/llama-3.3-70b-instruct:FREE')).toBe(false);
  });

  it('id 가 아니면 무료가 아니다', () => {
    for (const bad of ['', '   ', null, undefined, 42]) expect(isFreeModel(bad)).toBe(false);
  });
});

describe('priceTableFor — 단가표를 고르는 단 하나의 규칙', () => {
  it('가격표에 있는 모델은 그 표를 준다', () => {
    expect(priceTableFor(MODEL)).toEqual(PRICING[MODEL]);
    expect(priceTableFor(`  ${MODEL}  `)).toEqual(PRICING[MODEL]);
  });

  it('무료 모델은 0 짜리 표를 준다 (모름이 아니다)', () => {
    expect(priceTableFor(FREE_MODEL)).toEqual(FREE_PRICING);
  });

  it('무료가 아닌 OpenRouter 모델은 모름이다 (표가 없다)', () => {
    expect(priceTableFor(PAID_OPENROUTER_MODEL)).toBeUndefined();
  });

  it('OpenRouter 를 거친 같은 모델도 Anthropic 표에 얹지 않는다', () => {
    // anthropic/claude-opus-5 는 라우팅 수수료가 붙을 수 있고 우리가 그 단가를 모른다.
    expect(priceTableFor('anthropic/claude-opus-5')).toBeUndefined();
  });

  it('Object.prototype 의 이름을 모델 id 로 줘도 표로 오인하지 않는다', () => {
    for (const inherited of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(priceTableFor(inherited)).toBeUndefined();
    }
  });

  it('id 를 읽을 수 없으면 표가 없다', () => {
    expect(priceTableFor('')).toBeUndefined();
    expect(priceTableFor(null)).toBeUndefined();
  });
});

describe('toUsdPerMillion — OpenRouter 단가를 우리 표 단위로 옮긴다', () => {
  it('토큰당 USD 문자열을 $/1M 으로 바꾼다', () => {
    // pricing.prompt = "0.0000005" → $0.5 / 1M
    expect(toUsdPerMillion('0.0000005')).toBe(0.5);
    expect(toUsdPerMillion('0.000003')).toBe(3);
    expect(toUsdPerMillion(0)).toBe(0);
  });

  it('읽을 수 없는 값은 0 이 아니라 null 이다', () => {
    for (const bad of ['', '   ', 'free', null, undefined, -1, Number.NaN, {}]) {
      expect(toUsdPerMillion(bad)).toBeNull();
    }
  });
});

describe('calculateCost — 무료 모델은 아는 값 0 이다', () => {
  const cost = (usage, options) => calculateCost(normalizeUsage(usage), options);

  it('네 항목을 다 알면 $0 이고 경고가 없다', () => {
    const result = cost(sdkUsage(), { model: FREE_MODEL });

    expect(result.usd).toBe(0);
    expect(result.usdAtLeast).toBe(0);
    expect(result.known).toBe(true);
    expect(result.warning).toBeNull();
    expect(result.free).toBe(true);
    expect(result.provider).toBe('openrouter');
  });

  it('토큰을 일부 몰라도 총액은 여전히 아는 값 0 이다 (단가가 0 이면 모르는 토큰도 0 원)', () => {
    const result = cost({ input_tokens: 1_000 }, { model: FREE_MODEL });

    expect(result.usd).toBe(0);
    expect(result.known).toBe(true);
    // 총액은 알지만 usage 가 덜 온 사실은 그대로 남긴다 — 다른 사실이다.
    expect(result.warning).toBe('PARTIAL_USAGE');
    expect(result.unknownFields.sort()).toEqual([
      'cacheCreationTokens',
      'cacheReadTokens',
      'outputTokens',
    ]);
  });

  it('usage 가 통째로 없어도 무료 모델의 총액은 0 이다', () => {
    const result = cost(undefined, { model: FREE_MODEL });
    expect(result.usd).toBe(0);
    expect(result.known).toBe(true);
    expect(result.warning).toBe('NO_USAGE');
  });

  it('Batch 배수를 걸어도 0 은 0 이다', () => {
    expect(cost(sdkUsage(), { model: FREE_MODEL, batch: true }).usd).toBe(0);
  });
});

describe('calculateCost — 무료가 아닌 OpenRouter 모델은 모름이다', () => {
  const result = calculateCost(normalizeUsage(sdkUsage()), { model: PAID_OPENROUTER_MODEL });

  it('0 으로 접지 않고 계산을 거부한다', () => {
    expect(result.usd).toBeNull();
    expect(result.usd).not.toBe(0);
    expect(result.usdAtLeast).toBeNull();
    expect(result.known).toBe(false);
    expect(result.warning).toBe('UNKNOWN_MODEL');
  });

  it('무료가 아니라는 사실과 경로는 그래도 남긴다', () => {
    expect(result.free).toBe(false);
    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe(PAID_OPENROUTER_MODEL);
  });
});

describe('calculateCost — Anthropic 계산은 한 푼도 바뀌지 않는다 (회귀)', () => {
  it('네 항목 조합·Batch·하한이 확장 전 값 그대로다', () => {
    const full = calculateCost(normalizeUsage(sdkUsage()), { model: MODEL });
    expect(full.usd).toBe(0.035);
    expect(full.usdAtLeast).toBe(0.035);
    expect(full.known).toBe(true);
    expect(full.warning).toBeNull();

    const batch = calculateCost(normalizeUsage(sdkUsage()), { model: MODEL, batch: true });
    expect(batch.usd).toBe(0.0175);

    const partial = calculateCost(normalizeUsage({ input_tokens: 1_000, output_tokens: 500 }), {
      model: MODEL,
    });
    expect(partial.usd).toBeNull();
    expect(partial.usdAtLeast).toBe(0.0175);
    expect(partial.warning).toBe('PARTIAL_USAGE');
  });

  it('유료 모델은 free 가 false 이고 경로는 anthropic 이다', () => {
    const result = calculateCost(normalizeUsage(sdkUsage()), { model: MODEL });
    expect(result.free).toBe(false);
    expect(result.provider).toBe('anthropic');
  });

  it('모르는 Anthropic 모델은 여전히 거부한다 (무료 규칙이 새지 않는다)', () => {
    const result = calculateCost(normalizeUsage(sdkUsage()), { model: 'claude-opus-6' });
    expect(result.usd).toBeNull();
    expect(result.warning).toBe('UNKNOWN_MODEL');
    expect(result.free).toBe(false);
  });

  it('모델 id 를 읽을 수 없으면 경로도 모름이다', () => {
    const result = calculateCost(normalizeUsage(sdkUsage()), { model: '' });
    expect(result.warning).toBe('UNKNOWN_MODEL');
    expect(result.provider).toBeNull();
  });

  it('호출부가 경로를 알려 주면 그 값을 쓴다 (추론보다 우선)', () => {
    const result = calculateCost(normalizeUsage(sdkUsage()), {
      model: MODEL,
      provider: 'openrouter',
    });
    expect(result.provider).toBe('openrouter');
    // 단가 판정은 여전히 모델 id 로만 한다 — 경로를 바꿔도 값이 흔들리지 않는다.
    expect(result.usd).toBe(0.035);
  });

  it('계약 밖 경로 값은 무시하고 모델 id 로 추론한다', () => {
    const result = calculateCost(normalizeUsage(sdkUsage()), { model: MODEL, provider: 'groq' });
    expect(result.provider).toBe('anthropic');
  });
});
