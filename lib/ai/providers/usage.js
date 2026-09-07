// 업스트림 usage → 이 프로젝트의 사용 기록 모양으로 옮기기.
//
// 규칙은 `lib/ai/usage.js` 가 이미 정해 두었다 — **"모름" 과 "0" 은 다르다.**
// 없는 값을 0 으로 때우면 비용이 조용히 과소 보고된다. 그래서 여기서는
// 유한한 음 아닌 수만 값으로 받고 나머지는 전부 `null` 로 둔다.
//
// `lib/ai/usage.js` 를 import 하지 않는다: 그 파일은 의존성 0 을 계약으로 삼고 있고,
// 여기서 필요한 것은 이름 네 개뿐이다. 이름이 갈리지 않는지는
// `tests/provider-usage.test.js` 가 두 목록을 직접 비교해 지킨다.

/** 사용 기록의 토큰 항목 (`lib/ai/usage.js` 의 TOKEN_FIELDS 와 같아야 한다) */
export const USAGE_TOKEN_FIELDS = Object.freeze([
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheCreationTokens',
]);

/**
 * 토큰 수 하나를 읽는다. 유한한 음 아닌 **수**만 값이다.
 * 숫자로 읽히는 문자열도 받지 않는다 — 업스트림이 JSON 을 주므로 문자열이 오면
 * 계약이 흔들린 것이고, 그때는 모른다고 하는 편이 낫다.
 * @param {unknown} raw
 * @returns {number|null}
 */
function toTokenCount(raw) {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
}

/** 아무것도 모르는 usage */
export function emptyUsage(model) {
  return {
    model,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheCreationTokens: null,
  };
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * OpenAI 호환(OpenRouter) usage 를 옮긴다.
 *
 * ⚠️ `prompt_tokens` 는 캐시로 읽은 토큰을 **포함한** 값이다 (Anthropic 의
 * `input_tokens` 는 제외한 값이라 의미가 다르다). 무료 모델은 단가가 0 이라
 * 비용에는 영향이 없지만, 유료 모델로 옮길 때 이 차이를 다시 봐야 한다.
 *
 * `cacheCreationTokens` 는 OpenAI 호환 응답에 대응하는 항목이 없다 → 언제나 null.
 * @param {unknown} raw 응답의 `usage`
 * @param {string} model
 * @returns {{model: string, inputTokens: number|null, outputTokens: number|null,
 *            cacheReadTokens: number|null, cacheCreationTokens: number|null}}
 */
export function mapOpenAiUsage(raw, model) {
  if (!isPlainObject(raw)) return emptyUsage(model);

  const details = isPlainObject(raw.prompt_tokens_details) ? raw.prompt_tokens_details : null;
  return {
    model,
    inputTokens: toTokenCount(raw.prompt_tokens),
    outputTokens: toTokenCount(raw.completion_tokens),
    cacheReadTokens: details ? toTokenCount(details.cached_tokens) : null,
    cacheCreationTokens: null,
  };
}

/**
 * Anthropic SDK usage(snake_case)를 옮긴다.
 * @param {unknown} raw
 * @param {string} model
 */
export function mapAnthropicUsage(raw, model) {
  if (!isPlainObject(raw)) return emptyUsage(model);

  return {
    model,
    inputTokens: toTokenCount(raw.input_tokens),
    outputTokens: toTokenCount(raw.output_tokens),
    cacheReadTokens: toTokenCount(raw.cache_read_input_tokens),
    cacheCreationTokens: toTokenCount(raw.cache_creation_input_tokens),
  };
}

/**
 * 여러 턴(도구 루프)의 usage 를 더한다.
 *
 * **한 턴이라도 모르는 항목은 합계가 null 이다.** 아는 것만 더해 총액이라고 내면
 * 하한을 총액으로 보고하는 셈이 된다 (`lib/ai/usage.js` 가 `usd` 와 `usdAtLeast` 를
 * 나눠 둔 것과 같은 이유다).
 * @param {string} model
 */
export function createUsageAccumulator(model) {
  const sums = Object.fromEntries(USAGE_TOKEN_FIELDS.map((field) => [field, 0]));
  const known = Object.fromEntries(USAGE_TOKEN_FIELDS.map((field) => [field, true]));
  let turns = 0;

  return {
    add(usage) {
      turns += 1;
      for (const field of USAGE_TOKEN_FIELDS) {
        const value = isPlainObject(usage) ? toTokenCount(usage[field]) : null;
        if (value === null) known[field] = false;
        else sums[field] += value;
      }
    },
    total() {
      if (turns === 0) return emptyUsage(model);
      const total = { model };
      for (const field of USAGE_TOKEN_FIELDS) total[field] = known[field] ? sums[field] : null;
      return total;
    },
  };
}
