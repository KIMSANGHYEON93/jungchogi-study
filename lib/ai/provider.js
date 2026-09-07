// AI 프로바이더 선택 — 이 앱이 어느 업스트림으로 나갈지 정하는 **단 한 곳**.
//
// 비용 때문에 무료 라우팅(OpenRouter)으로 옮기되 Anthropic 경로를 버리지 않는다.
// 두 경로가 같은 계약을 구현하고, 엔드포인트(`api/ai/*.js`)는 어느 쪽인지 모른 채
// 같은 코드로 돈다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 고르는 규칙
// ─────────────────────────────────────────────────────────────────────────────
//   `AI_PROVIDER` 가 있으면 그대로 (anthropic | openrouter)
//   없으면 `OPENROUTER_API_KEY` 가 있는지로 판단 — 있으면 openrouter, 없으면 anthropic
//
// **아는 값이 아니면 던진다.** `AI_PROVIDER=opnerouter` 같은 오타를 조용히 무시하고
// 다른 프로바이더로 가면, 무료로 돌리려던 요청이 유료 키로 나가도 화면에는 아무
// 차이가 없다. 이 프로젝트가 `lib/ai/usage.js` 에서 "모르는 모델이면 계산하지 않는다"
// 로 정한 것과 같은 판단이다 — 조용히 틀리느니 시끄럽게 멈춘다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 프로바이더 계약 (두 구현이 공유하는 고정 인터페이스)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @typedef {object} ProviderUsage
 * @property {string} model
 * @property {number|null} inputTokens
 * @property {number|null} outputTokens
 * @property {number|null} cacheReadTokens
 * @property {number|null} cacheCreationTokens
 *   **모르는 값은 0 이 아니라 null 이다** (`lib/ai/usage.js` 의 규칙).
 */

/**
 * @typedef {object} SystemBlock
 * @property {string} text
 * @property {boolean} [cacheable] 프롬프트 캐시 breakpoint 를 걸 블록.
 *   anthropic 은 마지막 cacheable 블록 하나에 `cache_control` 을 건다.
 *   openrouter 는 캐시가 없어 무시하고 블록을 이어 붙인다.
 */

/**
 * @typedef {object} ProviderTool
 * @property {string} name
 * @property {string} description
 * @property {object} parameters JSON Schema
 * @property {(input: object) => unknown|Promise<unknown>} run
 *   객체를 돌려주면 프로바이더가 JSON 문자열로 만들어 모델에 되돌린다.
 *   `{error}` 를 돌려주면 실패로 보고 진행 이벤트에 `ok: false` 가 실린다.
 */

/**
 * @typedef {object} AiProvider
 * @property {'anthropic'|'openrouter'} name
 * @property {string} model 실제로 쓰는 모델 id
 * @property {boolean} supportsPromptCache
 * @property {boolean} supportsStrictSchema 엄격 스키마(json_schema)를 걸 수 있는가
 * @property {boolean} supportsTools
 * @property {() => boolean} hasKey 요청을 보낼 자격증명이 있는가
 * @property {(error: unknown) => {code: string, message: string, retryable: boolean,
 *            status?: number, retryAfterSeconds?: number, limitScope?: string}} classifyError
 * @property {(args: object) => AsyncIterable<{type: 'text', text: string}
 *            |{type: 'done', usage: ProviderUsage}>} streamText
 * @property {(args: object) => Promise<{data: object|null, text: string, usage: ProviderUsage}>} completeJson
 * @property {(args: object) => Promise<{data: object|null, text: string,
 *            usage: ProviderUsage, toolCalls: number}>} runToolLoop
 */

import { createAnthropicProvider } from './providers/anthropic.js';
import { createOpenRouterProvider } from './providers/openrouter.js';

/** 쓸 수 있는 프로바이더 이름. 늘어나면 `FACTORIES` 도 함께 늘어난다. */
export const PROVIDER_NAMES = Object.freeze(['anthropic', 'openrouter']);

const FACTORIES = Object.freeze({
  anthropic: createAnthropicProvider,
  openrouter: createOpenRouterProvider,
});

/**
 * 환경변수로 프로바이더 이름을 정한다.
 * @param {Record<string, string|undefined>} [env]
 * @returns {'anthropic'|'openrouter'}
 * @throws {Error} `AI_PROVIDER` 가 아는 값이 아닐 때
 */
export function resolveProviderName(env = process.env) {
  const explicit = typeof env.AI_PROVIDER === 'string' ? env.AI_PROVIDER.trim().toLowerCase() : '';

  if (explicit !== '') {
    if (!PROVIDER_NAMES.includes(explicit)) {
      throw new Error(
        `AI_PROVIDER 값 "${env.AI_PROVIDER}" 을 알 수 없습니다. ` +
          `${PROVIDER_NAMES.join(' 또는 ')} 중 하나여야 합니다.`
      );
    }
    return explicit;
  }

  // 명시가 없으면 키가 있는 쪽. 무료 경로를 기본으로 삼는다.
  const openRouterKey =
    typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY.trim() : '';
  return openRouterKey !== '' ? 'openrouter' : 'anthropic';
}

let cached = null;

/** 테스트·재기동용 — 캐시된 프로바이더를 버린다 (`resetClient` 과 같은 자리다). */
export function resetProvider() {
  cached = null;
}

/**
 * 프로바이더를 가져온다. 처음 부를 때 만들고 그 뒤로는 같은 객체를 준다
 * (모델 능력표 경고를 요청마다 다시 찍지 않기 위해서이기도 하다).
 * @param {Record<string, string|undefined>} [env]
 * @returns {AiProvider}
 */
export function getProvider(env = process.env) {
  cached ??= FACTORIES[resolveProviderName(env)](env);
  return cached;
}
