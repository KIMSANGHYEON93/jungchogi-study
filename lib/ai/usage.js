// 비용 계산과 사용 기록의 **단일 진실 원천** (블루프린트 §5 Phase 5 · §6).
//
// 이 파일에 의존성이 없는 것은 의도적이다. 서버리스 엔드포인트(`api/ai/*.js`)와
// 키 없이 도는 리포트 스크립트(`scripts/usage-report.mjs`)가 **같은 계산**을 써야
// 로그의 수치와 리포트의 수치가 갈라지지 않는다. SDK 를 import 하면 리포트 쪽이
// 무거워지고 키 없는 환경에서 깨질 수 있으므로 여기서는 아무것도 import 하지 않는다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 세 가지 원칙
// ─────────────────────────────────────────────────────────────────────────────
// 1. **"모름" 과 "0" 은 다르다.** 스트림이 중간에 끊기거나 오류가 나면 usage 가
//    일부만 오거나 아예 안 온다. 없는 값을 0 으로 때우면 비용을 과소보고한다.
//    모르는 항목은 `null` 로 남기고, 하나라도 모르면 총액(`usd`)은 `null` 이다.
//    대신 아는 항목만 더한 **하한**(`usdAtLeast`)을 함께 준다.
// 2. **모르는 모델이면 계산하지 않는다.** 가격표는 모델 id 로 키를 잡는다.
//    가격은 바뀌고 모델도 바뀐다. 조용히 틀린 비용을 보고하는 것이 최악이므로
//    가격표에 없는 모델이면 `usd: null` + `warning: 'UNKNOWN_MODEL'` 로 거부한다.
// 3. **"모르는 단가" 와 "아는 0" 도 다르다.** (2026-09-07 · 무료 라우팅 전환)
//    OpenRouter 의 `:free` 모델은 토큰 요금이 $0 이라는 것을 **우리가 안다** —
//    그건 모름이 아니라 값 0 이므로 `usd: 0` · `known: true` 로 낸다.
//    반대로 무료가 아닌 OpenRouter 모델은 모델마다 단가가 다르고 우리에게 표가 없다 →
//    (2) 의 규칙 그대로 거부한다. **조용히 0 으로 세면 유료 호출이 공짜로 사라진다.**

/**
 * 가격표 기준일. 이 문자열은 모든 비용 객체와 리포트 머리글에 실려 나간다 —
 * "어떤 가격표로 계산한 수치인가" 를 수치와 떼어 놓지 않기 위해서다.
 *
 * ⚠️ 가격은 바뀐다. 표를 고칠 때는 이 값도 함께 올리고,
 *    `tests/usage-cost.test.js` 가 박아 둔 단가도 함께 고쳐야 한다
 *    (테스트가 깨지는 것이 "가격이 바뀌었다" 를 알아채는 장치다).
 */
export const PRICING_AS_OF = '2026-06';

/** 가격표의 출처. 수치를 의심할 때 따라갈 곳. */
export const PRICING_SOURCE = 'https://claude.com/pricing — Claude Opus 5 (2026-06 확인)';

/**
 * $/1M 토큰. **모델 id 로 키를 잡는다.**
 *
 * 캐시 읽기는 입력의 0.1배, 캐시 쓰기(1시간 TTL 포함)는 1.25배다.
 * 새 모델을 쓰기 시작하면 여기에 항목을 추가해야 한다 — 추가하지 않으면
 * `calculateCost` 가 계산을 거부하고 경고를 낸다.
 *
 * **무료 OpenRouter 모델(`:free`)은 여기 없다** — id 를 하나씩 적을 수 없고 적을 필요도 없다.
 * 접미사로 판정해 `FREE_PRICING`(0) 을 쓴다 (`priceTableFor`).
 * **유료 OpenRouter 모델은 여기에 손으로 넣어야** 계산된다. 값은 `OPENROUTER_MODELS_ENDPOINT`
 * 의 `pricing.prompt`·`pricing.completion` 을 `toUsdPerMillion` 으로 옮긴 것이고,
 * 캐시 단가까지 네 항목이 다 있어야 표로 인정된다.
 */
