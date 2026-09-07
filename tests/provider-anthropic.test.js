// Anthropic 어댑터 — `lib/ai/providers/anthropic.js`.
//
// **이 파일의 존재 이유는 "기존 동작이 바뀌지 않았음" 을 증명하는 것이다.**
// 그래서 요청 파라미터를 손으로 다시 적지 않고 `lib/ai/client.js` 의
// `build*Request` 가 만든 것과 **직접 비교**한다. client.js 를 고치면 이 비교가
// 함께 움직이므로, 어댑터가 몰래 다른 요청을 보내는 일이 생길 수 없다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

import {
  MODEL,
  TUTOR_MAX_TOKENS,
  TUTOR_EFFORT,
  GRADE_MAX_TOKENS,
  GRADE_EFFORT,
  PLAN_MAX_TOKENS,
  PLAN_EFFORT,
  PLAN_MAX_ITERATIONS,
  buildTutorRequest,
  buildGradeRequest,
  buildPlanRequest,
  classifyUpstreamError,
  getClient,
  resetClient,
} from '../lib/ai/client.js';
import { createAnthropicProvider, toAnthropicSystem } from '../lib/ai/providers/anthropic.js';

const SCHEMA = {
  type: 'object',
  properties: { verdict: { type: 'string' } },
  required: ['verdict'],
  additionalProperties: false,
};

const SYSTEM = [{ text: '너는 튜터다' }, { text: '# 교재 총론\n\n...', cacheable: true }];
const MESSAGES = [{ role: 'user', content: '문항' }];

let client;

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
  resetClient();
  client = getClient();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetClient();
});

/** SDK 스트림 흉내 — `for await` 로 이벤트를 흘리고 finalMessage 를 준다 */
function fakeStream(events, final) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) yield event;
    },
    finalMessage: async () => final,
  };
}

const textDelta = (text) => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text },
});

describe('계약 필드', () => {
  it('이름·모델·능력을 알린다', () => {
    const provider = createAnthropicProvider();
    expect(provider.name).toBe('anthropic');
    expect(provider.model).toBe(MODEL);
    expect(provider.model).toBe('claude-opus-5');
    expect(provider.supportsPromptCache).toBe(true);
    expect(provider.supportsStrictSchema).toBe(true);
  });

  it('hasKey 는 환경변수를 본다', () => {
    expect(createAnthropicProvider().hasKey()).toBe(true);
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(createAnthropicProvider().hasKey()).toBe(false);
  });
});

