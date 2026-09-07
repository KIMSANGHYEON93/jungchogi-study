// 세 엔드포인트 × 두 프로바이더 = **여섯 조합의 응답 계약** (블루프린트 §4).
//
// ────────────────────────────────────────────────────────────────────────────
//  왜 이 파일이 필요한가
// ────────────────────────────────────────────────────────────────────────────
//  프론트엔드는 프로바이더를 모른다. `src/services/aiClient.js`·`sseClient.js` 와
//  화면들은 **한 벌의 계약**에만 붙어 있다:
//
//    SSE  : `data: {"delta":"…"}` / `{"phase":"tool",…}` /
//           `{"done":true,…,"usage":{…},"cost":{…}}` / `{"error":{code,message,retryable}}`
//    JSON : `{verdict,score,feedback,missedPoints,confidence,cost}`
//           오류는 `{error:{code,message,retryable}}` + 상태코드 401·429·400·502
//    규칙 : **스트림이 시작되기 전 실패는 JSON, 시작된 뒤는 SSE 프레임.**
//           헤더를 내보낸 뒤에는 상태코드를 되돌릴 수 없기 때문이다.
//
//  `tests/ai-{tutor,plan,grade}.test.js` 가 이 계약을 잡고 있지만 셋 다 Anthropic
//  SDK 를 모킹한다. 프로바이더를 갈아 끼웠을 때 **같은 계약이 나오는지**는 아무도
//  보지 않았다. 여기서 두 경로를 같은 단언에 태운다.
//
//  키가 없어 실제 호출은 못 한다. Anthropic 은 SDK 를, OpenRouter 는 `fetch` 를
//  모킹하되 **오류 클래스·HTTP 상태는 실물**을 써서 각 프로바이더의
//  `classifyError` 가 실제로 분류를 하게 둔다.

import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { streamMock, parseMock, toolRunnerMock } = vi.hoisted(() => ({
  streamMock: vi.fn(),
  parseMock: vi.fn(),
  toolRunnerMock: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal();
  const Real = actual.default;
  class MockAnthropic {
    constructor() {
      this.messages = { stream: streamMock, parse: parseMock };
      this.beta = {
        messages: { stream: streamMock, parse: parseMock, toolRunner: toolRunnerMock },
      };
    }
  }
  Object.setPrototypeOf(MockAnthropic, Real);
  return { ...actual, default: MockAnthropic };
});

const Anthropic = (await import('@anthropic-ai/sdk')).default;
const tutor = await import('../api/ai/tutor.js');
const grade = await import('../api/ai/grade.js');
const plan = await import('../api/ai/plan.js');
const { resetRateLimits } = await import('../lib/ai/guard.js');
const { resetClient } = await import('../lib/ai/client.js');
const { resetProvider } = await import('../lib/ai/provider.js');
const { clearContentCache } = await import('../lib/ai/content.js');
const { USAGE_RECORD_FIELDS } = await import('../lib/ai/usage.js');

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/ai-data', import.meta.url));

const GRADE = {
  verdict: 'partial',
  score: 60,
  feedback: '1NF 는 맞혔지만 BCNF 가 빠졌습니다.',
  missedPoints: ['BCNF'],
  confidence: 0.8,
};

const PLAN = {
  date: '2026-09-04',
  items: [{ type: 'study_day', day: 1, section: '포인터', minutes: 30, why: '기초' }],
  rationale: '기초부터',
  riskFlags: [],
};

/**
 * 두 프로바이더가 **같은 토큰 수**를 말하도록 맞춘 usage.
 *
 * OpenAI 호환의 `prompt_tokens` 는 캐시를 포함한 값이라 1200 = 300 + 900 이다
 * (`lib/ai/providers/usage.js`). 캐시 **쓰기**는 OpenAI 호환에 대응 항목이 없으므로
 * Anthropic 쪽에서도 싣지 않는다 — 그래야 done 프레임을 통째로 맞대 볼 수 있다.
 */
const ANTHROPIC_USAGE = { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 900 };
const OPENAI_USAGE = {
  prompt_tokens: 1_200,
  completion_tokens: 40,
  prompt_tokens_details: { cached_tokens: 900 },
};
/** 위 둘이 계약 모양으로 옮겨졌을 때의 결과 — 두 경로가 **같아야** 한다 */
const WIRE_USAGE = { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 900 };

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic 하네스
// ─────────────────────────────────────────────────────────────────────────────

const anthropicError = (kind) =>
  kind === 'rateLimited'
    ? new Anthropic.RateLimitError(429, {}, 'slow down', new Headers())
    : new Anthropic.InternalServerError(503, {}, 'overloaded', new Headers());

const textDelta = (text) => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text },
});

