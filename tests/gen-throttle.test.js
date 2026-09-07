// 무료 경로(OpenRouter)의 **스로틀과 한도 산정**.
//
// OpenRouter 에는 Batch API 가 없어 변형 생성이 `completeJson` 을 반복 호출한다.
// 그러면 두 가지가 새로 문제가 된다:
//
//   1. **분당 20회.** 넘기면 429 가 줄줄이 난다. 실패한 호출도 하루 한도를 깎으므로
//      "넘으면 재시도" 가 아니라 **애초에 넘지 않는 것**이 유일한 답이다.
//   2. **하루 50회(무입금 계정).** 30건짜리 평가셋 한 번이 하루치의 60% 다.
//      실행 전에 이 숫자를 알려주지 않으면 사용자는 왜 막혔는지 모른다.
//
// 시간은 전부 주입한다 — 진짜로 1분을 기다리는 테스트는 쓸 수 없다.

import { describe, it, expect, vi } from 'vitest';

import { createRateLimiter } from '../lib/ai/batchRunner.js';
import { estimateFreeQuota } from '../lib/ai/variants.js';
import { OPENROUTER_FREE_LIMITS } from '../lib/ai/usage.js';

/** 흐르지 않는 시계 — `sleep` 을 부른 만큼만 시간이 간다. */
function virtualClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += Math.max(0, ms);
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

/** 60초 창을 미끄러뜨리며 가장 많이 나간 호출 수 (usage-report 의 peakPerMinute 와 같은 계산) */
function peakPerWindow(times, windowMs) {
  let peak = 0;
  let start = 0;
  for (let end = 0; end < times.length; end += 1) {
    while (times[end] - times[start] >= windowMs) start += 1;
    peak = Math.max(peak, end - start + 1);
  }
  return peak;
}

describe('createRateLimiter — 분당 한도를 넘지 않는다', () => {
  it('한도 이내면 기다리지 않는다', async () => {
    const clock = virtualClock();
    const limiter = createRateLimiter({ limit: 20, windowMs: 60_000, ...clock });

    for (let i = 0; i < 20; i += 1) await limiter.acquire();

    expect(clock.now()).toBe(0);
  });

  it('21번째 호출은 창이 열릴 때까지 기다린다', async () => {
    const clock = virtualClock();
    const limiter = createRateLimiter({ limit: 20, windowMs: 60_000, ...clock });

    for (let i = 0; i < 20; i += 1) await limiter.acquire();
    await limiter.acquire();

    expect(clock.now()).toBe(60_000);
  });

  it('50건을 흘려보내도 어느 60초 창에서도 20회를 넘지 않는다', async () => {
    const clock = virtualClock();
    const limiter = createRateLimiter({ limit: 20, windowMs: 60_000, ...clock });

    const times = [];
    for (let i = 0; i < 50; i += 1) {
      await limiter.acquire();
      times.push(clock.now());
    }

    expect(peakPerWindow(times, 60_000)).toBeLessThanOrEqual(20);
  });

  it('병렬로 집어와도 창당 한도를 넘지 않는다', async () => {
    const clock = virtualClock();
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, ...clock });

    const times = [];
    // 워커 4개가 동시에 12건을 집어간다 — acquire 가 직렬화되지 않으면 여기서 샌다.
    let next = 0;
    const worker = async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= 12) return;
        await limiter.acquire();
        times.push(clock.now());
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);

    times.sort((a, b) => a - b);
    expect(times).toHaveLength(12);
    expect(peakPerWindow(times, 60_000)).toBeLessThanOrEqual(5);
  });

  it('창이 지나면 다시 한도만큼 나간다', async () => {
    const clock = virtualClock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, ...clock });

    for (let i = 0; i < 3; i += 1) await limiter.acquire();
    clock.advance(60_001); // 다른 일로 1분이 지났다
    const before = clock.now();
    for (let i = 0; i < 3; i += 1) await limiter.acquire();

    expect(clock.now()).toBe(before); // 기다리지 않았다
  });

  it('한도가 1 이상의 정수가 아니면 만들 때 던진다', () => {
    expect(() => createRateLimiter({ limit: 0 })).toThrow(/limit/);
    expect(() => createRateLimiter({ limit: 2.5 })).toThrow(/limit/);
  });

  it('sleep 을 주지 않으면 실제 타이머로 기다린다', async () => {
    vi.useFakeTimers();
    try {
      const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
      await limiter.acquire();

      let done = false;
      const pending = limiter.acquire().then(() => {
        done = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(done).toBe(false);

      await vi.advanceTimersByTimeAsync(2);
      await pending;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('estimateFreeQuota — 하루 한도를 얼마나 쓰는지 미리 알린다', () => {
  it('평가셋 30건은 무입금 계정 하루치의 60% 다', () => {
    const quota = estimateFreeQuota({ requestCount: 30 });

    expect(quota.dailyLimit).toBe(OPENROUTER_FREE_LIMITS.requestsPerDay);
    expect(quota.perMinuteLimit).toBe(OPENROUTER_FREE_LIMITS.requestsPerMinute);
    expect(quota.sharePercent).toBeCloseTo(60, 6);
    expect(quota.exceedsDaily).toBe(false);
  });

  it('한도를 넘기면 그 사실을 표시한다', () => {
    const quota = estimateFreeQuota({ requestCount: 80 });

    expect(quota.exceedsDaily).toBe(true);
    expect(quota.sharePercent).toBeCloseTo(160, 6);
    expect(quota.overflow).toBe(30);
  });

  it('결제 이력이 있는 계정의 한도를 줄 수 있다', () => {
    const quota = estimateFreeQuota({
      requestCount: 200,
      dailyLimit: OPENROUTER_FREE_LIMITS.requestsPerDayWithCredits,
    });

    expect(quota.dailyLimit).toBe(1_000);
    expect(quota.exceedsDaily).toBe(false);
    expect(quota.sharePercent).toBeCloseTo(20, 6);
  });

  it('분당 한도에서 최소 소요 시간을 낸다', () => {
    expect(estimateFreeQuota({ requestCount: 20 }).minMinutes).toBe(0);
    expect(estimateFreeQuota({ requestCount: 21 }).minMinutes).toBe(1);
    expect(estimateFreeQuota({ requestCount: 30 }).minMinutes).toBe(1);
    expect(estimateFreeQuota({ requestCount: 41 }).minMinutes).toBe(2);
  });

  it('한도를 읽을 수 없으면 던진다 — 낙관적으로 어림하지 않는다', () => {
    expect(() => estimateFreeQuota({ requestCount: 10, dailyLimit: 0 })).toThrow(/dailyLimit/);
    expect(() => estimateFreeQuota({ requestCount: -1 })).toThrow(/requestCount/);
  });
});