export const PRICING = Object.freeze({
  'claude-opus-5': Object.freeze({
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  }),
});

/**
 * 무료 모델의 단가표. **모름이 아니라 값 0 이다.**
 *
 * OpenRouter 의 `:free` 변형은 토큰 요금을 받지 않는다. 그러니 총액은 0 으로 **확정**이고,
 * usage 가 덜 와도 총액이 흔들리지 않는다 (0 을 아무리 곱해도 0 이다).
 *
 * ⚠️ 이 0 도 가격이다. 무료 정책이 바뀌면 여기가 바뀌어야 하고,
 *    `tests/usage-cost.test.js` 가 이 0 을 값 그대로 박아 둬 CI 가 그 변경을 잡는다.
 */
export const FREE_PRICING = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});

/** 호출이 나가는 경로. 기록의 `provider` 는 이 둘 중 하나이거나 모름(null)이다. */
export const PROVIDERS = Object.freeze(['anthropic', 'openrouter']);

/** OpenRouter 모델 id 를 `vendor/model` 로 가르는 문자 */
const OPENROUTER_ID_SEPARATOR = '/';

/** 무료 변형을 나타내는 접미사. **대소문자를 바꾼 것은 인정하지 않는다** (추측하느니 거부한다). */
export const OPENROUTER_FREE_SUFFIX = ':free';

/**
 * 무료 모델의 실질 제약. **비용이 0 이어도 여기서 막힌다** —
 * 리포트가 비용만 보여 주면 사용자는 무엇에 걸렸는지 알 수 없다.
 *
 * ⚠️ 단가와 같은 취급이다: 값이 바뀌면 `tests/usage-cost.test.js` 가 깨진다.
 */
export const OPENROUTER_FREE_LIMITS = Object.freeze({
  requestsPerMinute: 20,
  requestsPerDay: 50,
  /** 누적 결제 이력이 `creditsThresholdUsd` 이상이면 하루 한도가 이 값으로 올라간다 */
  requestsPerDayWithCredits: 1_000,
  creditsThresholdUsd: 10,
});

/**
 * 유료 OpenRouter 모델의 단가가 있는 곳 (인증 불필요).
 * `pricing.prompt`·`pricing.completion` 은 **토큰당 USD 문자열**이다 →
 * `toUsdPerMillion` 으로 우리 표 단위($/1M)로 옮긴다.
 *
 * **런타임에 부르지 않는다.** 서버리스 요청 경로에 외부 의존을 늘리지 않는 것이 이 앱의 방침이다
 * (그래서 이 파일에는 import 가 없다). 유료 모델을 쓰게 되면 이 엔드포인트를 **오프라인에서** 읽어
 * `PRICING` 에 항목을 손으로 넣고 `PRICING_AS_OF` 를 올린다 — 그 변경이 테스트를 깨뜨리는 것이
 * 곧 승인 절차다.
 */
export const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

/** Batch API 는 위 단가 전부에 이 배수를 건다. */
export const BATCH_MULTIPLIER = 0.5;

/** 앱이 실제로 쓰는 모델 (`lib/ai/client.js` 의 MODEL 과 같아야 한다). */
export const DEFAULT_MODEL = 'claude-opus-5';

