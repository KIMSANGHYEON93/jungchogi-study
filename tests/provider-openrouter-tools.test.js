// runToolLoop — 도구 루프 (`lib/ai/providers/openrouter.js`).
//
// SDK Tool Runner 에 해당하는 것이 없어 직접 돈다. 어긋나면 곧바로 400 이 나는 지점들:
//   · `tool_calls` 는 **배열**이다. 한 턴에 여러 도구를 병렬로 부른다.
//   · 부른 도구 하나하나에 `{role:'tool', tool_call_id, content}` 를 **전부** 돌려줘야 한다.
//   · 도구를 부른 assistant 메시지를 `tool_calls` 째로 대화에 남겨야 한다.
// 그리고 상한을 넘겼을 때는 `lib/ai/tools/index.js` 와 같은 방식으로 —
// 실행하지 않고 "더 못 쓴다, 지금까지 모은 것으로 마무리하라" 는 결과를 돌려준다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOpenRouterProvider } from '../lib/ai/providers/openrouter.js';

const KEY_ENV = { OPENROUTER_API_KEY: 'sk-or-test' };

const PLAN_SCHEMA = {
  type: 'object',
  properties: { date: { type: 'string' }, items: { type: 'array', items: { type: 'object' } } },
  required: ['date', 'items'],
  additionalProperties: false,
};

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** 도구를 부르는 턴 */
const toolTurn = (calls, usage) =>
  json({
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: calls.map((call, index) => ({
            id: call.id ?? `call_${index}`,
            type: 'function',
            function: { name: call.name, arguments: call.arguments ?? '{}' },
          })),
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage,
  });

/** 최종 답을 내는 턴 */
const finalTurn = (content, usage) =>
  json({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage,
  });

const bodyOf = (index) => JSON.parse(fetchMock.mock.calls[index][1].body);

const tool = (name, run, extra = {}) => ({
  name,
  description: `${name} 설명`,
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  run,
  ...extra,
});

const runLoop = (args = {}) =>
  createOpenRouterProvider(KEY_ENV).runToolLoop({
    system: [{ text: '너는 플래너다' }],
    messages: [{ role: 'user', content: '오늘 계획' }],
    tools: [],
    maxToolCalls: 12,
    maxTokens: 16000,
    effort: 'high',
    schema: PLAN_SCHEMA,
    schemaName: 'plan',
    ...args,
  });

describe('도구 정의 전달', () => {
  it('OpenAI 형식으로 옮긴다', async () => {
    fetchMock.mockResolvedValueOnce(finalTurn('{"date":"2026-09-07","items":[]}'));
    await runLoop({ tools: [tool('search_content', () => ({ hits: [] }))] });

    expect(bodyOf(0).tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'search_content',
          description: 'search_content 설명',
          parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        },
      },
    ]);
  });

  it('도구가 없으면 tools 를 아예 보내지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));
    await runLoop({ tools: [] });
    expect(bodyOf(0)).not.toHaveProperty('tools');
  });

  it('구조화 출력과 effort 를 도구와 함께 건다', async () => {
    fetchMock.mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));
    await runLoop({ tools: [tool('t', () => ({}))] });

    expect(bodyOf(0).response_format.type).toBe('json_schema');
    expect(bodyOf(0).reasoning_effort).toBe('high');
  });
});