const anthropicMessage = (text, extra = {}) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text }],
  usage: ANTHROPIC_USAGE,
  ...extra,
});

const anthropicStream = (message) => ({
  async *[Symbol.asyncIterator]() {
    yield textDelta('첫 조각');
    yield textDelta(' 둘째 조각');
  },
  finalMessage: async () => message,
});

/** 도구 한 번 부르고 계획을 내는 Tool Runner 흉내 */
function anthropicRunner(params, { throwAtStart, throwAfterTool } = {}) {
  const byName = Object.fromEntries(params.tools.map((tool) => [tool.name, tool]));
  const final = anthropicMessage(JSON.stringify(PLAN));
  let turn = 0;

  return {
    [Symbol.asyncIterator]: () => ({
      async next() {
        if (turn === 0 && throwAtStart) throw throwAtStart;
        if (turn === 1) {
          await byName.get_due_reviews.run({});
          if (throwAfterTool) throw throwAfterTool;
        }
        if (turn > 1) return { done: true, value: undefined };

        const message =
          turn === 0
            ? {
                stop_reason: 'tool_use',
                content: [{ type: 'tool_use', id: 'tu_1', name: 'get_due_reviews', input: {} }],
                usage: ANTHROPIC_USAGE,
              }
            : final;
        turn += 1;
        return { done: false, value: anthropicStream(message) };
      },
    }),
    done: async () => final,
  };
}

