// streamText — 스트리밍 해설 (`lib/ai/providers/openrouter.js`).
//
// 청크 경계는 프레임 경계와 무관하다. 파서 자체는 `tests/provider-sse.test.js` 가
// 지키고, 여기서는 **프로바이더가 그 파서를 통해 무엇을 흘리는가**를 고정한다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOpenRouterProvider, DEFAULT_OPENROUTER_MODEL } from '../lib/ai/providers/openrouter.js';

const KEY_ENV = { OPENROUTER_API_KEY: 'sk-or-test' };
const encoder = new TextEncoder();

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

/** 문자열/바이트 청크 목록을 SSE 응답으로 만든다 */
function sseResponse(chunks, init = {}) {
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    ...init,
  });
}

const deltaFrame = (text) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\n`;

const usageFrame = (usage) => `data: ${JSON.stringify({ choices: [], usage })}\n\n`;

const stream = (args = {}) =>
  createOpenRouterProvider(KEY_ENV).streamText({
    system: [{ text: '너는 튜터다' }],
    messages: [{ role: 'user', content: '문항' }],
    maxTokens: 4000,
    effort: 'low',
    ...args,
  });

const collect = async (iterable) => {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
};

const textOf = (events) =>
  events
    .filter((event) => event.type === 'text')
    .map((event) => event.text)
    .join('');

describe('요청', () => {
  it('stream:true 와 usage 포함 요청을 함께 보낸다', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));
    await collect(stream());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.max_tokens).toBe(4000);
    expect(body.reasoning_effort).toBe('low');
  });

  it('스트리밍에는 구조화 출력을 걸지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));
    await collect(stream());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('response_format');
  });

  it('제너레이터를 만들기만 해서는 요청을 보내지 않는다 — 첫 next() 에서 나간다', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));
    const iterator = stream();
    expect(fetchMock).not.toHaveBeenCalled();

    await iterator.next();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('정상 스트림', () => {
  it('델타를 순서대로 흘리고 마지막에 done 을 낸다', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        deltaFrame('## 채점\n'),
        deltaFrame('정규화를 '),
        deltaFrame('반대로 썼습니다.'),
        usageFrame({ prompt_tokens: 5200, completion_tokens: 300 }),
        'data: [DONE]\n\n',
      ])
    );

    const events = await collect(stream());
    expect(textOf(events)).toBe('## 채점\n정규화를 반대로 썼습니다.');
    expect(events.at(-1)).toEqual({
      type: 'done',
      usage: {
        model: DEFAULT_OPENROUTER_MODEL,
        inputTokens: 5200,
        outputTokens: 300,
        cacheReadTokens: null,
        cacheCreationTokens: null,
      },
    });
  });

  it('done 은 정확히 한 번 나온다', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([deltaFrame('a'), 'data: [DONE]\n\n']));
    const events = await collect(stream());
    expect(events.filter((event) => event.type === 'done')).toHaveLength(1);
  });

  it('프레임이 청크 경계로 쪼개져도 이어 붙인다', async () => {
    const frame = deltaFrame('결합도');
    fetchMock.mockResolvedValueOnce(
      sseResponse([frame.slice(0, 20), frame.slice(20, 35), frame.slice(35), 'data: [DONE]\n\n'])
    );
    expect(textOf(await collect(stream()))).toBe('결합도');
  });

  it('한 청크에 여러 프레임이 와도 순서대로 흘린다', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([deltaFrame('1') + deltaFrame('2') + deltaFrame('3'), 'data: [DONE]\n\n'])
    );
    expect(textOf(await collect(stream()))).toBe('123');
  });

  it('한글이 UTF-8 바이트 경계에서 잘려도 깨지지 않는다', async () => {
    const bytes = encoder.encode(deltaFrame('응집도와 결합도'));
    const cut = 40;
    fetchMock.mockResolvedValueOnce(
      sseResponse([bytes.slice(0, cut), bytes.slice(cut), 'data: [DONE]\n\n'])
    );
    expect(textOf(await collect(stream()))).toBe('응집도와 결합도');
  });

  it('주석 줄(킵얼라이브)은 흘리지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([': OPENROUTER PROCESSING\n\n', deltaFrame('a'), 'data: [DONE]\n\n'])
    );
    const events = await collect(stream());
    expect(textOf(events)).toBe('a');
  });

  it('깨진 JSON 줄은 건너뛰고 나머지를 흘린다', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([deltaFrame('a'), 'data: {깨짐\n\n', deltaFrame('b'), 'data: [DONE]\n\n'])
    );
    expect(textOf(await collect(stream()))).toBe('ab');
  });

  it('[DONE] 뒤의 프레임은 읽지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([deltaFrame('a'), 'data: [DONE]\n\n', deltaFrame('버려질 텍스트')])
    );
    expect(textOf(await collect(stream()))).toBe('a');
  });

  it('빈 델타·content 없는 델타는 이벤트를 만들지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        deltaFrame(''),
        `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: null } }] })}\n\n`,
        deltaFrame('a'),
        'data: [DONE]\n\n',
      ])
    );
    const events = await collect(stream());
    expect(events.filter((event) => event.type === 'text')).toHaveLength(1);
  });

  it('reasoning 델타는 해설 본문이 아니므로 흘리지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning: '생각 중' } }] })}\n\n`,
        deltaFrame('본문'),
        'data: [DONE]\n\n',
      ])
    );
    expect(textOf(await collect(stream()))).toBe('본문');
  });
});

