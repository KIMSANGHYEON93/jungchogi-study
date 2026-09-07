// usage 매핑 — `lib/ai/providers/usage.js`.
//
// 이 프로젝트의 규칙은 `lib/ai/usage.js` 가 정한 것 하나다:
// **"모름" 과 "0" 은 다르다.** 없는 토큰 수를 0 으로 때우면 비용이 조용히 과소 보고된다.
// 프로바이더 계층은 업스트림 응답을 그 규칙에 맞는 모양으로 옮기기만 한다.

import { describe, it, expect } from 'vitest';
import {
  emptyUsage,
  mapOpenAiUsage,
  mapAnthropicUsage,
  createUsageAccumulator,
  USAGE_TOKEN_FIELDS,
} from '../lib/ai/providers/usage.js';
import { TOKEN_FIELDS } from '../lib/ai/usage.js';

const MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

describe('계약 형태', () => {
  it('토큰 항목 이름이 lib/ai/usage.js 의 계약과 정확히 같다', () => {
    // 이름이 갈리면 비용 계산이 조용히 전부 null 이 된다
    expect([...USAGE_TOKEN_FIELDS]).toEqual([...TOKEN_FIELDS]);
  });

  it('emptyUsage 는 모델만 알고 나머지는 전부 null 이다', () => {
    expect(emptyUsage(MODEL)).toEqual({
      model: MODEL,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheCreationTokens: null,
    });
  });
});

describe('mapOpenAiUsage', () => {
  it('prompt·completion 을 입력·출력으로 옮긴다', () => {
    const usage = mapOpenAiUsage({ prompt_tokens: 1200, completion_tokens: 340 }, MODEL);
    expect(usage.inputTokens).toBe(1200);
    expect(usage.outputTokens).toBe(340);
    expect(usage.model).toBe(MODEL);
  });

  it('prompt_tokens_details.cached_tokens 를 캐시 읽기로 옮긴다', () => {
    const usage = mapOpenAiUsage(
      { prompt_tokens: 1200, completion_tokens: 340, prompt_tokens_details: { cached_tokens: 900 } },
      MODEL
    );
    expect(usage.cacheReadTokens).toBe(900);
  });

  it('캐시 쓰기는 OpenAI 호환 응답에 없다 — 언제나 null 이다', () => {
    const usage = mapOpenAiUsage(
      { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 1 } },
      MODEL
    );
    expect(usage.cacheCreationTokens).toBeNull();
  });

  it('prompt_tokens_details 가 없으면 캐시 읽기는 0 이 아니라 null 이다', () => {
    const usage = mapOpenAiUsage({ prompt_tokens: 10, completion_tokens: 2 }, MODEL);
    expect(usage.cacheReadTokens).toBeNull();
  });

  it('prompt_tokens_details 는 있는데 cached_tokens 가 없어도 null 이다', () => {
    const usage = mapOpenAiUsage(
      { prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: { audio_tokens: 0 } },
      MODEL
    );
    expect(usage.cacheReadTokens).toBeNull();
  });

  it('0 은 모름이 아니라 값이다', () => {
    const usage = mapOpenAiUsage(
      { prompt_tokens: 0, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
      MODEL
    );
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.cacheReadTokens).toBe(0);
  });

  it.each([
    ['usage 자체가 없음', undefined],
    ['usage 가 null', null],
    ['usage 가 객체가 아님', 'usage'],
    ['usage 가 배열', []],
  ])('%s → 전부 null', (_label, raw) => {
    expect(mapOpenAiUsage(raw, MODEL)).toEqual(emptyUsage(MODEL));
  });

  it.each([
    ['음수', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['문자열', '1200'],
    ['불리언', true],
    ['객체', {}],
  ])('토큰 수가 %s 면 그 항목만 null 이다', (_label, bad) => {
    const usage = mapOpenAiUsage({ prompt_tokens: bad, completion_tokens: 7 }, MODEL);
    expect(usage.inputTokens).toBeNull();
    expect(usage.outputTokens).toBe(7);
  });
});

