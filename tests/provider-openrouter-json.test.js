// completeJson — 구조화 출력 3단 폴백 (`lib/ai/providers/openrouter.js`).
//
// 무료 모델 대부분은 엄격 스키마(`structured_outputs`)를 지원하지 않는다.
// 그래서 세 단계로 내려간다:
//   ① json_schema  — 모델이 스키마를 지킨다 (가장 믿을 만함)
//   ② json_object  — JSON 인 것만 보장. 스키마는 프롬프트로 알린다
//   ③ 평문        — 아무 보장 없음. 스키마는 프롬프트로만 알린다
// 어느 단계든 `data` 를 못 만들면 `text` 를 그대로 넘기고 호출부가 파싱한다
// (`normalizeGrade`·`extractPlan` 이 이미 그 경로를 갖고 있다).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOpenRouterProvider } from '../lib/ai/providers/openrouter.js';

const SCHEMA = {
  type: 'object',
  properties: { verdict: { type: 'string' }, score: { type: 'integer' } },
  required: ['verdict', 'score'],
  additionalProperties: false,
};

/** 능력표에 있는 모델 3종 — 각 단계를 대표한다 */
const STRICT_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'; // ① json_schema
const OBJECT_MODEL = 'minimax/minimax-m3:free'; // ② json_object
const PLAIN_MODEL = 'thinkingmachines/inkling:free'; // ③ 평문

const KEY = 'sk-or-test';
const envFor = (model) => ({ OPENROUTER_API_KEY: KEY, OPENROUTER_MODEL: model });

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

const reply = (content, extra = {}) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
      ...extra,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

const bodyOf = (index = 0) => JSON.parse(fetchMock.mock.calls[index][1].body);
const systemOf = (index = 0) => bodyOf(index).messages.find((m) => m.role === 'system')?.content ?? '';

const call = (model, args = {}) =>
  createOpenRouterProvider(envFor(model)).completeJson({
    system: [{ text: '너는 채점자다' }],
    messages: [{ role: 'user', content: '답안' }],
    schema: SCHEMA,
    schemaName: 'grade',
    ...args,
  });

describe('① json_schema — 엄격 스키마를 쓰는 모델', () => {
  it('response_format 에 스키마를 그대로 싣는다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{"verdict":"correct","score":100}'));
    await call(STRICT_MODEL);

    expect(bodyOf().response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'grade', strict: true, schema: SCHEMA },
    });
  });

  it('스키마를 프롬프트에 또 적지 않는다 — 모델이 이미 강제로 지킨다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{"verdict":"correct","score":100}'));
    await call(STRICT_MODEL);
    expect(systemOf()).toBe('너는 채점자다');
  });

  it('스키마 이름이 없으면 기본 이름을 쓴다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{}'));
    await call(STRICT_MODEL, { schemaName: undefined });
    expect(bodyOf().response_format.json_schema.name).toBe('output');
  });

  it('이름에 쓸 수 없는 문자(공백·한글)는 걸러 낸다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{}'));
    await call(STRICT_MODEL, { schemaName: '채점 결과 v2' });
    expect(bodyOf().response_format.json_schema.name).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('스트리밍이 아니다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{}'));
    await call(STRICT_MODEL);
    expect(bodyOf().stream).toBeFalsy();
  });
});

describe('② json_object — response_format 만 되는 모델', () => {
  it('json_object 를 걸고 스키마는 프롬프트로 내린다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{"verdict":"partial","score":60}'));
    await call(OBJECT_MODEL);

    expect(bodyOf().response_format).toEqual({ type: 'json_object' });
    expect(systemOf()).toContain('"verdict"');
    expect(systemOf()).toContain('너는 채점자다');
  });

  it('스키마 설명은 system 지시 **뒤에** 붙는다 — 마지막 지시가 형식이어야 한다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{}'));
    await call(OBJECT_MODEL);
    expect(systemOf().indexOf('너는 채점자다')).toBeLessThan(systemOf().indexOf('출력 형식'));
  });
});

