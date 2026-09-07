// 무료 경로(OpenRouter)의 **직렬 실행** — Batch API 가 없어 completeJson 을 반복 호출한다.
//
// Batch 경로가 `collectVariantResults` 로 하는 일(성공·실패를 갈라 담고, 한 건이
// 실패해도 나머지를 살리고, 실패를 전부 보고)을 여기서는 실행하면서 해야 한다.
// 그래서 확인할 것이 하나 더 있다: **어디서 멈췄고 무엇이 남았는가.**
//
// 하루 50회 한도에 걸리면 남은 호출은 전부 429 다. 계속 두드리면 다음 날 한도까지
// 미리 깎아먹는다 — 그래서 하루 한도는 재시도하지 않고 **즉시 멈춘다.**

import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { loadSource, clearContentCache } from '../lib/ai/content.js';
import { buildVariantCalls } from '../lib/ai/variants.js';
import { createRateLimiter, runVariantCalls } from '../lib/ai/batchRunner.js';
import { OpenRouterError, classifyStatus } from '../lib/ai/providers/openrouter.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/ai-data', import.meta.url));
const FREE_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

beforeEach(() => {
  vi.stubEnv('JUNGCHOGI_DATA_DIR', FIXTURE_DIR);
  clearContentCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearContentCache();
});

/** 실제 분류기를 쓴다 — 하루/분당을 가르는 규칙이 진짜인지도 함께 확인된다. */
function upstreamError({ status, message = '', retryAfter = null }) {
  const headers = new Headers(retryAfter === null ? {} : { 'retry-after': String(retryAfter) });
  return new OpenRouterError(
    classifyStatus({
      status,
      bodyText: JSON.stringify({ error: { message } }),
      headers,
      model: FREE_MODEL,
    })
  );
}

const dailyLimitError = () =>
  upstreamError({ status: 429, message: 'Rate limit exceeded: free-models-per-day' });
const minuteLimitError = () =>
  upstreamError({ status: 429, message: 'Rate limit exceeded', retryAfter: 5 });
const serverError = () => upstreamError({ status: 503, message: 'upstream unavailable' });

const usageOf = (input, output) => ({
  model: FREE_MODEL,
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: null,
  cacheCreationTokens: null,
});

/**
 * 호출을 customId 로 되찾을 수 있는 가짜 프로바이더.
 * `completeJson` 은 customId 를 인자로 받지 않으므로(계약에 없다) 프롬프트로 되맞춘다.
 */
function fakeProvider(calls, responder) {
  const byPrompt = new Map(calls.map((call) => [call.messages[0].content, call.customId]));
  const seen = [];

  const provider = {
    name: 'openrouter',
    model: FREE_MODEL,
    supportsPromptCache: false,
    supportsStrictSchema: true,
    supportsTools: true,
    hasKey: () => true,
    classifyError: (error) => (error instanceof OpenRouterError ? error.failure : { code: 'UPSTREAM', message: String(error), retryable: false }),
    completeJson: vi.fn(async (args) => {
      const customId = byPrompt.get(args.messages[0].content);
      seen.push(customId);
      return responder(customId, args);
    }),
  };
  return { provider, seen };
}

const shortAnswer = (customId) => ({
  data: { question: `${customId} 변형 지문`, answer: `${customId} 정답` },
  text: '',
  usage: usageOf(900, 1_400),
});

/** 기다리지 않는 스로틀 (스로틀 자체는 gen-throttle.test.js 가 본다) */
const noWaitLimiter = () => createRateLimiter({ limit: 1_000, windowMs: 1, now: () => 0, sleep: async () => {} });

function fixtureCalls({ source = 'quiz100', count = 3, variants = 1 } = {}) {
  const problems = loadSource(source).slice(0, count);
  return { problems, calls: buildVariantCalls({ source, problems, variantsPerItem: variants }) };
}