describe('mapAnthropicUsage', () => {
  it('SDK 의 snake_case 네 항목을 그대로 옮긴다', () => {
    const usage = mapAnthropicUsage(
      {
        input_tokens: 120,
        output_tokens: 480,
        cache_read_input_tokens: 4800,
        cache_creation_input_tokens: 5000,
      },
      'claude-opus-5'
    );
    expect(usage).toEqual({
      model: 'claude-opus-5',
      inputTokens: 120,
      outputTokens: 480,
      cacheReadTokens: 4800,
      cacheCreationTokens: 5000,
    });
  });

  it('캐시 항목이 없으면 null 이다 — 캐시를 안 쓴 것과 모르는 것을 섞지 않는다', () => {
    const usage = mapAnthropicUsage({ input_tokens: 1, output_tokens: 2 }, 'claude-opus-5');
    expect(usage.cacheReadTokens).toBeNull();
    expect(usage.cacheCreationTokens).toBeNull();
  });

  it('usage 가 없으면 전부 null 이다', () => {
    expect(mapAnthropicUsage(null, 'claude-opus-5')).toEqual(emptyUsage('claude-opus-5'));
  });
});

describe('createUsageAccumulator — 여러 턴 합산', () => {
  it('아무것도 안 더하면 전부 null 이다', () => {
    expect(createUsageAccumulator(MODEL).total()).toEqual(emptyUsage(MODEL));
  });

  it('한 번 더하면 그 값 그대로다', () => {
    const acc = createUsageAccumulator(MODEL);
    acc.add(mapOpenAiUsage({ prompt_tokens: 10, completion_tokens: 3 }, MODEL));
    expect(acc.total().inputTokens).toBe(10);
    expect(acc.total().outputTokens).toBe(3);
  });

  it('여러 턴을 더한다 — 도구 루프는 요청이 여러 번이다', () => {
    const acc = createUsageAccumulator(MODEL);
    acc.add(mapOpenAiUsage({ prompt_tokens: 10, completion_tokens: 3 }, MODEL));
    acc.add(mapOpenAiUsage({ prompt_tokens: 40, completion_tokens: 7 }, MODEL));
    acc.add(mapOpenAiUsage({ prompt_tokens: 100, completion_tokens: 900 }, MODEL));
    expect(acc.total().inputTokens).toBe(150);
    expect(acc.total().outputTokens).toBe(910);
  });

  it('한 턴이라도 모르면 그 항목의 합계는 null 이다 — 하한을 총액으로 보고하지 않는다', () => {
    const acc = createUsageAccumulator(MODEL);
    acc.add(mapOpenAiUsage({ prompt_tokens: 10, completion_tokens: 3 }, MODEL));
    acc.add(mapOpenAiUsage(null, MODEL)); // usage 가 안 온 턴
    expect(acc.total().inputTokens).toBeNull();
    expect(acc.total().outputTokens).toBeNull();
  });

  it('모르는 항목과 아는 항목은 따로 판정한다', () => {
    const acc = createUsageAccumulator(MODEL);
    // 캐시 읽기만 아는 턴 + 캐시 읽기를 모르는 턴
    acc.add(
      mapOpenAiUsage(
        { prompt_tokens: 5, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 4 } },
        MODEL
      )
    );
    acc.add(mapOpenAiUsage({ prompt_tokens: 5, completion_tokens: 1 }, MODEL));

    const total = acc.total();
    expect(total.inputTokens).toBe(10);
    expect(total.outputTokens).toBe(2);
    expect(total.cacheReadTokens).toBeNull();
    expect(total.cacheCreationTokens).toBeNull();
  });

  it('모델은 그대로 실린다', () => {
    const acc = createUsageAccumulator(MODEL);
    acc.add(mapOpenAiUsage({ prompt_tokens: 1, completion_tokens: 1 }, MODEL));
    expect(acc.total().model).toBe(MODEL);
  });

  it('usage 가 아닌 것을 더해도 터지지 않고 모름으로 센다', () => {
    const acc = createUsageAccumulator(MODEL);
    acc.add(null);
    acc.add(undefined);
    expect(acc.total()).toEqual(emptyUsage(MODEL));
  });
});
