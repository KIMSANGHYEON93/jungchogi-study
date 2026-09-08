// OpenRouter 요청 조립 — `lib/ai/providers/openrouter.js`.
//
// 키가 없어 실제 호출은 못 한다. `fetch` 를 모킹해 **무엇을 보내는지**를 고정한다.
// 여기서 어긋나면 화면에는 "AI 오류" 한 줄만 나오고 원인은 안 보인다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createOpenRouterProvider,
  DEFAULT_OPENROUTER_MODEL,
  MODEL_CAPABILITIES,
  CHAT_COMPLETIONS_URL,
  MODELS_URL,
} from '../lib/ai/providers/openrouter.js';

const KEY_ENV = { OPENROUTER_API_KEY: 'sk-or-test' };

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const OK_BODY = {
  choices: [{ message: { role: 'assistant', content: '{"a":1}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 2 },
};

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse(OK_BODY));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 마지막 요청의 [url, options] */
const lastCall = () => fetchMock.mock.calls.at(-1);
const lastBody = () => JSON.parse(lastCall()[1].body);
const lastHeaders = () => lastCall()[1].headers;

describe('엔드포인트와 헤더', () => {
  it('OpenAI 호환 chat/completions 로 POST 한다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({
      system: [],
      messages: [{ role: 'user', content: '안녕' }],
    });

    const [url, options] = lastCall();
    expect(url).toBe(CHAT_COMPLETIONS_URL);
    expect(CHAT_COMPLETIONS_URL).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options.method).toBe('POST');
  });

  it('모델 목록 URL 은 인증 없이 볼 수 있는 그 주소다', () => {
    expect(MODELS_URL).toBe('https://openrouter.ai/api/v1/models');
  });

  it('Bearer 로 키를 싣는다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({ system: [], messages: [] });
    expect(lastHeaders().authorization).toBe('Bearer sk-or-test');
    expect(lastHeaders()['content-type']).toBe('application/json');
  });

  it('키가 없으면 요청을 보내지 않고 설정 오류로 던진다', async () => {
    const provider = createOpenRouterProvider({});
    expect(provider.hasKey()).toBe(false);
    await expect(provider.completeJson({ system: [], messages: [] })).rejects.toThrow(
      /OPENROUTER_API_KEY/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('공백뿐인 키는 없는 것으로 본다', () => {
    expect(createOpenRouterProvider({ OPENROUTER_API_KEY: '   ' }).hasKey()).toBe(false);
  });

  it('OPENROUTER_SITE_URL·OPENROUTER_APP_NAME 을 리더보드 헤더로 붙인다', async () => {
    await createOpenRouterProvider({
      ...KEY_ENV,
      OPENROUTER_SITE_URL: 'https://jungchogi-study.vercel.app',
      OPENROUTER_APP_NAME: 'jungchogi',
    }).completeJson({ system: [], messages: [] });

    expect(lastHeaders()['HTTP-Referer']).toBe('https://jungchogi-study.vercel.app');
    expect(lastHeaders()['X-Title']).toBe('jungchogi');
  });

  it('선택 헤더는 값이 없으면 아예 붙지 않는다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({ system: [], messages: [] });
    expect(lastHeaders()).not.toHaveProperty('HTTP-Referer');
    expect(lastHeaders()).not.toHaveProperty('X-Title');
  });

  it('헤더에 못 싣는 문자(한글)가 오면 그 헤더만 빼고 경고한다 — fetch 가 터지면 안 된다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await createOpenRouterProvider({ ...KEY_ENV, OPENROUTER_APP_NAME: '정처기 학습 앱' }).completeJson(
      { system: [], messages: [] }
    );

    expect(lastHeaders()).not.toHaveProperty('X-Title');
    expect(warn.mock.calls.flat().join(' ')).toMatch(/X-Title/);
    // 헤더 값으로 실제 Headers 를 만들 수 있어야 한다
    expect(() => new Headers(lastHeaders())).not.toThrow();
  });
});