describe('runVariantCalls — 성공 경로', () => {
  it('호출 순서대로 항목을 돌려준다 (동시성과 무관하게)', async () => {
    const { problems, calls } = fixtureCalls({ count: 3, variants: 2 });
    const { provider } = fakeProvider(calls, (customId) => shortAnswer(customId));

    const result = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      concurrency: 3,
      limiter: noWaitLimiter(),
    });

    expect(result.entries.map((entry) => entry.customId)).toEqual(calls.map((c) => c.customId));
    expect(result.failures).toEqual([]);
    expect(result.stopped).toBeNull();
  });

  it('항목이 생성물 계약 shape 이다', async () => {
    const { problems, calls } = fixtureCalls({ count: 1, variants: 1 });
    const { provider } = fakeProvider(calls, (customId) => shortAnswer(customId));

    const { entries } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      limiter: noWaitLimiter(),
    });

    expect(entries[0].item).toEqual({
      id: `${problems[0].id}-v1`,
      question: `${calls[0].customId} 변형 지문`,
      answer: `${calls[0].customId} 정답`,
      category: problems[0].category,
      variantOf: problems[0].id,
      generated: true,
    });
  });

  it('사용량을 모아 준다 — 모르는 값은 0 이 아니라 "모름" 으로 센다', async () => {
    const { problems, calls } = fixtureCalls({ count: 2, variants: 1 });
    const { provider } = fakeProvider(calls, (customId) =>
      customId === calls[0].customId
        ? shortAnswer(customId)
        : { ...shortAnswer(customId), usage: usageOf(null, null) }
    );

    const { usage } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      limiter: noWaitLimiter(),
    });

    expect(usage.calls).toBe(2);
    expect(usage.inputTokens).toBe(900);
    expect(usage.outputTokens).toBe(1_400);
    expect(usage.unknownUsage).toBe(1);
    expect(usage.model).toBe(FREE_MODEL);
  });

  it('성공할 때마다 onEntry 로 알린다 (중간에 죽어도 남아 있게)', async () => {
    const { problems, calls } = fixtureCalls({ count: 3, variants: 1 });
    const { provider } = fakeProvider(calls, (customId) => shortAnswer(customId));
    const saved = [];

    await runVariantCalls({
      calls,
      provider,
      originals: problems,
      concurrency: 1,
      limiter: noWaitLimiter(),
      onEntry: (entry) => saved.push(entry.customId),
    });

    expect(saved.sort()).toEqual(calls.map((c) => c.customId).sort());
  });

  it('모든 호출이 스로틀을 통과한다', async () => {
    const { problems, calls } = fixtureCalls({ count: 4, variants: 1 });
    const { provider } = fakeProvider(calls, (customId) => shortAnswer(customId));

    let acquired = 0;
    const limiter = { acquire: async () => { acquired += 1; }, count: () => 0 };

    await runVariantCalls({ calls, provider, originals: problems, limiter });

    expect(acquired).toBe(calls.length);
  });
});

describe('runVariantCalls — 개별 실패는 전체를 죽이지 않는다', () => {
  it('한 건이 5xx 로 터져도 나머지는 살아남는다', async () => {
    const { problems, calls } = fixtureCalls({ count: 3, variants: 1 });
    const { provider } = fakeProvider(calls, (customId) => {
      if (customId === calls[1].customId) throw serverError();
      return shortAnswer(customId);
    });

    const { entries, failures, stopped } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      limiter: noWaitLimiter(),
    });

    expect(entries.map((e) => e.customId)).toEqual([calls[0].customId, calls[2].customId]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      customId: calls[1].customId,
      id: problems[1].id,
      variant: 1,
      type: 'errored',
    });
    expect(stopped).toBeNull();
  });

  it('JSON 을 못 읽으면 invalid 로 남긴다', async () => {
    const { problems, calls } = fixtureCalls({ count: 2, variants: 1 });
    const { provider } = fakeProvider(calls, (customId) =>
      customId === calls[0].customId
        ? { data: null, text: '설명을 늘어놓기만 한 응답', usage: usageOf(10, 10) }
        : shortAnswer(customId)
    );

    const { entries, failures } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      limiter: noWaitLimiter(),
    });

    expect(entries).toHaveLength(1);
    expect(failures[0]).toMatchObject({ customId: calls[0].customId, type: 'invalid' });
    expect(failures[0].message).toMatch(/JSON/);
  });

  it('필수 필드가 비면 어떤 필드인지 남긴다', async () => {
    const { problems, calls } = fixtureCalls({ count: 1, variants: 1 });
    const { provider } = fakeProvider(calls, () => ({
      data: { question: '지문만 있고', answer: '   ' },
      text: '',
      usage: usageOf(10, 10),
    }));

    const { entries, failures } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      limiter: noWaitLimiter(),
    });

    expect(entries).toEqual([]);
    expect(failures[0].type).toBe('invalid');
    expect(failures[0].message).toContain('answer');
  });

  it('실패한 호출도 사용량 계수에 든다 — 한도를 깎기 때문이다', async () => {
    const { problems, calls } = fixtureCalls({ count: 2, variants: 1 });
    const { provider } = fakeProvider(calls, (customId) => {
      if (customId === calls[0].customId) throw serverError();
      return shortAnswer(customId);
    });

    const { usage } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      limiter: noWaitLimiter(),
    });

    expect(usage.calls).toBe(2);
  });
});

