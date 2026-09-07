// 프로바이더 선택 — `lib/ai/provider.js`.
//
// 이 앱은 Anthropic 경로를 버리지 않고 **환경변수로 고른다**. 고르는 규칙이
// 조용히 어긋나면 (a) 무료로 돌리려던 요청이 유료 키로 나가거나
// (b) 유료 품질을 기대한 자리에 무료 모델이 들어온다. 둘 다 화면으로는 안 보인다.
// 그래서 조합을 전부 못 박는다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getProvider,
  resetProvider,
  resolveProviderName,
  PROVIDER_NAMES,
} from '../lib/ai/provider.js';
import { DEFAULT_OPENROUTER_MODEL, MODEL_CAPABILITIES } from '../lib/ai/providers/openrouter.js';

/** 각 테스트는 자기 환경만 본다 — 실행 환경에 실제 키가 있어도 결과가 흔들리면 안 된다. */
beforeEach(() => {
  resetProvider();
  vi.stubEnv('AI_PROVIDER', '');
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv('OPENROUTER_MODEL', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetProvider();
});

describe('환경변수 조합', () => {
  it('AI_PROVIDER 없음 + OPENROUTER_API_KEY 없음 → anthropic', () => {
    expect(resolveProviderName(process.env)).toBe('anthropic');
    expect(getProvider().name).toBe('anthropic');
  });

  it('AI_PROVIDER 없음 + OPENROUTER_API_KEY 있음 → openrouter', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    expect(resolveProviderName(process.env)).toBe('openrouter');
    expect(getProvider().name).toBe('openrouter');
  });

  it('AI_PROVIDER=anthropic 은 OPENROUTER_API_KEY 가 있어도 이긴다', () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    expect(getProvider().name).toBe('anthropic');
  });

  it('AI_PROVIDER=openrouter 는 키가 없어도 openrouter 를 고른다', () => {
    vi.stubEnv('AI_PROVIDER', 'openrouter');
    const provider = getProvider();
    expect(provider.name).toBe('openrouter');
    // 고르는 것과 쓸 수 있는 것은 다르다 — 키 없음은 hasKey 로 알린다
    expect(provider.hasKey()).toBe(false);
  });
});

describe('AI_PROVIDER 값 해석', () => {
  it('대소문자와 앞뒤 공백을 흡수한다', () => {
    vi.stubEnv('AI_PROVIDER', '  OpenRouter \n');
    expect(getProvider().name).toBe('openrouter');
  });

  it('빈 문자열·공백만은 미설정과 같다', () => {
    vi.stubEnv('AI_PROVIDER', '   ');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    expect(getProvider().name).toBe('openrouter');
  });

  it('아는 값이 아니면 던진다 — 조용히 다른 프로바이더로 가지 않는다', () => {
    vi.stubEnv('AI_PROVIDER', 'opnerouter');
    expect(() => getProvider()).toThrow(/AI_PROVIDER/);
  });

  it('오류 메시지가 쓸 수 있는 값을 알려 준다', () => {
    vi.stubEnv('AI_PROVIDER', 'gpt');
    expect(() => getProvider()).toThrow(/anthropic/);
    expect(() => getProvider()).toThrow(/openrouter/);
  });

  it('PROVIDER_NAMES 는 두 개뿐이다', () => {
    expect([...PROVIDER_NAMES].sort()).toEqual(['anthropic', 'openrouter']);
  });
});

describe('캐시', () => {
  it('같은 환경이면 같은 객체를 돌려준다', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    expect(getProvider()).toBe(getProvider());
  });

  it('resetProvider 뒤에는 새로 만든다', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    const first = getProvider();
    resetProvider();
    expect(getProvider()).not.toBe(first);
  });

  it('resetProvider 를 거치면 바뀐 환경변수가 반영된다', () => {
    const before = getProvider();
    expect(before.name).toBe('anthropic');

    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    resetProvider();
    expect(getProvider().name).toBe('openrouter');
  });
});

describe('프로바이더 객체의 계약 필드', () => {
  it('anthropic 은 프롬프트 캐시와 엄격 스키마를 모두 지원한다', () => {
    const provider = getProvider();
    expect(provider.model).toBe('claude-opus-5');
    expect(provider.supportsPromptCache).toBe(true);
    expect(provider.supportsStrictSchema).toBe(true);
  });

  it('openrouter 는 프롬프트 캐시를 지원하지 않는다', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
    expect(getProvider().supportsPromptCache).toBe(false);
  });

  it('세 함수와 hasKey·classifyError 를 두 프로바이더가 모두 가진다', () => {
    for (const name of ['anthropic', 'openrouter']) {
      resetProvider();
      vi.stubEnv('AI_PROVIDER', name);
      const provider = getProvider();
      for (const fn of [
        'streamText',
        'completeJson',
        'runToolLoop',
        'hasKey',
        'classifyError',
      ]) {
        expect(typeof provider[fn], `${name}.${fn}`).toBe('function');
      }
    }
  });
});

describe('OPENROUTER_MODEL', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
  });

  it('미설정이면 기본 모델을 쓴다', () => {
    expect(getProvider().model).toBe(DEFAULT_OPENROUTER_MODEL);
  });

  it('기본 모델은 도구·엄격 스키마를 모두 지원하는 것으로 고른다', () => {
    const caps = MODEL_CAPABILITIES[DEFAULT_OPENROUTER_MODEL];
    expect(caps).toBeDefined();
    expect(caps.tools).toBe(true);
    expect(caps.strictSchema).toBe(true);
  });

  it('설정하면 그 모델을 쓴다', () => {
    vi.stubEnv('OPENROUTER_MODEL', 'google/gemma-4-31b-it:free');
    expect(getProvider().model).toBe('google/gemma-4-31b-it:free');
  });

  it('아는 모델이면 능력표대로 supportsStrictSchema 를 정한다', () => {
    vi.stubEnv('OPENROUTER_MODEL', 'google/gemma-4-31b-it:free');
    // gemma-4 는 response_format 은 되지만 엄격 스키마는 안 된다
    expect(getProvider().supportsStrictSchema).toBe(false);
  });

  it('모르는 모델이면 엄격 스키마를 쓰지 않고 경고한다 — 능력표가 낡았다는 신호다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('OPENROUTER_MODEL', 'someone/brand-new-model:free');

    const provider = getProvider();
    expect(provider.model).toBe('someone/brand-new-model:free');
    expect(provider.supportsStrictSchema).toBe(false);

    const message = warn.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(message).toMatch(/someone\/brand-new-model:free/);
    expect(message).toMatch(/openrouter\.ai\/api\/v1\/models/);
  });

  it('경고는 프로바이더를 만들 때 한 번만 낸다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('OPENROUTER_MODEL', 'someone/brand-new-model:free');

    getProvider();
    getProvider();
    getProvider();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