/** 모델 id 를 쓸 수 있는 문자열로 정리한다. 못 읽으면 null. */
function modelId(model) {
  if (typeof model !== 'string') return null;
  const trimmed = model.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 호출이 어느 경로로 나갔는지를 **모델 id 만으로** 판정한다.
 *
 * OpenRouter 는 모든 모델을 `vendor/model` 로 부르고, Anthropic 모델 id 에는 `/` 가 없다.
 * 그래서 슬래시 하나로 갈린다. 읽을 수 없는 id 는 기본값으로 넘기지 않고 **모름(null)** 이다 —
 * 이 파일의 나머지와 같은 규칙이다.
 *
 * @param {unknown} model
 * @returns {'anthropic'|'openrouter'|null}
 */
export function providerForModel(model) {
  const id = modelId(model);
  if (id === null) return null;
  return id.includes(OPENROUTER_ID_SEPARATOR) ? 'openrouter' : 'anthropic';
}

/**
 * 단가가 0 이라고 **아는** 모델인가.
 *
 * `vendor/model:free` 꼴, 즉 OpenRouter 의 무료 변형만 인정한다.
 * `claude-opus-5:free` 처럼 이름만 흉내 낸 id 는 무료가 아니다 —
 * 이름을 바꿔 유료 모델을 0 원으로 만들 수 있으면 판정 규칙이 무너진다.
 *
 * @param {unknown} model
 * @returns {boolean}
 */
export function isFreeModel(model) {
  const id = modelId(model);
  if (id === null) return false;
  return id.includes(OPENROUTER_ID_SEPARATOR) && id.endsWith(OPENROUTER_FREE_SUFFIX);
}

/** 네 단가가 전부 0 인 표인가 — 그러면 모르는 토큰도 0 원이라 총액이 흔들리지 않는다. */
function isZeroPriced(table) {
  return Boolean(table) && Object.values(PRICE_KEY).every((key) => table[key] === 0);
}

/** 단가표로 인정할 수 있는 모양인가 — 네 항목이 모두 유한한 음 아닌 수여야 한다. */
function isPriceTable(table) {
  if (table === null || typeof table !== 'object') return false;
  return Object.values(PRICE_KEY).every((key) => {
    const price = table[key];
    return typeof price === 'number' && Number.isFinite(price) && price >= 0;
  });
}

/**
 * 모델 id 하나로 단가표를 고른다. **비용 판정의 유일한 진입점이다.**
 *
 *   1. 가격표에 그 id 가 **직접** 있으면 그 표 (`Object.hasOwn` — `'toString'` 같은
 *      상속 이름이 표로 오인되면 단가가 undefined 가 되어 비용이 NaN 으로 번진다)
 *   2. OpenRouter 무료 변형이면 0 짜리 표 (**아는 값 0**)
 *   3. 그 밖은 undefined = **모름**. 유료 OpenRouter 모델이 여기로 온다.
 *
 * `anthropic/claude-opus-5` 처럼 라우팅을 거친 같은 모델도 (1) 에 걸리지 않는다 —
 * 중개 수수료가 붙는지 우리가 모르기 때문에 Anthropic 단가를 얹으면 안 된다.
 *
 * @param {unknown} model
 * @returns {{input: number, output: number, cacheRead: number, cacheWrite: number}|undefined}
 */
export function priceTableFor(model) {
  const id = modelId(model);
  if (id === null) return undefined;
  if (Object.hasOwn(PRICING, id) && isPriceTable(PRICING[id])) return PRICING[id];
  if (isFreeModel(id)) return FREE_PRICING;
  return undefined;
}

/**
 * OpenRouter 의 토큰당 USD(문자열)를 우리 표 단위($/1M)로 옮긴다.
 * 유료 모델을 `PRICING` 에 넣을 때 쓰는 변환기다 — 런타임 계산 경로에는 끼지 않는다.
 *
 * 읽을 수 없으면 **0 이 아니라 null** 이다. 못 읽은 단가를 0 으로 때우면
 * 유료 모델이 공짜로 계산된다.
 *
 * @param {unknown} usdPerToken `pricing.prompt` 같은 값
 * @returns {number|null}
 */
export function toUsdPerMillion(usdPerToken) {
  const raw =
    typeof usdPerToken === 'number'
      ? usdPerToken
      : typeof usdPerToken === 'string' && usdPerToken.trim() !== ''
        ? Number(usdPerToken)
        : Number.NaN;
  if (!Number.isFinite(raw) || raw < 0) return null;
  return raw * 1_000_000;
}

/** 사용 기록의 endpoint 값 — 프론트 원장과 공유하는 고정 계약이다. */
export const ENDPOINTS = Object.freeze(['tutor', 'plan', 'grade', 'generate']);

/** `output_config.effort` 로 실제로 보낼 수 있는 값. 그 밖은 기록에서 null 이다. */
export const EFFORTS = Object.freeze(['low', 'medium', 'high']);

/**
 * 사용 기록의 키 집합 — **임의로 늘리거나 이름을 바꾸지 않는다.**
 * 프론트 원장·서버 로그·리포트가 셋 다 이 목록을 기준으로 움직인다.
 */
export const USAGE_RECORD_FIELDS = Object.freeze([
  'ts',
  'endpoint',
  'model',
  // 2026-09-07 에 **더한** 항목. 기존 열둘은 이름도 뜻도 그대로다 —
  // 프론트 원장(`src/utils/usageLedger.js`)이 화이트리스트로 읽어 모르는 항목을 버리므로
  // 더하기는 안전하다. 이름을 바꾸거나 빼는 것은 세 곳을 한꺼번에 어긋내는 일이다.
  'provider',
  'effort',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheCreationTokens',
  'costUsd',
  'latencyMs',
  'ok',
  'errorCode',
]);

/** 사용 기록의 토큰 항목 이름 (계약 순서 그대로) */
export const TOKEN_FIELDS = Object.freeze([
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheCreationTokens',
]);

/** 토큰 항목 ↔ 단가 키 */
const PRICE_KEY = Object.freeze({
  inputTokens: 'input',
  outputTokens: 'output',
  cacheReadTokens: 'cacheRead',
  cacheCreationTokens: 'cacheWrite',
});

/** SDK usage(snake_case) 와 프론트 원장(camelCase) 을 모두 읽기 위한 별칭 */
const USAGE_ALIASES = Object.freeze({
  inputTokens: ['input_tokens', 'inputTokens'],
  outputTokens: ['output_tokens', 'outputTokens'],
  cacheReadTokens: ['cache_read_input_tokens', 'cacheReadTokens'],
  cacheCreationTokens: ['cache_creation_input_tokens', 'cacheCreationTokens'],
});

/** 달러 반올림 자릿수. 1e-8 이면 토큰 한 개(=$0.000005)도 뭉개지지 않는다. */
const USD_PRECISION = 1e8;

/**
 * 부동소수 잔재(0.30000000000000004)를 없앤다.
 * 값이 너무 커서 반올림 스케일이 안전 정수 범위를 넘으면 원값을 그대로 둔다 —
 * 그 구간에서는 반올림이 오히려 정밀도를 깎는다.
 * @param {number} value
 * @returns {number}
 */
function roundUsd(value) {
  const scaled = value * USD_PRECISION;
  if (!Number.isFinite(scaled) || Math.abs(scaled) > Number.MAX_SAFE_INTEGER) return value;
  return Math.round(scaled) / USD_PRECISION;
}

/**
 * 토큰 개수 하나를 읽는다.
 *
 * - 유한한 음이 아닌 수 → 그대로 (0 도 유효한 값이다)
 * - 숫자로 읽히는 문자열 → 받아들이되 "강제 변환했다" 고 알린다.
 *   로그 수집기를 거치면 숫자가 문자열이 되는 일이 있어 버리기는 아깝지만,
 *   업스트림 계약이 흔들린 신호이기도 하므로 조용히 넘기지는 않는다.
 * - 그 밖(없음·null·음수·NaN·Infinity·다른 타입) → **모름**. 0 이 아니다.
 * @param {unknown} raw
 * @returns {{value: number|null, coerced: boolean}}
 */
function readTokenCount(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? { value: raw, coerced: false } : NOT_KNOWN;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return { value: parsed, coerced: true };
  }
  return NOT_KNOWN;
}