describe('runVariantCalls — 한도', () => {
  it('하루 한도에 걸리면 즉시 멈추고 남은 호출을 시도하지 않는다', async () => {
    const { problems, calls } = fixtureCalls({ count: 2, variants: 2 }); // 호출 4건
    expect(calls).toHaveLength(4);
    const { provider, seen } = fakeProvider(calls, (customId) => {
      if (customId === calls[1].customId) throw dailyLimitError();
      return shortAnswer(customId);
    });

    const { entries, failures, stopped } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      concurrency: 1,
      limiter: noWaitLimiter(),
    });

    expect(entries.map((e) => e.customId)).toEqual([calls[0].customId]);
    expect(stopped).not.toBeNull();
    expect(stopped.reason).toBe('daily-quota');
    expect(stopped.remaining).toBe(3); // 걸린 것 + 손도 못 댄 둘
    expect(seen).toEqual([calls[0].customId, calls[1].customId]);
    expect(failures.map((f) => f.customId)).toEqual([calls[1].customId]);
    expect(failures[0].type).toBe('rate_limited');
  });

  it('분당 한도는 기다렸다 한 번 다시 시도한다', async () => {
    const { problems, calls } = fixtureCalls({ count: 1, variants: 1 });
    let attempts = 0;
    const { provider } = fakeProvider(calls, (customId) => {
      attempts += 1;
      if (attempts === 1) throw minuteLimitError();
      return shortAnswer(customId);
    });

    const slept = [];
    const { entries, failures, stopped } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      limiter: noWaitLimiter(),
      sleep: async (ms) => slept.push(ms),
    });

    expect(attempts).toBe(2);
    expect(slept).toEqual([5_000]); // Retry-After: 5
    expect(entries).toHaveLength(1);
    expect(failures).toEqual([]);
    expect(stopped).toBeNull();
  });

  it('분당 한도가 재시도 뒤에도 계속되면 그 건만 실패로 남기고 다음으로 간다', async () => {
    const { problems, calls } = fixtureCalls({ count: 2, variants: 1 });
    const { provider } = fakeProvider(calls, (customId) => {
      if (customId === calls[0].customId) throw minuteLimitError();
      return shortAnswer(customId);
    });

    const { entries, failures, stopped } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      concurrency: 1,
      limiter: noWaitLimiter(),
      sleep: async () => {},
    });

    expect(entries.map((e) => e.customId)).toEqual([calls[1].customId]);
    expect(failures[0]).toMatchObject({ customId: calls[0].customId, type: 'rate_limited' });
    expect(stopped).toBeNull();
  });

  it('빈 호출 목록은 아무것도 부르지 않는다', async () => {
    const { provider } = fakeProvider([], () => {
      throw new Error('부르면 안 된다');
    });

    const result = await runVariantCalls({
      calls: [],
      provider,
      originals: [],
      limiter: noWaitLimiter(),
    });

    expect(result).toMatchObject({ entries: [], failures: [], stopped: null });
    expect(provider.completeJson).not.toHaveBeenCalled();
  });
});