describe('toAnthropicSystem — 블록 변환과 캐시 breakpoint', () => {
  it('text 블록으로 옮긴다', () => {
    expect(toAnthropicSystem([{ text: 'A' }])).toEqual([{ type: 'text', text: 'A' }]);
  });

  it('cacheable 블록에 1시간 TTL 의 cache_control 을 얹는다', () => {
    expect(toAnthropicSystem([{ text: 'A' }, { text: 'B', cacheable: true }])).toEqual([
      { type: 'text', text: 'A' },
      { type: 'text', text: 'B', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
  });

  it('cacheable 이 여러 개면 **마지막 하나에만** 건다', () => {
    // 기존 동작이 그렇고, `tests/prompt-cache-prefix.test.js` 가 "고정 프리픽스의
    // 마지막 블록에만 존재" 를 지키고 있다. breakpoint 를 늘리면 그 불변이 깨진다.
    const blocks = toAnthropicSystem([
      { text: 'A', cacheable: true },
      { text: 'B', cacheable: true },
      { text: 'C' },
    ]);
    expect(blocks[0]).not.toHaveProperty('cache_control');
    expect(blocks[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(blocks[2]).not.toHaveProperty('cache_control');
  });

  it('cacheable 이 하나도 없으면 cache_control 이 없다', () => {
    const blocks = toAnthropicSystem([{ text: 'A' }, { text: 'B' }]);
    expect(blocks.every((block) => !('cache_control' in block))).toBe(true);
  });

  it('이미 SDK 모양인 블록은 그대로 통과시킨다', () => {
    const given = [{ type: 'text', text: 'A', cache_control: { type: 'ephemeral', ttl: '1h' } }];
    expect(toAnthropicSystem(given)).toEqual(given);
  });

  it('문자열 하나도 받는다', () => {
    expect(toAnthropicSystem('A')).toEqual([{ type: 'text', text: 'A' }]);
  });

  it('빈 입력은 빈 배열이다', () => {
    expect(toAnthropicSystem([])).toEqual([]);
    expect(toAnthropicSystem(undefined)).toEqual([]);
  });
});

describe('streamText — 기존 해설 호출과 같은 요청', () => {
  it('buildTutorRequest 가 만든 것과 정확히 같은 파라미터를 보낸다', async () => {
    const spy = vi
      .spyOn(client.beta.messages, 'stream')
      .mockReturnValue(fakeStream([], { usage: {} }));

    const provider = createAnthropicProvider();
    // eslint-disable-next-line no-empty
    for await (const _ of provider.streamText({ system: SYSTEM, messages: MESSAGES })) {
    }

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual(
      buildTutorRequest({ system: toAnthropicSystem(SYSTEM), messages: MESSAGES })
    );
  });

  it('기본값은 블루프린트 §7-1 그대로다 (low · 4000)', async () => {
    const spy = vi
      .spyOn(client.beta.messages, 'stream')
      .mockReturnValue(fakeStream([], { usage: {} }));

    const provider = createAnthropicProvider();
    // eslint-disable-next-line no-empty
    for await (const _ of provider.streamText({ system: SYSTEM, messages: MESSAGES })) {
    }

    const params = spy.mock.calls[0][0];
    expect(params.model).toBe(MODEL);
    expect(params.max_tokens).toBe(TUTOR_MAX_TOKENS);
    expect(params.output_config).toEqual({ effort: TUTOR_EFFORT });
    // thinking 은 넣지 않는다 (Opus 5 는 기본 adaptive, budget_tokens 는 400)
    expect(params).not.toHaveProperty('thinking');
    // 서버측 폴백은 beta 로 나간다
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
  });

  it('maxTokens·effort 를 주면 그 둘만 바뀐다', async () => {
    const spy = vi
      .spyOn(client.beta.messages, 'stream')
      .mockReturnValue(fakeStream([], { usage: {} }));

    const provider = createAnthropicProvider();
    for await (const _ of provider.streamText({
      system: SYSTEM,
      messages: MESSAGES,
      maxTokens: 1234,
      effort: 'high',
      // eslint-disable-next-line no-empty
    })) {
    }

    const params = spy.mock.calls[0][0];
    const base = buildTutorRequest({ system: toAnthropicSystem(SYSTEM), messages: MESSAGES });
    expect(params).toEqual({
      ...base,
      max_tokens: 1234,
      output_config: { ...base.output_config, effort: 'high' },
    });
  });

  it('메시지 뒤에 assistant 를 붙이지 않는다 — prefill 은 Opus 5 에서 400 이다', async () => {
    const spy = vi
      .spyOn(client.beta.messages, 'stream')
      .mockReturnValue(fakeStream([], { usage: {} }));

    const provider = createAnthropicProvider();
    // eslint-disable-next-line no-empty
    for await (const _ of provider.streamText({ system: SYSTEM, messages: MESSAGES })) {
    }
    expect(spy.mock.calls[0][0].messages).toEqual(MESSAGES);
  });

  it('텍스트 델타를 흘리고 마지막에 done 을 낸다', async () => {
    vi.spyOn(client.beta.messages, 'stream').mockReturnValue(
      fakeStream(
        [
          { type: 'message_start', message: { usage: { input_tokens: 10 } } },
          textDelta('## 채점\n'),
          { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '음' } },
          textDelta('정규화입니다.'),
        ],
        {
          usage: {
            input_tokens: 120,
            output_tokens: 480,
            cache_read_input_tokens: 4800,
            cache_creation_input_tokens: 0,
          },
        }
      )
    );

    const events = [];
    for await (const event of createAnthropicProvider().streamText({
      system: SYSTEM,
      messages: MESSAGES,
    })) {
      events.push(event);
    }

    expect(events.filter((e) => e.type === 'text').map((e) => e.text)).toEqual([
      '## 채점\n',
      '정규화입니다.',
    ]);
    expect(events.at(-1)).toEqual({
      type: 'done',
      usage: {
        model: MODEL,
        inputTokens: 120,
        outputTokens: 480,
        cacheReadTokens: 4800,
        cacheCreationTokens: 0,
      },
    });
  });

  it('finalMessage 에 usage 가 없으면 전부 null 이다', async () => {
    vi.spyOn(client.beta.messages, 'stream').mockReturnValue(fakeStream([textDelta('a')], {}));

    const events = [];
    for await (const event of createAnthropicProvider().streamText({
      system: SYSTEM,
      messages: MESSAGES,
    })) {
      events.push(event);
    }
    expect(events.at(-1).usage.inputTokens).toBeNull();
  });
});

describe('completeJson — 기존 채점 호출과 같은 요청', () => {
  it('buildGradeRequest 가 만든 것과 정확히 같은 파라미터를 보낸다', async () => {
    const spy = vi.spyOn(client.beta.messages, 'parse').mockResolvedValue({ content: [] });

    await createAnthropicProvider().completeJson({
      system: SYSTEM,
      messages: MESSAGES,
      schema: SCHEMA,
    });

    expect(spy.mock.calls[0][0]).toEqual(
      buildGradeRequest({ system: toAnthropicSystem(SYSTEM), messages: MESSAGES, schema: SCHEMA })
    );
  });

  it('기본값은 medium · 8000 이고 구조화 출력에 strict 필드는 없다', async () => {
    const spy = vi.spyOn(client.beta.messages, 'parse').mockResolvedValue({ content: [] });

    await createAnthropicProvider().completeJson({
      system: SYSTEM,
      messages: MESSAGES,
      schema: SCHEMA,
    });

    const params = spy.mock.calls[0][0];
    expect(params.max_tokens).toBe(GRADE_MAX_TOKENS);
    expect(params.output_config).toEqual({
      effort: GRADE_EFFORT,
      format: { type: 'json_schema', schema: SCHEMA },
    });
    expect(params.output_config.format).not.toHaveProperty('strict');
    expect(params).not.toHaveProperty('thinking');
  });

  it('parsed_output 이 있으면 그것이 data 다', async () => {
    vi.spyOn(client.beta.messages, 'parse').mockResolvedValue({
      parsed_output: { verdict: 'correct' },
      content: [{ type: 'text', text: '{"verdict":"correct"}' }],
      usage: { input_tokens: 5, output_tokens: 2 },
    });

    const result = await createAnthropicProvider().completeJson({
      system: SYSTEM,
      messages: MESSAGES,
      schema: SCHEMA,
    });

    expect(result.data).toEqual({ verdict: 'correct' });
    expect(result.text).toBe('{"verdict":"correct"}');
    expect(result.usage.inputTokens).toBe(5);
  });

  it('parsed_output 이 없으면 data 는 null 이고 text 만 준다 — 호출부가 파싱한다', async () => {
    vi.spyOn(client.beta.messages, 'parse').mockResolvedValue({
      content: [
        { type: 'text', text: '{"verdict":' },
        { type: 'thinking', thinking: '무시된다' },
        { type: 'text', text: '"partial"}' },
      ],
    });

    const result = await createAnthropicProvider().completeJson({
      system: SYSTEM,
      messages: MESSAGES,
      schema: SCHEMA,
    });

    expect(result.data).toBeNull();
    expect(result.text).toBe('{"verdict":"partial"}');
  });

  it('maxTokens·effort 를 주면 그 둘만 바뀐다', async () => {
    const spy = vi.spyOn(client.beta.messages, 'parse').mockResolvedValue({ content: [] });

    await createAnthropicProvider().completeJson({
      system: SYSTEM,
      messages: MESSAGES,
      schema: SCHEMA,
      maxTokens: 999,
      effort: 'low',
    });

    const base = buildGradeRequest({
      system: toAnthropicSystem(SYSTEM),
      messages: MESSAGES,
      schema: SCHEMA,
    });
    expect(spy.mock.calls[0][0]).toEqual({
      ...base,
      max_tokens: 999,
      output_config: { ...base.output_config, effort: 'low' },
    });
  });
});

describe('runToolLoop — 기존 플래너 호출과 같은 요청', () => {
  /** SDK Tool Runner 흉내 — 넘겨받은 도구를 실제로 부르고 최종 메시지를 준다 */
  function fakeRunner({ toolCalls = [], final = { content: [] } } = {}) {
    let captured = null;
    const runner = {
      params: () => captured,
      [Symbol.asyncIterator]: async function* () {
        yield {
          finalMessage: async () => {
            for (const { name, input } of toolCalls) {
              const tool = captured.tools.find((candidate) => candidate.name === name);
              if (tool) await tool.run(input);
            }
            return { content: [] };
          },
        };
      },
      done: async () => final,
    };
    runner.capture = (params) => {
      captured = params;
      return runner;
    };
    return runner;
  }

  const neutralTools = (run = () => ({ ok: 1 })) => [
    {
      name: 'search_content',
      description: '교재를 찾는다',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      run,
    },
  ];

  it('buildPlanRequest 와 같은 파라미터로 toolRunner 를 연다', async () => {
    const runner = fakeRunner();
    vi.spyOn(client.beta.messages, 'toolRunner').mockImplementation((params) =>
      runner.capture(params)
    );

    await createAnthropicProvider().runToolLoop({
      system: SYSTEM,
      messages: MESSAGES,
      tools: neutralTools(),
      schema: SCHEMA,
    });

    const params = runner.params();
    const base = buildPlanRequest({
      system: toAnthropicSystem(SYSTEM),
      messages: MESSAGES,
      tools: params.tools, // 도구 객체 자체는 아래에서 따로 본다
      schema: SCHEMA,
    });
    expect(params).toEqual(base);
    expect(params.max_tokens).toBe(PLAN_MAX_TOKENS);
    expect(params.output_config.effort).toBe(PLAN_EFFORT);
    expect(params.stream).toBe(true);
    expect(params).not.toHaveProperty('thinking');
  });

  it('기본 호출 상한(12)이면 max_iterations 는 기존 값 그대로다', async () => {
    const runner = fakeRunner();
    vi.spyOn(client.beta.messages, 'toolRunner').mockImplementation((params) =>
      runner.capture(params)
    );

    await createAnthropicProvider().runToolLoop({
      system: SYSTEM,
      messages: MESSAGES,
      tools: neutralTools(),
      schema: SCHEMA,
      maxToolCalls: 12,
    });
    expect(runner.params().max_iterations).toBe(PLAN_MAX_ITERATIONS);
  });

  it('도구를 SDK 형태로 옮기고 strict 를 얹는다', async () => {
    const runner = fakeRunner();
    vi.spyOn(client.beta.messages, 'toolRunner').mockImplementation((params) =>
      runner.capture(params)
    );

    await createAnthropicProvider().runToolLoop({
      system: SYSTEM,
      messages: MESSAGES,
      tools: neutralTools(),
      schema: SCHEMA,
    });

    const [tool] = runner.params().tools;
    expect(tool.name).toBe('search_content');
    expect(tool.strict).toBe(true);
    expect(tool.input_schema).toEqual({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    });
    expect(typeof tool.run).toBe('function');
  });

  it('도구를 실행하고 진행 이벤트를 낸다', async () => {
    const run = vi.fn(() => ({ sections: [] }));
    const events = [];
    const runner = fakeRunner({ toolCalls: [{ name: 'search_content', input: { query: 'x' } }] });
    vi.spyOn(client.beta.messages, 'toolRunner').mockImplementation((params) =>
      runner.capture(params)
    );

    const result = await createAnthropicProvider().runToolLoop({
      system: SYSTEM,
      messages: MESSAGES,
      tools: neutralTools(run),
      schema: SCHEMA,
      onEvent: (event) => events.push(event),
    });

    expect(run).toHaveBeenCalledWith({ query: 'x' });
    expect(result.toolCalls).toBe(1);
    expect(events).toEqual([
      { type: 'tool', name: 'search_content', input: { query: 'x' } },
      { type: 'tool_result', name: 'search_content', ok: true },
    ]);
  });

  it('상한을 넘으면 실행하지 않고 "마무리하라" 는 결과를 돌려준다', async () => {
    const run = vi.fn(() => ({ ok: 1 }));
    const runner = fakeRunner({
      toolCalls: [
        { name: 'search_content', input: {} },
        { name: 'search_content', input: {} },
        { name: 'search_content', input: {} },
      ],
    });
    vi.spyOn(client.beta.messages, 'toolRunner').mockImplementation((params) =>
      runner.capture(params)
    );

    const result = await createAnthropicProvider().runToolLoop({
      system: SYSTEM,
      messages: MESSAGES,
      tools: neutralTools(run),
      schema: SCHEMA,
      maxToolCalls: 2,
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(result.toolCalls).toBe(2);
  });

  it('도구가 던져도 루프는 죽지 않고 error 결과를 돌려준다', async () => {
    const runner = fakeRunner({ toolCalls: [{ name: 'search_content', input: {} }] });
    vi.spyOn(client.beta.messages, 'toolRunner').mockImplementation((params) =>
      runner.capture(params)
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const events = [];
    await createAnthropicProvider().runToolLoop({
      system: SYSTEM,
      messages: MESSAGES,
      tools: neutralTools(() => {
        throw new Error('터짐');
      }),
      schema: SCHEMA,
      onEvent: (event) => events.push(event),
    });

    expect(events.at(-1)).toEqual({ type: 'tool_result', name: 'search_content', ok: false });
  });

  it('도구 결과는 언제나 문자열이다 — SDK 가 그대로 메시지에 싣는다', async () => {
    let returned;
    const runner = fakeRunner({ toolCalls: [{ name: 'search_content', input: {} }] });
    vi.spyOn(client.beta.messages, 'toolRunner').mockImplementation((params) => {
      runner.capture(params);
      return runner;
    });

    const provider = createAnthropicProvider();
    const tools = neutralTools(() => ({ hits: 3 }));
    const wrapped = { ...tools[0] };
    await provider.runToolLoop({
      system: SYSTEM,
      messages: MESSAGES,
      tools: [wrapped],
      schema: SCHEMA,
    });

    returned = await runner.params().tools[0].run({});
    expect(typeof returned).toBe('string');
    expect(JSON.parse(returned)).toEqual({ hits: 3 });
  });

  it('done() 의 최종 메시지에서 data·text·usage 를 꺼낸다', async () => {
    const runner = fakeRunner({
      final: {
        parsed_output: { date: '2026-09-07' },
        content: [{ type: 'text', text: '{"date":"2026-09-07"}' }],
        usage: { input_tokens: 25_000, output_tokens: 2_000 },
      },
    });
    vi.spyOn(client.beta.messages, 'toolRunner').mockImplementation((params) =>
      runner.capture(params)
    );

    const result = await createAnthropicProvider().runToolLoop({
      system: SYSTEM,
      messages: MESSAGES,
      tools: neutralTools(),
      schema: SCHEMA,
    });

    expect(result.data).toEqual({ date: '2026-09-07' });
    expect(result.text).toBe('{"date":"2026-09-07"}');
    expect(result.usage.inputTokens).toBe(25_000);
    expect(result.usage.cacheReadTokens).toBeNull();
  });
});

describe('classifyError — 기존 분류를 그대로 쓴다', () => {
  const cases = [
    ['NotFoundError', new Anthropic.NotFoundError(404, {}, '없음', new Headers())],
    ['RateLimitError', new Anthropic.RateLimitError(429, {}, '한도', new Headers())],
    ['APIConnectionError', new Anthropic.APIConnectionError({ message: '연결 실패' })],
    ['APIError(500)', new Anthropic.APIError(500, {}, '서버 오류', new Headers())],
    ['APIError(400)', new Anthropic.APIError(400, {}, '요청 오류', new Headers())],
    ['그 밖의 예외', new Error('무슨 일이')],
  ];

  it.each(cases)('%s 는 classifyUpstreamError 와 같은 결과다', (_label, error) => {
    expect(createAnthropicProvider().classifyError(error)).toEqual(classifyUpstreamError(error));
  });

  it('APIConnectionError 가 APIError 보다 먼저 걸린다 (순서가 뒤집히면 재시도 판정이 바뀐다)', () => {
    const failure = createAnthropicProvider().classifyError(
      new Anthropic.APIConnectionError({ message: 'x' })
    );
    expect(failure.retryable).toBe(true);
    expect(failure.status).toBeUndefined();
  });
});