const NOT_KNOWN = Object.freeze({ value: null, coerced: false });

/**
 * @typedef {object} TokenTally 네 항목의 토큰 수. 모르는 항목은 null 이다.
 * @property {number|null} inputTokens
 * @property {number|null} outputTokens
 * @property {number|null} cacheReadTokens
 * @property {number|null} cacheCreationTokens
 * @property {string[]} unknownFields 값을 모르는 항목 이름
 * @property {string[]} coercedFields 문자열에서 숫자로 바꿔 읽은 항목 이름
 */

/**
 * SDK 의 `message.usage` (또는 프론트 원장의 camelCase 기록)를 TokenTally 로 옮긴다.
 *
 * 이미 TokenTally 인 값을 넣어도 그대로 통과한다 (calculateCost 가 원시 usage 를
 * 그대로 받을 수 있는 이유).
 * @param {unknown} usage
 * @returns {TokenTally}
 */
export function normalizeUsage(usage) {
  const source = usage !== null && typeof usage === 'object' && !Array.isArray(usage) ? usage : {};

  /** @type {TokenTally} */
  const tally = {
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheCreationTokens: null,
    unknownFields: [],
    coercedFields: [],
  };

  for (const field of TOKEN_FIELDS) {
    let read = NOT_KNOWN;
    for (const alias of USAGE_ALIASES[field]) {
      if (!(alias in source)) continue;
      read = readTokenCount(source[alias]);
      if (read.value !== null) break;
    }

    tally[field] = read.value;
    if (read.value === null) tally.unknownFields.push(field);
    else if (read.coerced) tally.coercedFields.push(field);
  }

  return tally;
}