describe('모델과 능력표', () => {
  it('OPENROUTER_MODEL 이 없으면 기본 모델로 보낸다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({ system: [], messages: [] });
    expect(lastBody().model).toBe(DEFAULT_OPENROUTER_MODEL);
  });

  it('기본 모델은 무료(:free) 다 — 비용 때문에 옮겨 온 것이다', () => {
    expect(DEFAULT_OPENROUTER_MODEL.endsWith(':free')).toBe(true);
  });

  it('능력표의 모델 id 는 모두 무료이고 세 능력을 명시한다', () => {
    for (const [id, caps] of Object.entries(MODEL_CAPABILITIES)) {
      expect(id, `${id} 는 무료 모델이어야 한다`).toMatch(/:free$/);
      for (const key of ['tools', 'responseFormat', 'strictSchema', 'reasoningEffort']) {
        expect(typeof caps[key], `${id}.${key}`).toBe('boolean');
      }
    }
  });

  it('엄격 스키마를 지원한다면 response_format 도 지원한다 (상위 호환)', () => {
    for (const [id, caps] of Object.entries(MODEL_CAPABILITIES)) {
      if (caps.strictSchema) expect(caps.responseFormat, id).toBe(true);
    }
  });

  it('OPENROUTER_MODEL 로 바꿀 수 있다', async () => {
    await createOpenRouterProvider({
      ...KEY_ENV,
      OPENROUTER_MODEL: 'minimax/minimax-m3:free',
    }).completeJson({ system: [], messages: [] });
    expect(lastBody().model).toBe('minimax/minimax-m3:free');
  });

  it('모델 이름의 앞뒤 공백을 흡수한다', async () => {
    await createOpenRouterProvider({
      ...KEY_ENV,
      OPENROUTER_MODEL: '  minimax/minimax-m3:free  ',
    }).completeJson({ system: [], messages: [] });
    expect(lastBody().model).toBe('minimax/minimax-m3:free');
  });
});

describe('system·messages 변환', () => {
  it('system 블록을 이어 붙여 role:system 한 개로 만든다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({
      system: [{ text: '너는 튜터다' }, { text: '# 교재 총론\n\n...', cacheable: true }],
      messages: [{ role: 'user', content: '문항' }],
    });

    const { messages } = lastBody();
    expect(messages[0]).toEqual({
      role: 'system',
      content: '너는 튜터다\n\n# 교재 총론\n\n...',
    });
    expect(messages[1]).toEqual({ role: 'user', content: '문항' });
  });

  it('cacheable 플래그는 요청에 실리지 않는다 — 프롬프트 캐시를 지원하지 않는다', async () => {
    const provider = createOpenRouterProvider(KEY_ENV);
    expect(provider.supportsPromptCache).toBe(false);

    await provider.completeJson({ system: [{ text: 'A', cacheable: true }], messages: [] });
    expect(JSON.stringify(lastBody())).not.toContain('cache');
  });

  it('빈 system 블록은 버린다 — 이어 붙일 때 빈 줄만 늘어난다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({
      system: [{ text: 'A' }, { text: '   ' }, { text: '' }, { text: 'B' }],
      messages: [],
    });
    expect(lastBody().messages[0].content).toBe('A\n\nB');
  });

  it('system 이 비면 system 메시지를 아예 넣지 않는다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({
      system: [],
      messages: [{ role: 'user', content: '문항' }],
    });
    expect(lastBody().messages).toEqual([{ role: 'user', content: '문항' }]);
  });

  it('system 을 문자열 하나로 줘도 받는다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({ system: '한 줄 지시', messages: [] });
    expect(lastBody().messages[0]).toEqual({ role: 'system', content: '한 줄 지시' });
  });

  it('user·assistant 대화 순서를 그대로 보낸다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({
      system: [],
      messages: [
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' },
      ],
    });
    expect(lastBody().messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });
});

describe('max_tokens 와 effort', () => {
  it('maxTokens 를 max_tokens 로 보낸다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({
      system: [],
      messages: [],
      maxTokens: 8000,
    });
    expect(lastBody().max_tokens).toBe(8000);
  });

  it('maxTokens 가 없으면 max_tokens 를 넣지 않는다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({ system: [], messages: [] });
    expect(lastBody()).not.toHaveProperty('max_tokens');
  });

  it('effort 를 지원하는 모델이면 reasoning_effort 로 보낸다', async () => {
    // 기본 모델은 능력표에서 reasoningEffort: true 다
    expect(MODEL_CAPABILITIES[DEFAULT_OPENROUTER_MODEL].reasoningEffort).toBe(true);

    await createOpenRouterProvider(KEY_ENV).completeJson({
      system: [],
      messages: [],
      effort: 'high',
    });
    expect(lastBody().reasoning_effort).toBe('high');
  });

  it('effort 를 지원하지 않는 모델에는 보내지 않는다 — 모르는 파라미터로 400 을 받지 않게', async () => {
    await createOpenRouterProvider({
      ...KEY_ENV,
      OPENROUTER_MODEL: 'minimax/minimax-m3:free',
    }).completeJson({ system: [], messages: [], effort: 'high' });
    expect(lastBody()).not.toHaveProperty('reasoning_effort');
  });

  it('계약 밖 effort 값은 보내지 않는다', async () => {
    await createOpenRouterProvider(KEY_ENV).completeJson({
      system: [],
      messages: [],
      effort: 'maximum',
    });
    expect(lastBody()).not.toHaveProperty('reasoning_effort');
  });
});
