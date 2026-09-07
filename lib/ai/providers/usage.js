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
 * ⚠️ **`prompt_tokens` 는 캐시로 읽은 토큰을 포함한 값이다.** Anthropic 의
 * `input_tokens` 는 캐시를 **제외한** 값이라 의미가 정반대다. 그래서 `prompt_tokens`
 * 를 `inputTokens` 에 그대로 넣으면 캐시 토큰이 `inputTokens` 와 `cacheReadTokens`
 * 양쪽에 들어가 **두 번 세어진다.**
 *
 * 이 계약(`lib/ai/usage.js`)은 세 입력 항목(input·cacheRead·cacheCreation)이 서로
 * **겹치지 않는다**고 전제한다 — 비용은 항목별 단가를 곱해 더하고, 캐시 적중률은
 * 셋의 합을 분모로 쓴다(`src/utils/usageLedger.js`·`scripts/usage-report.mjs`).
 * 겹친 채로 넣으면 무료 모델이라 금액은 0 그대로지만 **적중률의 분모가 부풀어**
 * 캐시가 실제보다 안 듣는 것처럼 보고된다. 그래서 여기서 빼서 넘긴다.
 *
 * - `cached_tokens` 를 모르면 뺄 것도 없다 → `prompt_tokens` 를 그대로 쓴다.
 * - 어긋난 값(`cached_tokens > prompt_tokens`)은 0 에서 막는다. 음수를 흘리면
 *   `lib/ai/usage.js` 가 그 값을 "모름" 으로 버려 입력 토큰이 통째로 사라진다.
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
  const promptTokens = toTokenCount(raw.prompt_tokens);
  const cacheReadTokens = details ? toTokenCount(details.cached_tokens) : null;

  return {
    model,
    inputTokens:
      promptTokens === null || cacheReadTokens === null
        ? promptTokens
        : Math.max(0, promptTokens - cacheReadTokens),
    outputTokens: toTokenCount(raw.completion_tokens),
    cacheReadTokens,
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

/**
 * 사용 기록의 토큰 항목 ↔ SSE `done` 프레임에 싣는 이름.
 *
 * **snake_case 는 프론트엔드와의 계약이다.** `src/components/AiExplainPanel.jsx` 가
 * `usage.input_tokens`·`usage.cache_read_input_tokens`·`usage.output_tokens` 를
 * 직접 읽는다. Anthropic SDK 의 이름을 그대로 쓰던 시절에 굳은 계약이고,
 * 프로바이더가 무엇이든 화면은 같은 이름을 봐야 한다.
 */
const WIRE_NAMES = Object.freeze([
  ['inputTokens', 'input_tokens'],
  ['outputTokens', 'output_tokens'],
  ['cacheReadTokens', 'cache_read_input_tokens'],
  ['cacheCreationTokens', 'cache_creation_input_tokens'],
]);

/**
 * 프로바이더 usage 를 응답에 실을 모양으로 옮긴다.
 *
 * **모르는 항목은 키를 만들지 않는다.** 0 으로 때우면 화면이 "캐시 0회" 라고
 * 단언하게 되고(`AiExplainPanel` 은 `!= null` 로 판단한다), 그건 모르는 것과 다르다.
 * `model` 은 싣지 않는다 — 모델 id 는 `cost` 쪽 계약(`toCostPayload`)에 이미 있다.
 * @param {unknown} usage 프로바이더가 준 usage
 * @returns {Record<string, number>}
 */
export function toWireUsage(usage) {
  if (!isPlainObject(usage)) return {};

  const wire = {};
  for (const [field, name] of WIRE_NAMES) {
    const value = toTokenCount(usage[field]);
    if (value !== null) wire[name] = value;
  }
  return wire;
}