describe('③ 평문 — 둘 다 안 되는 모델', () => {
  it('response_format 을 아예 보내지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{"verdict":"incorrect","score":0}'));
    await call(PLAIN_MODEL);
    expect(bodyOf()).not.toHaveProperty('response_format');
  });

  it('스키마는 프롬프트로만 알린다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{}'));
    await call(PLAIN_MODEL);
    expect(systemOf()).toContain('"verdict"');
  });

  it('그래도 JSON 을 내면 data 가 만들어진다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{"verdict":"correct","score":95}'));
    const result = await call(PLAIN_MODEL);
    expect(result.data).toEqual({ verdict: 'correct', score: 95 });
  });
});

describe('스키마가 없으면 구조화 출력을 걸지 않는다', () => {
  it('json_schema 모델이어도 response_format 이 없다', async () => {
    fetchMock.mockResolvedValueOnce(reply('그냥 텍스트'));
    await call(STRICT_MODEL, { schema: undefined, schemaName: undefined });
    expect(bodyOf()).not.toHaveProperty('response_format');
    expect(systemOf()).toBe('너는 채점자다');
  });
});

describe('응답 해석 — data 와 text', () => {
  it('JSON 을 그대로 내면 data 와 text 를 모두 준다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{"verdict":"correct","score":100}'));
    const result = await call(STRICT_MODEL);

    expect(result.data).toEqual({ verdict: 'correct', score: 100 });
    expect(result.text).toBe('{"verdict":"correct","score":100}');
  });

  it('코드펜스로 감싸 와도 data 를 만든다. text 는 원문 그대로다', async () => {
    fetchMock.mockResolvedValueOnce(reply('```json\n{"verdict":"partial","score":50}\n```'));
    const result = await call(OBJECT_MODEL);

    expect(result.data).toEqual({ verdict: 'partial', score: 50 });
    expect(result.text).toContain('```');
  });

  it('앞뒤에 설명이 붙어도 data 를 만든다', async () => {
    fetchMock.mockResolvedValueOnce(
      reply('채점했습니다.\n{"verdict":"incorrect","score":10}\n이상입니다.')
    );
    expect((await call(PLAIN_MODEL)).data).toEqual({ verdict: 'incorrect', score: 10 });
  });

  it('스키마를 어긴 JSON 도 그대로 넘긴다 — 판정은 호출부가 한다', async () => {
    fetchMock.mockResolvedValueOnce(reply('{"verdict":"아마 맞음","score":"높음"}'));
    expect((await call(STRICT_MODEL)).data).toEqual({ verdict: '아마 맞음', score: '높음' });
  });

  it('JSON 을 못 건지면 data 는 null, text 는 그대로다', async () => {
    fetchMock.mockResolvedValueOnce(reply('채점할 수 없습니다.'));
    const result = await call(PLAIN_MODEL);

    expect(result.data).toBeNull();
    expect(result.text).toBe('채점할 수 없습니다.');
  });

  it('content 가 없으면 text 는 빈 문자열이다', async () => {
    fetchMock.mockResolvedValueOnce(reply(null));
    const result = await call(STRICT_MODEL);
    expect(result.text).toBe('');
    expect(result.data).toBeNull();
  });

  it('choices 가 비어도 터지지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [], usage: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const result = await call(STRICT_MODEL);
    expect(result.text).toBe('');
    expect(result.data).toBeNull();
  });

  it('content 가 배열(멀티파트)로 와도 텍스트를 이어 붙인다', async () => {
    fetchMock.mockResolvedValueOnce(
      reply([
        { type: 'text', text: '{"verdict":' },
        { type: 'text', text: '"correct","score":100}' },
      ])
    );
    expect((await call(STRICT_MODEL)).data).toEqual({ verdict: 'correct', score: 100 });
  });

  it('거절(refusal)이 오면 그것을 text 로 준다', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: null, refusal: '답할 수 없습니다' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const result = await call(STRICT_MODEL);
    expect(result.text).toBe('답할 수 없습니다');
    expect(result.data).toBeNull();
  });
});