describe('도구 0회 — 바로 답하는 경우', () => {
  it('요청 한 번으로 끝나고 toolCalls 는 0 이다', async () => {
    fetchMock.mockResolvedValueOnce(finalTurn('{"date":"2026-09-07","items":[]}'));
    const result = await runLoop({ tools: [tool('t', () => ({}))] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.toolCalls).toBe(0);
    expect(result.data).toEqual({ date: '2026-09-07', items: [] });
    expect(result.text).toBe('{"date":"2026-09-07","items":[]}');
  });

  it('JSON 을 못 건지면 data 는 null, text 는 그대로다', async () => {
    fetchMock.mockResolvedValueOnce(finalTurn('계획을 세울 수 없습니다.'));
    const result = await runLoop({ tools: [] });

    expect(result.data).toBeNull();
    expect(result.text).toBe('계획을 세울 수 없습니다.');
  });
});

describe('도구 1회', () => {
  it('도구를 실행하고 결과를 tool 메시지로 되돌린다', async () => {
    const run = vi.fn(() => ({ sections: ['3-1. 정규화'] }));
    fetchMock
      .mockResolvedValueOnce(
        toolTurn([{ name: 'search_content', arguments: '{"query":"정규화","limit":3}' }])
      )
      .mockResolvedValueOnce(finalTurn('{"date":"2026-09-07","items":[]}'));

    const result = await runLoop({ tools: [tool('search_content', run)] });

    expect(run).toHaveBeenCalledWith({ query: '정규화', limit: 3 });
    expect(result.toolCalls).toBe(1);

    const second = bodyOf(1).messages;
    // 도구를 부른 assistant 메시지가 tool_calls 째로 남아 있어야 한다
    const assistant = second.find((m) => m.role === 'assistant');
    expect(assistant.tool_calls).toHaveLength(1);
    // 결과는 tool 메시지로, 같은 id 를 달고 돌아간다
    const toolMessage = second.find((m) => m.role === 'tool');
    expect(toolMessage.tool_call_id).toBe('call_0');
    expect(JSON.parse(toolMessage.content)).toEqual({ sections: ['3-1. 정규화'] });
  });

  it('원래 대화(system·user)는 매 턴 그대로 실린다', async () => {
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await runLoop({ tools: [tool('t', () => ({}))] });

    const roles = bodyOf(1).messages.map((m) => m.role);
    expect(roles.slice(0, 2)).toEqual(['system', 'user']);
  });

  it('run 이 문자열을 돌려주면 그대로 싣는다 (기존 도구 래퍼가 그렇게 준다)', async () => {
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await runLoop({ tools: [tool('t', () => '{"already":"json"}')] });
    expect(bodyOf(1).messages.find((m) => m.role === 'tool').content).toBe('{"already":"json"}');
  });

  it('비동기 run 도 기다린다', async () => {
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await runLoop({ tools: [tool('t', async () => ({ ok: 1 }))] });
    expect(JSON.parse(bodyOf(1).messages.find((m) => m.role === 'tool').content)).toEqual({ ok: 1 });
  });
});

describe('한 턴에 여러 도구 (병렬 호출)', () => {
  it('전부 실행하고 부른 수만큼 tool 메시지를 돌려준다', async () => {
    const calls = [];
    const make = (name) => tool(name, () => ({ from: name }), {});

    fetchMock
      .mockResolvedValueOnce(
        toolTurn([
          { name: 'get_weak_categories', id: 'a' },
          { name: 'get_due_reviews', id: 'b' },
          { name: 'search_content', id: 'c', arguments: '{"query":"SQL"}' },
        ])
      )
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    const result = await runLoop({
      tools: ['get_weak_categories', 'get_due_reviews', 'search_content'].map((name) => {
        const t = make(name);
        const original = t.run;
        t.run = (input) => {
          calls.push(name);
          return original(input);
        };
        return t;
      }),
    });

    expect(calls).toEqual(['get_weak_categories', 'get_due_reviews', 'search_content']);
    expect(result.toolCalls).toBe(3);

    const toolMessages = bodyOf(1).messages.filter((m) => m.role === 'tool');
    expect(toolMessages.map((m) => m.tool_call_id)).toEqual(['a', 'b', 'c']);
  });

  it('하나가 실패해도 나머지 결과를 함께 돌려준다 — 빠뜨리면 다음 요청이 400 이다', async () => {
    fetchMock
      .mockResolvedValueOnce(
        toolTurn([
          { name: 'ok_tool', id: 'a' },
          { name: 'bad_tool', id: 'b' },
        ])
      )
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await runLoop({
      tools: [
        tool('ok_tool', () => ({ ok: true })),
        tool('bad_tool', () => {
          throw new Error('터짐');
        }),
      ],
    });

    const toolMessages = bodyOf(1).messages.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(2);
    expect(JSON.parse(toolMessages[1].content).error).toMatch(/bad_tool/);
  });
});

describe('도구 호출 상한', () => {
  it('상한을 넘으면 실행하지 않고 "더 못 쓴다" 는 결과를 돌려준다', async () => {
    const run = vi.fn(() => ({ ok: 1 }));
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't', id: 'a' }, { name: 't', id: 'b' }, { name: 't', id: 'c' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    const result = await runLoop({ maxToolCalls: 2, tools: [tool('t', run)] });

    expect(run).toHaveBeenCalledTimes(2);
    expect(result.toolCalls).toBe(2);

    const toolMessages = bodyOf(1).messages.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(3);
    expect(JSON.parse(toolMessages[2].content).error).toMatch(/상한/);
    expect(JSON.parse(toolMessages[2].content).error).toMatch(/마무리/);
  });

  it('상한 뒤에도 도구만 부르며 맴돌면 반복 상한에서 끊는다', async () => {
    // 언제나 도구를 부르는 모델. Response 본문은 한 번만 읽을 수 있으므로 매번 새로 만든다.
    fetchMock.mockImplementation(() => toolTurn([{ name: 't' }]));

    const result = await runLoop({ maxToolCalls: 2, tools: [tool('t', () => ({}))] });

    // 무한히 돌지 않는다
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2 + 5);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
    // 계획을 못 냈다 — 호출부가 "도구만 남기고 끝냈다" 로 판정한다
    expect(result.text).toBe('');
    expect(result.data).toBeNull();
  });
});