/**
 * @typedef {object} CostBreakdown
 * @property {number|null} usd 전 항목을 알 때의 총액. 하나라도 모르면 null.
 * @property {number|null} usdAtLeast 아는 항목만 더한 하한. 가격표가 없으면 null.
 * @property {boolean} known 총액을 신뢰할 수 있는가
 * @property {string[]} unknownFields 값을 모르는 토큰 항목
 * @property {string[]} coercedFields 문자열에서 숫자로 바꿔 읽은 항목
 * @property {string} model 계산에 쓴 모델 id
 * @property {'anthropic'|'openrouter'|null} provider 호출이 나간 경로. 모르면 null
 * @property {boolean} free 단가가 0 이라고 **아는** 모델인가
 * @property {boolean} batch Batch 할인 적용 여부
 * @property {string} pricingAsOf 가격표 기준일
 * @property {'UNKNOWN_MODEL'|'NO_USAGE'|'PARTIAL_USAGE'|null} warning
 */

/**
 * 토큰 수를 달러로 바꾼다.
 *
 * @param {TokenTally|object} tallyOrUsage TokenTally 또는 원시 usage
 * @param {{model?: unknown, batch?: boolean, provider?: unknown}} [options]
 *   `provider` 는 호출부가 아는 경로다 (없으면 모델 id 로 추론한다).
 *   **단가 판정에는 쓰이지 않는다** — 그건 언제나 모델 id 만으로 한다.
 * @returns {CostBreakdown}
 */
export function calculateCost(tallyOrUsage, options = {}) {
  const tally = Array.isArray(tallyOrUsage?.unknownFields)
    ? /** @type {TokenTally} */ (tallyOrUsage)
    : normalizeUsage(tallyOrUsage);

  const requested = options.model === undefined ? DEFAULT_MODEL : options.model;
  const model = typeof requested === 'string' ? requested : String(requested ?? '');
  const batch = options.batch === true;
  const table = priceTableFor(requested);

  const base = {
    unknownFields: [...tally.unknownFields],
    coercedFields: [...tally.coercedFields],
    model,
    provider: PROVIDERS.includes(options.provider)
      ? options.provider
      : providerForModel(requested),
    free: isZeroPriced(table),
    batch,
    pricingAsOf: PRICING_AS_OF,
  };

  // 모르는 모델 — 계산하지 않는다. 하한조차 내지 않는다 (단가를 모르므로).
  if (!table) {
    return { ...base, usd: null, usdAtLeast: null, known: false, warning: 'UNKNOWN_MODEL' };
  }

  const multiplier = batch ? BATCH_MULTIPLIER : 1;
  let sum = 0;
  for (const field of TOKEN_FIELDS) {
    const count = tally[field];
    if (count === null) continue; // 모르는 항목은 **더하지 않는다** (0 으로 때우지 않는다)
    sum += (count / 1_000_000) * table[PRICE_KEY[field]] * multiplier;
  }

  const usdAtLeast = roundUsd(sum);
  const missing = tally.unknownFields.length;

  if (missing === 0) {
    return { ...base, usd: usdAtLeast, usdAtLeast, known: true, warning: null };
  }

  // 단가가 전부 0 인 표(무료 모델)에서는 **모르는 토큰도 0 원**이라 총액이 흔들리지 않는다.
  // 여기서 usd 를 null 로 두면 사용자에게 "돈이 더 나갔을지도 모른다" 는 거짓 신호가 간다.
  // usage 가 덜 왔다는 사실은 warning·unknownFields 로 그대로 남긴다 — 다른 사실이다.
  const warning = missing === TOKEN_FIELDS.length ? 'NO_USAGE' : 'PARTIAL_USAGE';

  if (isZeroPriced(table)) {
    return { ...base, usd: 0, usdAtLeast: 0, known: true, warning };
  }
  return { ...base, usd: null, usdAtLeast, known: false, warning };
}