describe('usage 가 온전하지 않을 때', () => {
  it('usage 프레임이 없으면 done 의 usage 는 전부 null 이다 — 0 이 아니다', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([deltaFrame('a'), 'data: [DONE]\n\n']));
    const done = (await collect(stream())).at(-1);

    expect(done.type).toBe('done');
    expect(done.usage).toEqual({
      model: DEFAULT_OPENROUTER_MODEL,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheCreationTokens: null,
    });
  });

  it('cached_tokens 가 실려 오면 캐시 읽기로 옮긴다', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        deltaFrame('a'),
        usageFrame({
          prompt_tokens: 100,
          completion_tokens: 10,
          prompt_tokens_details: { cached_tokens: 80 },
        }),
        'data: [DONE]\n\n',
      ])
    );
    expect((await collect(stream())).at(-1).usage.cacheReadTokens).toBe(80);
  });

  it('[DONE] 없이 끊겨도 그때까지 받은 텍스트와 done 을 낸다', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([deltaFrame('앞부분만'), deltaFrame(' 왔다')]));
    const events = await collect(stream());

    expect(textOf(events)).toBe('앞부분만 왔다');
    expect(events.at(-1).type).toBe('done');
  });

  it('본문이 아예 없어도 done 은 낸다', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    );
    const events = await collect(stream());
    expect(events).toEqual([
      {
        type: 'done',
        usage: {
          model: DEFAULT_OPENROUTER_MODEL,
          inputTokens: null,
          outputTokens: null,
          cacheReadTokens: null,
          cacheCreationTokens: null,
        },
      },
    ]);
  });
});

describe('오류', () => {
  it('스트림이 열리기 전 실패는 그대로 던진다', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'no auth' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );

    const provider = createOpenRouterProvider(KEY_ENV);
    const iterator = provider.streamText({ system: [], messages: [] });
    await expect(iterator.next()).rejects.toBeTruthy();
  });

  it('스트림 도중 error 프레임이 오면 던진다 — 그때까지의 텍스트는 이미 흘렀다', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        deltaFrame('앞부분'),
        `data: ${JSON.stringify({ error: { code: 429, message: 'free-models-per-day' } })}\n\n`,
      ])
    );

    const provider = createOpenRouterProvider(KEY_ENV);
    const iterator = provider.streamText({ system: [], messages: [] });

    expect(await iterator.next()).toEqual({
      value: { type: 'text', text: '앞부분' },
      done: false,
    });

    let failure = null;
    try {
      await iterator.next();
    } catch (error) {
      failure = provider.classifyError(error);
    }
    expect(failure?.code).toBe('RATE_LIMITED');
    expect(failure?.limitScope).toBe('daily');
  });

  it('네트워크 오류는 첫 next() 에서 분류돼 나온다', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const provider = createOpenRouterProvider(KEY_ENV);
    const iterator = provider.streamText({ system: [], messages: [] });

    try {
      await iterator.next();
      throw new Error('던져야 한다');
    } catch (error) {
      const failure = provider.classifyError(error);
      expect(failure.code).toBe('UPSTREAM');
      expect(failure.retryable).toBe(true);
    }
  });
});