const anthropicHarness = {
  name: 'anthropic',
  model: 'claude-opus-5',
  use() {
    vi.stubEnv('AI_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('OPENROUTER_API_KEY', '');
  },
  dropKey() {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  },
  tutor: {
    ok: () => streamMock.mockImplementation(() => anthropicStream(anthropicMessage('해설'))),
    failAtStart: (kind) =>
      streamMock.mockImplementation(() => ({
        async *[Symbol.asyncIterator]() {
          throw anthropicError(kind);
          // eslint-disable-next-line no-unreachable
          yield null;
        },
        finalMessage: async () => {
          throw anthropicError(kind);
        },
      })),
    failMidStream: (kind) =>
      streamMock.mockImplementation(() => ({
        async *[Symbol.asyncIterator]() {
          yield textDelta('앞부분');
          throw anthropicError(kind);
        },
        finalMessage: async () => {
          throw anthropicError(kind);
        },
      })),
  },
  grade: {
    ok: () =>
      parseMock.mockResolvedValue(
        anthropicMessage(JSON.stringify(GRADE), { parsed_output: GRADE })
      ),
    /** 구조화 출력이 안 걸린 경로 — 본문 텍스트에서 파싱해야 한다 */
    textOnly: (text = JSON.stringify(GRADE)) =>
      parseMock.mockResolvedValue(anthropicMessage(text, { parsed_output: null })),
    fail: (kind) => parseMock.mockRejectedValue(anthropicError(kind)),
  },
  plan: {
    ok: () => toolRunnerMock.mockImplementation((params) => anthropicRunner(params)),
    text: (text) =>
      toolRunnerMock.mockImplementation((params) => {
        const runner = anthropicRunner(params);
        return { ...runner, done: async () => anthropicMessage(text) };
      }),
    failAtStart: (kind) =>
      toolRunnerMock.mockImplementation((params) =>
        anthropicRunner(params, { throwAtStart: anthropicError(kind) })
      ),
    failAfterTool: (kind) =>
      toolRunnerMock.mockImplementation((params) =>
        anthropicRunner(params, { throwAfterTool: anthropicError(kind) })
      ),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter 하네스
// ─────────────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();
let fetchMock;

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const errorResponse = (kind) =>
  jsonResponse(
    { error: { message: kind === 'rateLimited' ? 'rate limit exceeded' : 'overloaded' } },
    kind === 'rateLimited' ? 429 : 503
  );

const sseResponse = (chunks) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );

const deltaFrame = (text) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const usageFrame = () => `data: ${JSON.stringify({ choices: [], usage: OPENAI_USAGE })}\n\n`;

const completionResponse = (content) =>
  jsonResponse({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: OPENAI_USAGE,
  });

const toolCallResponse = (name) =>
  jsonResponse({
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call_0', type: 'function', function: { name, arguments: '{}' } },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: OPENAI_USAGE,
  });

const openRouterHarness = {
  name: 'openrouter',
  model: 'nvidia/nemotron-3-super-120b-a12b:free',
  use() {
    vi.stubEnv('AI_PROVIDER', 'openrouter');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
  },
  dropKey() {
    vi.stubEnv('OPENROUTER_API_KEY', '');
  },
  tutor: {
    ok: () =>
      fetchMock.mockImplementation(async () =>
        sseResponse([deltaFrame('첫 조각'), deltaFrame(' 둘째 조각'), usageFrame(), 'data: [DONE]\n\n'])
      ),
    failAtStart: (kind) => fetchMock.mockImplementation(async () => errorResponse(kind)),
    // 200 으로 열린 스트림 안에 오류가 실려 오는 경우 — 델타를 흘린 **뒤**의 실패다
    failMidStream: (kind) =>
      fetchMock.mockImplementation(async () =>
        sseResponse([
          deltaFrame('앞부분'),
          `data: ${JSON.stringify({ error: { code: kind === 'rateLimited' ? 429 : 503, message: 'boom' } })}\n\n`,
        ])
      ),
  },
  grade: {
    ok: () => fetchMock.mockImplementation(async () => completionResponse(JSON.stringify(GRADE))),
    textOnly: (text = JSON.stringify(GRADE)) =>
      fetchMock.mockImplementation(async () => completionResponse(text)),
    fail: (kind) => fetchMock.mockImplementation(async () => errorResponse(kind)),
  },
  plan: {
    ok: () => {
      fetchMock
        .mockImplementationOnce(async () => toolCallResponse('get_due_reviews'))
        .mockImplementation(async () => completionResponse(JSON.stringify(PLAN)));
    },
    text: (text) => {
      fetchMock
        .mockImplementationOnce(async () => toolCallResponse('get_due_reviews'))
        .mockImplementation(async () => completionResponse(text));
    },
    failAtStart: (kind) => fetchMock.mockImplementation(async () => errorResponse(kind)),
    failAfterTool: (kind) => {
      fetchMock
        .mockImplementationOnce(async () => toolCallResponse('get_due_reviews'))
        .mockImplementation(async () => errorResponse(kind));
    },
  },
};

const HARNESSES = [anthropicHarness, openRouterHarness];

// ─────────────────────────────────────────────────────────────────────────────
// 요청 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

let ipCounter = 0;
/** 레이트리밋(IP 당)에 걸리지 않게 요청마다 다른 IP 를 쓴다 */
const nextIp = () => `198.51.100.${(ipCounter++ % 250) + 1}`;

const request = (path, payload) =>
  new Request(`https://example.test/api/ai/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

const BODIES = {
  tutor: { source: 'quiz100', id: '001', userAnswer: '원자성', history: [] },
  grade: { kind: 'short', source: 'quiz100', id: '001', userAnswer: '원자성' },
  plan: {
    snapshot: {
      examDate: '2026-10-18',
      wrongNotes: [],
      quizResults: { '002': 'answered' },
      studyTime: { '2026-09-01': 90 },
      dayChecks: { 1: true },
      availableMinutes: 90,
    },
  },
};

const POST = { tutor: tutor.POST, grade: grade.POST, plan: plan.POST };

const call = (endpoint, payload = BODIES[endpoint]) => POST[endpoint](request(endpoint, payload));

const parseSse = (text) =>
  text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));

const framesOf = async (res) => parseSse(await res.text());

function coldStart() {
  clearContentCache();
  tutor.resetSystemBlocks();
  grade.resetGradeSystemBlocks();
  plan.resetPlanSystemBlocks();
  resetClient();
  resetProvider();
}

beforeEach(() => {
  vi.stubEnv('JUNGCHOGI_DATA_DIR', FIXTURE_DIR);
  vi.stubEnv('AI_ACCESS_CODE', '');
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  streamMock.mockReset();
  parseMock.mockReset();
  toolRunnerMock.mockReset();

  resetRateLimits();
  coldStart();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  coldStart();
});

/** 하네스를 고르고 그 환경으로 프로바이더를 다시 만든다 */
const activate = (harness) => {
  harness.use();
  coldStart();
};

// ─────────────────────────────────────────────────────────────────────────────
// 성공 경로 — 여섯 조합이 같은 모양을 낸다
// ─────────────────────────────────────────────────────────────────────────────

describe.each(HARNESSES)('$name — 성공 응답 계약', (harness) => {
  beforeEach(() => activate(harness));

  it('tutor: delta 프레임을 흘리고 done 프레임으로 끝낸다', async () => {
    harness.tutor.ok();
    const res = await call('tutor');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');

    const frames = await framesOf(res);
    expect(frames.slice(0, -1)).toEqual([{ delta: '첫 조각' }, { delta: ' 둘째 조각' }]);
    expect(frames.at(-1)).toEqual({
      done: true,
      usage: WIRE_USAGE, // 두 경로가 **같은 이름·같은 값**을 낸다
      cost: expect.any(Object),
    });
  });

  it('tutor: done 프레임의 cost 가 사용 기록 계약을 그대로 싣는다', async () => {
    harness.tutor.ok();
    const done = (await framesOf(await call('tutor'))).at(-1);

    for (const field of USAGE_RECORD_FIELDS) expect(done.cost).toHaveProperty(field);
    expect(done.cost.endpoint).toBe('tutor');
    expect(done.cost.provider).toBe(harness.name);
    expect(done.cost.model).toBe(harness.model);
    expect(done.cost.effort).toBe('low');
    expect(done.cost.inputTokens).toBe(300);
  });

  it('grade: 계약된 다섯 필드 + cost 만 돌려준다', async () => {
    harness.grade.ok();
    const res = await call('grade');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body).toMatchObject(GRADE);
    expect(Object.keys(body).sort()).toEqual([
      'confidence',
      'cost',
      'feedback',
      'missedPoints',
      'score',
      'verdict',
    ]);
    expect(body).not.toHaveProperty('usage'); // 채점 응답에는 usage 를 싣지 않는다
    expect(body.cost.provider).toBe(harness.name);
    expect(body.cost.effort).toBe('medium');
  });

  it('plan: 도구 진행 프레임을 내고 done 프레임에 계획을 싣는다', async () => {
    harness.plan.ok();
    const res = await call('plan');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const frames = await framesOf(res);
    expect(frames.slice(0, 2)).toEqual([
      { phase: 'tool', tool: 'get_due_reviews', input: {} },
      { phase: 'tool_result', tool: 'get_due_reviews', ok: true },
    ]);
    expect(frames.at(-1)).toEqual({
      done: true,
      plan: PLAN,
      usage: expect.any(Object),
      cost: expect.any(Object),
    });
    expect(frames.at(-1).cost.provider).toBe(harness.name);
    expect(frames.at(-1).cost.effort).toBe('high');
  });

  it('plan: tool_result 프레임에 도구 결과 본문을 싣지 않는다 (진행 표시용)', async () => {
    harness.plan.ok();
    const results = (await framesOf(await call('plan'))).filter((f) => f.phase === 'tool_result');

    expect(results.length).toBeGreaterThan(0);
    for (const frame of results) expect(Object.keys(frame).sort()).toEqual(['ok', 'phase', 'tool']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 실패 경로 — "시작 전은 JSON, 시작 후는 SSE"
// ─────────────────────────────────────────────────────────────────────────────

describe.each(HARNESSES)('$name — 실패 응답 계약', (harness) => {
  beforeEach(() => activate(harness));

  const readJson = async (res) => ({ status: res.status, body: await res.json() });

  it.each([
    ['upstream', 502, 'UPSTREAM', true],
    ['rateLimited', 429, 'RATE_LIMITED', true],
  ])(
    'tutor: 스트림 시작 전 %s 실패는 JSON %i',
    async (kind, status, code, retryable) => {
      harness.tutor.failAtStart(kind);
      const res = await call('tutor');

      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({
        error: { code, message: expect.any(String), retryable },
      });
    }
  );

  it('tutor: 스트림 시작 후 실패는 200 + SSE 오류 프레임이다', async () => {
    harness.tutor.failMidStream('upstream');
    const res = await call('tutor');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const frames = await framesOf(res);
    expect(frames[0]).toEqual({ delta: '앞부분' });
    expect(frames.at(-1)).toEqual({
      error: { code: 'UPSTREAM', message: expect.any(String), retryable: expect.any(Boolean) },
    });
    expect(frames.some((frame) => frame.done)).toBe(false);
  });

  it.each([
    ['upstream', 502, 'UPSTREAM'],
    ['rateLimited', 429, 'RATE_LIMITED'],
  ])('grade: %s 실패는 JSON %i 다 (스트리밍하지 않는다)', async (kind, status, code) => {
    harness.grade.fail(kind);
    const { status: got, body } = await readJson(await call('grade'));

    expect(got).toBe(status);
    expect(body.error.code).toBe(code);
    expect(typeof body.error.message).toBe('string');
  });

  it('plan: 도구를 부르기 전에 실패하면 JSON 502 다', async () => {
    harness.plan.failAtStart('upstream');
    const res = await call('plan');

    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('UPSTREAM');
  });

  it('plan: 첫 턴 레이트리밋은 429 JSON 이다', async () => {
    harness.plan.failAtStart('rateLimited');
    const res = await call('plan');

    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
  });

  it('plan: 도구 진행 프레임이 나간 뒤의 실패는 SSE 프레임이다', async () => {
    harness.plan.failAfterTool('upstream');
    const res = await call('plan');

    expect(res.status).toBe(200);
    const frames = await framesOf(res);

    // 이미 내보낸 진행 프레임은 그대로 남는다
    expect(frames[0]).toEqual({ phase: 'tool', tool: 'get_due_reviews', input: {} });
    expect(frames.at(-1).error.code).toBe('UPSTREAM');
    expect(frames.some((frame) => frame.done)).toBe(false);
  });

  it('plan: 계획이 아닌 응답으로 끝나면 SSE 오류 프레임이다', async () => {
    harness.plan.text('계획을 세우지 못했습니다.');
    const frames = await framesOf(await call('plan'));

    expect(frames.at(-1).error.code).toBe('UPSTREAM');
    expect(frames.at(-1).error.retryable).toBe(true);
    expect(frames.some((frame) => frame.done)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 자격증명 없음 — 업스트림을 부르지 않고 502
// ─────────────────────────────────────────────────────────────────────────────

describe.each(HARNESSES)('$name — 자격증명이 없으면 502', (harness) => {
  beforeEach(() => {
    activate(harness);
    harness.dropKey();
    coldStart();
  });

  it.each(['tutor', 'grade', 'plan'])('%s: 502 UPSTREAM 이고 업스트림을 부르지 않는다', async (endpoint) => {
    const res = await call(endpoint);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('UPSTREAM');
    expect(body.error.message).toBe('AI 기능이 설정되지 않았습니다.');
    expect(body.error.retryable).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
    expect(parseMock).not.toHaveBeenCalled();
    expect(toolRunnerMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 게이트는 프로바이더보다 먼저다 — 잘못된 요청은 업스트림에 닿지 않는다
// ─────────────────────────────────────────────────────────────────────────────

describe.each(HARNESSES)('$name — 요청 게이트', (harness) => {
  beforeEach(() => activate(harness));

  it.each(['tutor', 'grade', 'plan'])('%s: JSON 이 아닌 body 는 400 이다', async (endpoint) => {
    const res = await POST[endpoint](request(endpoint, '{ 망가진'));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('BAD_REQUEST');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['tutor', 'grade'])('%s: 없는 문항 id 는 400 이다', async (endpoint) => {
    const res = await call(endpoint, { ...BODIES[endpoint], id: '999' });

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('999');
  });

  it.each(['tutor', 'grade', 'plan'])('%s: 접근 코드가 틀리면 401 이다', async (endpoint) => {
    vi.stubEnv('AI_ACCESS_CODE', 'let-me-in');
    const res = await call(endpoint);

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 구조화 출력이 안 걸렸을 때 — 본문 텍스트에서 파싱하는 경로
//
// OpenRouter 의 무료 모델은 엄격 스키마를 못 거는 일이 잦아 이쪽이 주 경로가 된다.
// Anthropic 도 정책 폴백 등으로 `parsed_output` 이 비는 경우가 있다.
// ─────────────────────────────────────────────────────────────────────────────

describe.each(HARNESSES)('$name — 구조화 출력 없이 온 응답', (harness) => {
  beforeEach(() => activate(harness));

  it('grade: 본문 텍스트의 JSON 으로 채점 결과를 만든다', async () => {
    harness.grade.textOnly(JSON.stringify(GRADE));
    const res = await call('grade');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject(GRADE);
  });

  it('grade: 코드 펜스에 싸여 와도 읽어 낸다', async () => {
    harness.grade.textOnly(`설명입니다.\n\`\`\`json\n${JSON.stringify(GRADE)}\n\`\`\`\n`);
    const res = await call('grade');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject(GRADE);
  });

  it('grade: JSON 이 아니면 502 로 거절한다 (재시도 가능)', async () => {
    harness.grade.textOnly('채점하지 않겠습니다.');
    const res = await call('grade');

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('UPSTREAM');
    expect(body.error.retryable).toBe(true);
  });

  it('grade: 잘린 JSON 은 "잘렸다" 고 알린다', async () => {
    harness.grade.textOnly('{"verdict":"correct","score":100,"feedback":"맞았');
    const res = await call('grade');

    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toContain('잘렸습니다');
  });

  it('grade: verdict 가 계약 밖이면 거절한다 (조여서 통과시키지 않는다)', async () => {
    harness.grade.textOnly(JSON.stringify({ ...GRADE, verdict: 'maybe' }));
    const res = await call('grade');

    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('UPSTREAM');
  });

  it('plan: 본문 텍스트의 JSON 으로 계획을 만든다', async () => {
    harness.plan.text(JSON.stringify(PLAN));
    const frames = await framesOf(await call('plan'));

    expect(frames.at(-1).plan).toEqual(PLAN);
  });
});
