// OpenRouter 오류 분류 — `lib/ai/providers/openrouter.js`.
//
// 모양은 기존 `classifyUpstreamError`(lib/ai/client.js)와 같아야 한다:
// `{code, message, retryable, status}`. 그래야 엔드포인트가 프로바이더를 바꿔도
// 같은 코드로 같은 응답을 낸다.
//
// 두 가지가 이 경로에서 새로 중요하다:
//   · **404 = 모델 id 가 사라졌다.** 무료 모델 id 는 실제로 바뀐다.
//   · **429 가 분당인지 하루인지.** 무입금 계정의 하루 50회가 실질적 제약이라
//     "잠시 후 다시" 와 "오늘은 끝났다" 를 같은 문구로 내면 안 된다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createOpenRouterProvider,
  DEFAULT_OPENROUTER_MODEL,
  MODELS_URL,
} from '../lib/ai/providers/openrouter.js';

const KEY_ENV = { OPENROUTER_API_KEY: 'sk-or-test' };

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const errorResponse = (status, body, headers = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** 요청을 한 번 보내고 분류된 실패를 돌려받는다 */
async function failureOf(response, env = KEY_ENV) {
  fetchMock.mockResolvedValueOnce(response);
  const provider = createOpenRouterProvider(env);
  try {
    await provider.completeJson({ system: [], messages: [{ role: 'user', content: 'x' }] });
  } catch (error) {
    return provider.classifyError(error);
  }
  throw new Error('오류가 나야 하는데 성공했다');
}

/** fetch 자체가 던지는 경우 */
async function failureOfThrow(thrown) {
  fetchMock.mockRejectedValueOnce(thrown);
  const provider = createOpenRouterProvider(KEY_ENV);
  try {
    await provider.completeJson({ system: [], messages: [{ role: 'user', content: 'x' }] });
  } catch (error) {
    return provider.classifyError(error);
  }
  throw new Error('오류가 나야 하는데 성공했다');
}

describe('인증 (401·403)', () => {
  it('401 은 재시도 불가한 UPSTREAM 이다', async () => {
    const failure = await failureOf(errorResponse(401, { error: { message: 'No auth' } }));
    expect(failure.code).toBe('UPSTREAM');
    expect(failure.retryable).toBe(false);
    expect(failure.status).toBe(401);
  });

  it('401 메시지가 어느 환경변수를 볼지 알려 준다', async () => {
    const failure = await failureOf(errorResponse(401, {}));
    expect(failure.message).toMatch(/OPENROUTER_API_KEY/);
  });

  it('업스트림 원문을 사용자 메시지로 흘리지 않는다', async () => {
    const failure = await failureOf(
      errorResponse(401, { error: { message: 'invalid key sk-or-v1-abcdef' } })
    );
    expect(failure.message).not.toMatch(/sk-or-v1/);
  });

  it('403 도 같은 자리로 분류한다', async () => {
    const failure = await failureOf(errorResponse(403, {}));
    expect(failure.code).toBe('UPSTREAM');
    expect(failure.retryable).toBe(false);
    expect(failure.status).toBe(403);
  });

  it('인증 실패를 UNAUTHORIZED 로 내지 않는다 — 그 코드는 접근 코드 게이트의 것이다', async () => {
    // UNAUTHORIZED 를 내면 화면이 "접근 코드를 확인하세요" 로 잘못 안내한다
    expect((await failureOf(errorResponse(401, {}))).code).not.toBe('UNAUTHORIZED');
    expect((await failureOf(errorResponse(403, {}))).code).not.toBe('UNAUTHORIZED');
  });
});

describe('모델 없음 (404) — 모델 id 가 바뀌었다는 신호', () => {
  it('재시도 불가한 UPSTREAM 이다', async () => {
    const failure = await failureOf(errorResponse(404, { error: { message: 'No model found' } }));
    expect(failure.code).toBe('UPSTREAM');
    expect(failure.retryable).toBe(false);
    expect(failure.status).toBe(404);
  });

  it('메시지가 모델 id·환경변수 이름·모델 목록 주소를 모두 담는다', async () => {
    const failure = await failureOf(errorResponse(404, {}));
    expect(failure.message).toContain(DEFAULT_OPENROUTER_MODEL);
    expect(failure.message).toContain('OPENROUTER_MODEL');
    expect(failure.message).toContain(MODELS_URL);
  });

  it('바꿔 둔 모델 id 도 메시지에 그대로 나온다', async () => {
    const failure = await failureOf(errorResponse(404, {}), {
      ...KEY_ENV,
      OPENROUTER_MODEL: 'someone/gone-model:free',
    });
    expect(failure.message).toContain('someone/gone-model:free');
  });
});

describe('레이트리밋 (429)', () => {
  it('RATE_LIMITED 이고 재시도 가능하다', async () => {
    const failure = await failureOf(errorResponse(429, {}));
    expect(failure.code).toBe('RATE_LIMITED');
    expect(failure.retryable).toBe(true);
    expect(failure.status).toBe(429);
  });

  it('Retry-After 헤더를 존중한다', async () => {
    const failure = await failureOf(errorResponse(429, {}, { 'retry-after': '12' }));
    expect(failure.retryAfterSeconds).toBe(12);
  });

  it('Retry-After 가 없으면 기본값을 준다 — 호출부가 undefined 를 헤더에 쓰면 안 된다', async () => {
    const failure = await failureOf(errorResponse(429, {}));
    expect(typeof failure.retryAfterSeconds).toBe('number');
    expect(failure.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('Retry-After 가 숫자가 아니면 무시하고 기본값을 쓴다', async () => {
    const failure = await failureOf(errorResponse(429, {}, { 'retry-after': 'Wed, 21 Oct' }));
    expect(Number.isFinite(failure.retryAfterSeconds)).toBe(true);
  });

  it('분당 한도는 "잠시 후" 로 안내한다', async () => {
    const failure = await failureOf(
      errorResponse(429, { error: { message: 'Rate limit exceeded: free-models-per-min' } })
    );
    expect(failure.limitScope).toBe('minute');
    expect(failure.message).toMatch(/잠시 후/);
  });

  it('하루 한도는 다른 문구로 안내한다 — 잠시 기다려도 풀리지 않는다', async () => {
    const failure = await failureOf(
      errorResponse(429, { error: { message: 'Rate limit exceeded: free-models-per-day' } })
    );
    expect(failure.limitScope).toBe('daily');
    expect(failure.message).toMatch(/하루|일일/);
    expect(failure.message).not.toMatch(/잠시 후 다시 시도/);
  });

  it('Retry-After 가 아주 길면 하루 한도로 본다', async () => {
    const failure = await failureOf(errorResponse(429, {}, { 'retry-after': '36000' }));
    expect(failure.limitScope).toBe('daily');
  });

  it('X-RateLimit-Reset(ms epoch)으로도 남은 시간을 읽는다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'));
    try {
      const reset = String(Date.now() + 30_000);
      const failure = await failureOf(errorResponse(429, {}, { 'x-ratelimit-reset': reset }));
      expect(failure.retryAfterSeconds).toBe(30);
      expect(failure.limitScope).toBe('minute');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('업스트림 장애와 네트워크', () => {
  it.each([500, 502, 503, 504])('%i 은 재시도 가능한 UPSTREAM 이다', async (status) => {
    const failure = await failureOf(errorResponse(status, {}));
    expect(failure.code).toBe('UPSTREAM');
    expect(failure.retryable).toBe(true);
    expect(failure.status).toBe(status);
  });

  it('그 밖의 4xx 는 재시도해도 소용없다', async () => {
    const failure = await failureOf(errorResponse(400, { error: { message: 'bad request' } }));
    expect(failure.code).toBe('UPSTREAM');
    expect(failure.retryable).toBe(false);
    expect(failure.status).toBe(400);
  });

  it('402 는 크레딧 문제라고 알린다', async () => {
    const failure = await failureOf(errorResponse(402, {}));
    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(/크레딧|한도/);
  });

  it('fetch 가 던지는 네트워크 오류는 재시도 가능한 UPSTREAM 이다', async () => {
    const failure = await failureOfThrow(new TypeError('fetch failed'));
    expect(failure.code).toBe('UPSTREAM');
    expect(failure.retryable).toBe(true);
    expect(failure.status).toBeUndefined();
  });

  it('타임아웃은 별도 문구로 알리고 재시도 가능하다', async () => {
    const failure = await failureOfThrow(
      new DOMException('The operation was aborted', 'TimeoutError')
    );
    expect(failure.code).toBe('UPSTREAM');
    expect(failure.retryable).toBe(true);
    expect(failure.message).toMatch(/시간/);
  });

  it('AbortError 도 타임아웃과 같이 다룬다', async () => {
    const failure = await failureOfThrow(new DOMException('aborted', 'AbortError'));
    expect(failure.retryable).toBe(true);
  });

  it('본문이 JSON 이 아니어도(HTML 오류 페이지) 상태코드로 분류한다', async () => {
    const failure = await failureOf(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      })
    );
    expect(failure.code).toBe('UPSTREAM');
    expect(failure.retryable).toBe(true);
  });
});

describe('200 인데 본문이 오류인 경우', () => {
  it('choices 없이 error 만 오면 실패로 다룬다', async () => {
    const failure = await failureOf(
      new Response(JSON.stringify({ error: { code: 429, message: 'free-models-per-day' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(failure.code).toBe('RATE_LIMITED');
    expect(failure.limitScope).toBe('daily');
  });

  it('error.code 가 없으면 재시도 불가한 UPSTREAM 으로 둔다', async () => {
    const failure = await failureOf(
      new Response(JSON.stringify({ error: { message: '알 수 없음' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(failure.code).toBe('UPSTREAM');
    expect(failure.retryable).toBe(false);
  });
});

describe('classifyError 는 아무 값이나 받아도 계약 모양을 낸다', () => {
  const provider = () => createOpenRouterProvider(KEY_ENV);

  it.each([
    ['평범한 Error', new Error('무슨 일이')],
    ['문자열', '오류'],
    ['null', null],
    ['undefined', undefined],
  ])('%s → {code, message, retryable}', (_label, thrown) => {
    const failure = provider().classifyError(thrown);
    expect(failure.code).toBe('UPSTREAM');
    expect(typeof failure.message).toBe('string');
    expect(failure.message.length).toBeGreaterThan(0);
    expect(typeof failure.retryable).toBe('boolean');
  });
});