describe('도구 인자와 이름이 이상할 때', () => {
  it('모르는 도구 이름이면 실행하지 않고 쓸 수 있는 이름을 알려 준다', async () => {
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 'get_answers' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    const result = await runLoop({ tools: [tool('search_content', () => ({}))] });

    expect(result.toolCalls).toBe(0);
    const message = JSON.parse(bodyOf(1).messages.find((m) => m.role === 'tool').content);
    expect(message.error).toMatch(/get_answers/);
    expect(message.error).toMatch(/search_content/);
  });

  it('인자 JSON 이 깨지면 실행하지 않고 다시 만들라고 한다', async () => {
    const run = vi.fn();
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't', arguments: '{"query": 깨짐' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    const result = await runLoop({ tools: [tool('t', run)] });

    expect(run).not.toHaveBeenCalled();
    expect(result.toolCalls).toBe(0);
    expect(JSON.parse(bodyOf(1).messages.find((m) => m.role === 'tool').content).error).toMatch(
      /JSON/
    );
  });

  it('인자가 비어 있으면 빈 객체로 부른다 — 인자 없는 도구가 둘이나 있다', async () => {
    const run = vi.fn(() => ({}));
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 'get_due_reviews', arguments: '' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await runLoop({ tools: [tool('get_due_reviews', run)] });
    expect(run).toHaveBeenCalledWith({});
  });

  it('인자가 문자열이 아니라 객체로 와도 그대로 넘긴다', async () => {
    const run = vi.fn(() => ({}));
    fetchMock
      .mockResolvedValueOnce(
        json({
          choices: [
            {
              message: {
                role: 'assistant',
                tool_calls: [
                  { id: 'a', type: 'function', function: { name: 't', arguments: { query: 'x' } } },
                ],
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await runLoop({ tools: [tool('t', run)] });
    expect(run).toHaveBeenCalledWith({ query: 'x' });
  });

  it('인자가 JSON 스칼라면 빈 객체로 본다', async () => {
    const run = vi.fn(() => ({}));
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't', arguments: '"문자열"' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await runLoop({ tools: [tool('t', run)] });
    expect(run).toHaveBeenCalledWith({});
  });
});

describe('진행 이벤트 (onEvent)', () => {
  it('실행 전 tool, 실행 후 tool_result 를 낸다', async () => {
    const events = [];
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't', arguments: '{"q":1}' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await runLoop({ tools: [tool('t', () => ({ ok: 1 }))], onEvent: (e) => events.push(e) });

    expect(events).toEqual([
      { type: 'tool', name: 't', input: { q: 1 } },
      { type: 'tool_result', name: 't', ok: true },
    ]);
  });

  it('도구가 error 를 돌려주면 ok:false 다', async () => {
    const events = [];
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await runLoop({
      tools: [tool('t', () => ({ error: '섹션을 못 찾았습니다' }))],
      onEvent: (e) => events.push(e),
    });

    expect(events.at(-1)).toEqual({ type: 'tool_result', name: 't', ok: false });
  });

  it('도구가 던져도 ok:false 이벤트가 나가고 루프는 계속된다', async () => {
    const events = [];
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    const result = await runLoop({
      tools: [
        tool('t', () => {
          throw new Error('터짐');
        }),
      ],
      onEvent: (e) => events.push(e),
    });

    expect(events.at(-1).ok).toBe(false);
    expect(result.data).toEqual({ date: 'x', items: [] });
  });

  it('onEvent 가 없어도 돈다', async () => {
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't' }]))
      .mockResolvedValueOnce(finalTurn('{"date":"x","items":[]}'));

    await expect(runLoop({ tools: [tool('t', () => ({}))] })).resolves.toBeTruthy();
  });
});

describe('usage 합산', () => {
  it('턴마다 쓴 토큰을 모두 더한다', async () => {
    fetchMock
      .mockResolvedValueOnce(
        toolTurn([{ name: 't' }], { prompt_tokens: 1000, completion_tokens: 50 })
      )
      .mockResolvedValueOnce(
        finalTurn('{"date":"x","items":[]}', { prompt_tokens: 1400, completion_tokens: 900 })
      );

    const { usage } = await runLoop({ tools: [tool('t', () => ({}))] });
    expect(usage.inputTokens).toBe(2400);
    expect(usage.outputTokens).toBe(950);
  });

  it('한 턴이라도 usage 가 없으면 그 항목은 null 이다', async () => {
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't' }])) // usage 없음
      .mockResolvedValueOnce(
        finalTurn('{"date":"x","items":[]}', { prompt_tokens: 1400, completion_tokens: 900 })
      );

    const { usage } = await runLoop({ tools: [tool('t', () => ({}))] });
    expect(usage.inputTokens).toBeNull();
    expect(usage.outputTokens).toBeNull();
  });
});

describe('오류', () => {
  it('첫 턴의 실패는 분류돼 던져진다', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'x' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    );

    const provider = createOpenRouterProvider(KEY_ENV);
    try {
      await provider.runToolLoop({ system: [], messages: [], tools: [] });
      throw new Error('던져야 한다');
    } catch (error) {
      expect(provider.classifyError(error).retryable).toBe(true);
    }
  });

  it('도구를 돈 뒤의 실패도 던진다', async () => {
    fetchMock
      .mockResolvedValueOnce(toolTurn([{ name: 't' }]))
      .mockResolvedValueOnce(
        new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } })
      );

    await expect(runLoop({ tools: [tool('t', () => ({}))] })).rejects.toBeTruthy();
  });
});