describe('usage', () => {
  it('prompt·completion·cached 를 계약 이름으로 옮긴다', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{}' } }],
          usage: {
            prompt_tokens: 1200,
            completion_tokens: 340,
            prompt_tokens_details: { cached_tokens: 900 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const { usage } = await call(STRICT_MODEL);
    expect(usage).toEqual({
      model: STRICT_MODEL,
      // `prompt_tokens` 1200 은 캐시로 읽은 900 을 **포함한** 값이다.
      // 계약(`lib/ai/usage.js`)은 세 입력 항목이 겹치지 않는다고 전제하므로 빼서 넘긴다.
      inputTokens: 300,
      outputTokens: 340,
      cacheReadTokens: 900,
      cacheCreationTokens: null,
    });
  });

  it('usage 가 없으면 전부 null 이다 — 0 이 아니다', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { usage } = await call(STRICT_MODEL);
    expect(usage.inputTokens).toBeNull();
    expect(usage.outputTokens).toBeNull();
    expect(usage.cacheReadTokens).toBeNull();
    expect(usage.cacheCreationTokens).toBeNull();
  });
});

describe('능력표가 틀렸을 때 — 한 단계 내려 한 번만 다시 시도한다', () => {
  const unsupported = (message) =>
    new Response(JSON.stringify({ error: { code: 400, message } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

  it('json_schema 가 거부되면 json_object 로 내려 다시 보낸다', async () => {
    fetchMock
      .mockResolvedValueOnce(unsupported('response_format.json_schema is not supported'))
      .mockResolvedValueOnce(reply('{"verdict":"correct","score":100}'));

    const result = await call(STRICT_MODEL);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(0).response_format.type).toBe('json_schema');
    expect(bodyOf(1).response_format).toEqual({ type: 'json_object' });
    // 내려간 단계에서는 스키마를 프롬프트로 알린다
    expect(systemOf(1)).toContain('"verdict"');
    expect(result.data).toEqual({ verdict: 'correct', score: 100 });
  });

  it('json_object 도 거부되면 평문으로 내린다', async () => {
    fetchMock
      .mockResolvedValueOnce(unsupported('response_format is not supported by this provider'))
      .mockResolvedValueOnce(reply('{"verdict":"partial","score":70}'));

    await call(OBJECT_MODEL);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(1)).not.toHaveProperty('response_format');
  });

  it('한 번 내려간 뒤에는 같은 프로바이더가 처음부터 낮은 단계로 보낸다', async () => {
    const provider = createOpenRouterProvider(envFor(STRICT_MODEL));
    fetchMock
      .mockResolvedValueOnce(unsupported('structured outputs are not supported'))
      .mockResolvedValueOnce(reply('{}'))
      .mockResolvedValueOnce(reply('{}'));

    const args = { system: [], messages: [], schema: SCHEMA, schemaName: 'grade' };
    await provider.completeJson(args);
    await provider.completeJson(args);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(2).response_format).toEqual({ type: 'json_object' });
  });

  it('구조화 출력과 무관한 400 은 다시 시도하지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(unsupported('messages: field required'));
    await expect(call(STRICT_MODEL)).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('평문 단계에서 난 오류는 더 내려갈 곳이 없으므로 그대로 던진다', async () => {
    fetchMock.mockResolvedValueOnce(unsupported('response_format is not supported'));
    await expect(call(PLAIN_MODEL)).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('내려간 뒤에도 실패하면 두 번째 오류를 던진다 — 무한 재시도는 없다', async () => {
    fetchMock
      .mockResolvedValueOnce(unsupported('json_schema is not supported'))
      .mockResolvedValueOnce(unsupported('response_format is not supported'));

    await expect(call(STRICT_MODEL)).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