/**
 * 가격표가 몇 개월 묵었는지. 리포트가 "가격표가 오래됐다" 고 경고하는 데 쓴다.
 * @param {Date|number} [now]
 * @returns {number}
 */
export function pricingAgeMonths(now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const [year, month] = PRICING_AS_OF.split('-').map(Number);
  return (at.getUTCFullYear() - year) * 12 + (at.getUTCMonth() + 1 - month);
}

/** ISO 8601 문자열로 정리한다. 못 읽으면 지금 시각. */
function toIsoTimestamp(ts) {
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString();
  if (typeof ts === 'string' || typeof ts === 'number') {
    const parsed = new Date(ts);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

/**
 * @typedef {object} UsageRecord 프론트 원장·서버 로그·리포트가 공유하는 고정 계약
 * @property {string} ts ISO 8601
 * @property {'tutor'|'plan'|'grade'|'generate'} endpoint
 * @property {string} model
 * @property {'anthropic'|'openrouter'|null} provider 호출이 나간 경로. 모르면 null
 * @property {'low'|'medium'|'high'|null} effort
 * @property {number|null} inputTokens null 이면 **모름** (0 이 아니다)
 * @property {number|null} outputTokens
 * @property {number|null} cacheReadTokens
 * @property {number|null} cacheCreationTokens
 * @property {number|null} costUsd 전 항목을 알 때만 값이 있다
 * @property {number|null} latencyMs
 * @property {boolean} ok
 * @property {string|null} errorCode 실패 시 'UPSTREAM' 등
 */

/**
 * 사용 기록과 비용을 만든다.
 *
 * **열거된 인자만 읽는다.** 호출부가 실수로 답안이나 스냅샷을 통째로 넘겨도
 * 기록에는 들어가지 않는다 — 개인 학습 데이터가 로그로 새지 않게 하는 구조적 방벽이다.
 * (문항 id·출처도 넣지 않는다. 무엇을 얼마나 썼는지만 남긴다.)
 *
 * @param {object} args
 * @param {'tutor'|'plan'|'grade'|'generate'} args.endpoint
 * @param {string} args.model
 * @param {string} [args.provider] 호출부가 아는 경로. 없으면 모델 id 로 추론한다
 * @param {string} [args.effort]
 * @param {unknown} [args.usage] SDK `message.usage`. 없거나 일부만 와도 된다.
 * @param {number} [args.latencyMs]
 * @param {boolean} [args.ok]
 * @param {string|null} [args.errorCode]
 * @param {boolean} [args.batch] Batch API 호출인가 (변형 문제 생성)
 * @param {string|Date} [args.ts]
 * @returns {{record: UsageRecord, cost: CostBreakdown}}
 */
export function buildUsageRecord({
  endpoint,
  model,
  provider,
  effort,
  usage,
  latencyMs,
  ok,
  errorCode,
  batch,
  ts,
}) {
  if (!ENDPOINTS.includes(endpoint)) {
    throw new Error(`endpoint 는 ${ENDPOINTS.join('|')} 중 하나여야 합니다: ${String(endpoint)}`);
  }

  const tally = normalizeUsage(usage);
  const cost = calculateCost(tally, { model, batch: batch === true, provider });

  const latency =
    typeof latencyMs === 'number' && Number.isFinite(latencyMs)
      ? Math.max(0, Math.round(latencyMs))
      : null;

  /** @type {UsageRecord} */
  const record = {
    ts: toIsoTimestamp(ts),
    endpoint,
    model: cost.model,
    provider: cost.provider,
    effort: EFFORTS.includes(effort) ? effort : null,
    inputTokens: tally.inputTokens,
    outputTokens: tally.outputTokens,
    cacheReadTokens: tally.cacheReadTokens,
    cacheCreationTokens: tally.cacheCreationTokens,
    costUsd: cost.usd,
    latencyMs: latency,
    ok: Boolean(ok),
    errorCode: typeof errorCode === 'string' && errorCode !== '' ? errorCode : null,
  };

  return { record, cost };
}

/**
 * 응답(SSE done 프레임 · 채점 JSON)에 실을 `cost` 객체를 만든다.
 *
 * **사용 기록(UsageRecord) 전체 + 가격 판단의 근거** 다. 기록을 통째로 싣는 이유는
 * 프론트 원장(`src/utils/usageLedger.js`)이 계약된 이름(`costUsd`·`inputTokens` …)으로
 * 읽어 그대로 저장하기 때문이다 — 비용만 보내면 원장의 토큰 항목이 전부 0 이 된다.
 * `usd` 는 `costUsd` 와 같은 값의 다른 이름이다 (CostBreakdown 쪽 이름).
 *
 * 여기에도 개인 학습 데이터는 없다. 기록이 열거된 항목만으로 조립되기 때문이다.
 *
 * @param {UsageRecord} record
 * @param {CostBreakdown} cost
 * @returns {object}
 */
export function toCostPayload(record, cost) {
  return {
    ...record,
    usd: cost.usd,
    usdAtLeast: cost.usdAtLeast,
    known: cost.known,
    free: cost.free,
    unknownFields: cost.unknownFields,
    coercedFields: cost.coercedFields,
    batch: cost.batch,
    pricingAsOf: cost.pricingAsOf,
    warning: cost.warning,
  };
}

/**
 * 사용 기록을 **한 줄 JSON** 으로 stdout 에 남긴다.
 *
 * 사람이 읽는 여러 줄 로그가 아니라 기계가 파싱할 한 줄이다 — Vercel 로그를 긁어
 * `scripts/usage-report.mjs` 에 그대로 먹일 수 있어야 하기 때문이다.
 * 접두사를 붙이지 않아 줄 전체가 유효한 JSON 이다.
 *
 * @param {UsageRecord} record
 * @param {CostBreakdown} [cost] 있으면 가격표 이상(모르는 모델)을 함께 경고한다
 * @returns {string} 찍은 줄
 */
export function logUsage(record, cost) {
  const line = JSON.stringify(record);
  console.log(line);

  if (cost?.warning === 'UNKNOWN_MODEL') {
    // 경로마다 단가를 찾으러 갈 곳이 다르다. "모른다" 만 말하고 끝내면
    // 읽는 사람이 다음에 뭘 해야 하는지 알 수 없다.
    const where =
      cost.provider === 'openrouter'
        ? `${OPENROUTER_MODELS_ENDPOINT} 의 pricing.prompt·pricing.completion(토큰당 USD)을 ` +
          'lib/ai/usage.js 의 PRICING 에 넣으세요'
        : PRICING_SOURCE;
    console.warn(
      `[ai/usage] 가격표에 없는 모델이라 비용을 계산하지 않았습니다: ${cost.model} ` +
        `(경로 ${cost.provider ?? '모름'} · 가격표 기준일 ${cost.pricingAsOf} · ${where})`
    );
  }

  return line;
}
