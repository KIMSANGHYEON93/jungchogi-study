// OpenRouter 프로바이더 — OpenAI 호환 API 위에 `lib/ai/provider.js` 의 계약을 구현한다.
//
// **의존성을 추가하지 않는다.** `fetch` 로 충분하다 (SDK 를 깔면 번들이 무거워지고
// Vercel 함수 콜드스타트가 길어진다). OpenAI 호환이라 요청·응답 모양이 문서화돼 있고,
// 우리가 쓰는 것은 chat/completions 하나뿐이다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 경로가 Anthropic 과 다른 지점
// ─────────────────────────────────────────────────────────────────────────────
// 1. **프롬프트 캐시가 없다.** `cache_control` 에 해당하는 것이 없어 system 블록을
//    이어 붙여 하나로 보낸다. 캐시 프리픽스 설계(§5 Phase 5)의 이득은 여기서 사라진다.
// 2. **Batch API 가 없다.** 변형 생성(Phase 4)은 이 프로바이더로 옮길 수 없다.
// 3. **무료 모델은 하루 50회(무입금 계정)·분당 20회.** 실질적 제약은 하루 쪽이라
//    429 를 받으면 분당인지 하루인지 갈라서 안내한다.
// 4. **모델 id 가 바뀐다.** 아래 능력표는 특정 시점의 사실이고, 404 와 능력표
//    미등재 경고 두 가지로 낡음을 알아챈다.

import { iterateSseJson } from './sse.js';
import { extractJsonObject, describeSchema } from './json.js';
import { mapOpenAiUsage, emptyUsage, createUsageAccumulator } from './usage.js';

export const CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** 인증 없이 볼 수 있다. 모델 id 가 살아 있는지 확인할 곳. */
export const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * 능력표를 만든 날. 이 값이 오래됐다면 표를 의심할 근거가 된다.
 * `MODELS_URL` 의 `supported_parameters` 를 그대로 옮긴 것이다.
 */
export const CAPABILITIES_AS_OF = '2026-09-07';

/**
 * 무료 모델의 능력표.
 *
 * `tools`·`response_format`·`structured_outputs` 는 모델마다 다르고, **없는 것을
 * 보내면 400 이 난다.** 요청을 보내기 전에 무엇을 걸 수 있는지 여기서 정한다.
 * 표에 없는 모델은 가장 보수적인 값(전부 false)으로 다룬다 —
 * 조용히 400 을 받는 것보다 한 단계 낮은 품질로 도는 편이 낫다.
 */
export const MODEL_CAPABILITIES = Object.freeze({
  // 엄격 스키마까지 되는 셋 (2026-09-07 확인)
  'nvidia/nemotron-3-super-120b-a12b:free': Object.freeze({
    tools: true,
    responseFormat: true,
    strictSchema: true,
    reasoningEffort: true,
    contextLength: 262_144,
  }),
  'dots-studio/dots-3-note-preview:free': Object.freeze({
    tools: true,
    responseFormat: true,
    strictSchema: true,
    reasoningEffort: false,
    contextLength: 512_000,
  }),
  'liquid/lfm-2.5-2.6b:free': Object.freeze({
    tools: true,
    responseFormat: true,
    strictSchema: true,
    reasoningEffort: false,
    contextLength: 65_536,
  }),
  // response_format(json_object)까지 되는 모델
  'minimax/minimax-m3:free': Object.freeze({
    tools: true,
    responseFormat: true,
    strictSchema: false,
    reasoningEffort: false,
    contextLength: 1_048_576,
  }),
  'minimax/minimax-m2.7:free': Object.freeze({
    tools: true,
    responseFormat: true,
    strictSchema: false,
    reasoningEffort: false,
    contextLength: 196_608,
  }),
  'google/gemma-4-31b-it:free': Object.freeze({
    tools: true,
    responseFormat: true,
    strictSchema: false,
    reasoningEffort: false,
    contextLength: 262_144,
  }),
  'google/gemma-4-26b-a4b-it:free': Object.freeze({
    tools: true,
    responseFormat: true,
    strictSchema: false,
    reasoningEffort: false,
    contextLength: 262_144,
  }),
  // 도구만 되는 모델 (구조화 출력은 프롬프트로 부탁하는 수밖에 없다)
  'thinkingmachines/inkling:free': Object.freeze({
    tools: true,
    responseFormat: false,
    strictSchema: false,
    reasoningEffort: false,
    contextLength: 1_048_576,
  }),
  'nvidia/nemotron-3-ultra-550b-a55b:free': Object.freeze({
    tools: true,
    responseFormat: false,
    strictSchema: false,
    reasoningEffort: false,
    contextLength: 1_000_000,
  }),
  'nvidia/nemotron-3.5-lightning:free': Object.freeze({
    tools: true,
    responseFormat: false,
    strictSchema: false,
    reasoningEffort: false,
    contextLength: 1_000_000,
  }),
});

/** 표에 없는 모델에 쓰는 값. 가장 보수적인 쪽으로 둔다. */
export const UNKNOWN_MODEL_CAPABILITIES = Object.freeze({
  tools: true, // 도구는 무료 모델 18종 중 17종이 지원한다 — 없으면 애초에 플래너를 못 쓴다
  responseFormat: false,
  strictSchema: false,
  reasoningEffort: false,
  contextLength: null,
});

/**
 * 기본 모델.
 *
 * 고르는 기준은 셋이었다 — ① 도구 호출 ② 엄격 스키마(json_schema) ③ 긴 컨텍스트.
 * 이 앱은 세 기능(해설·플래너·채점)이 각각 스트리밍·도구 루프·구조화 출력을 쓰므로
 * **셋을 다 가진 모델**이라야 프로바이더 하나로 덮을 수 있다.
 * 2026-09-07 기준 무료 모델 18종 중 그 조건을 만족하는 것은 세 개뿐이고
 * (nemotron-3-super · dots-3-note-preview · lfm-2.5-2.6b) 그중 이것을 고른 이유:
 *   · `lfm-2.5-2.6b` 는 2.6B 라 한국어 개념 설명·채점에 쓰기에는 작다.
 *   · `dots-3-note-preview` 는 이름부터 preview 다. preview 모델은 먼저 사라진다.
 *   · `nemotron-3-super-120b-a12b` 는 셋 중 유일하게 `reasoning_effort` 를 받는다 —
 *     이 앱은 기능별 effort(해설 low·채점 medium·플래너 high, 블루프린트 §7-1)를
 *     이미 계약에 갖고 있어 그대로 이어진다.
 */
export const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

/** 업스트림이 응답하지 않을 때 끊는 시간. Vercel 함수 실행 시간 안에 끝나야 한다. */
export const REQUEST_TIMEOUT_MS = 60_000;

/** Retry-After 가 없을 때 쓰는 값 (분당 한도 기준) */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

/** 이보다 긴 대기를 요구받으면 분당이 아니라 하루 한도로 본다 */
const DAILY_LIMIT_THRESHOLD_SECONDS = 600;

/** `output_config.effort` 와 같은 세 값만 보낸다 */
const EFFORTS = ['low', 'medium', 'high'];

/** 구조화 출력 단계 — 위에서 아래로 내려간다 */
const TIERS = ['json_schema', 'json_object', 'plain'];

/** 도구 루프의 반복 상한 = 호출 상한 + 최종 응답 1 + 여유 3 (`client.js` 의 계산과 같다) */
const ITERATION_HEADROOM = 4;

/** 호출부가 상한을 주지 않았을 때. 블루프린트 §4.3 의 12회와 같다. */
export const DEFAULT_MAX_TOOL_CALLS = 12;

/**
 * @typedef {object} UpstreamFailure
 * @property {'UPSTREAM'|'RATE_LIMITED'} code 클라이언트에 내려보낼 계약 코드
 * @property {string} message 사용자에게 보여줄 메시지 (업스트림 원문은 싣지 않는다)
 * @property {boolean} retryable 같은 요청을 다시 보내볼 만한가
 * @property {number|undefined} status 업스트림 HTTP 상태
 * @property {number} [retryAfterSeconds] 429 일 때만
 * @property {'minute'|'daily'} [limitScope] 429 일 때만
 */

/** 분류가 끝난 실패를 들고 다니는 오류. 던져서 호출부의 catch 로 간다. */
export class OpenRouterError extends Error {
  /** @param {UpstreamFailure} failure */
  constructor(failure) {
    super(failure.message);
    this.name = 'OpenRouterError';
    this.failure = failure;
  }
}

/** 헤더 값에 허용하는 코드 포인트 — 탭과 인쇄 가능한 ASCII */
const TAB = 9;
const FIRST_PRINTABLE = 0x20;
const LAST_PRINTABLE = 0x7e;

const GENERIC_FAILURE = Object.freeze({
  code: 'UPSTREAM',
  message: 'AI 응답을 받지 못했습니다.',
  retryable: false,
  status: undefined,
});

/**
 * 헤더에 실을 수 있는 값인가.
 * HTTP 헤더 값은 바이트 단위라 한글을 넣으면 `fetch` 가 `TypeError` 로 **던진다** —
 * 리더보드 표기용 선택 헤더 하나 때문에 AI 기능 전체가 죽으면 안 된다.
 * 인쇄 가능한 ASCII 와 탭만 통과시킨다 (안전한 쪽으로 좁게 잡는다).
 */
function isHeaderSafe(value) {
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code !== TAB && (code < FIRST_PRINTABLE || code > LAST_PRINTABLE)) return false;
  }
  return true;
}

/**
 * 요청 헤더를 만든다. 선택 헤더는 값이 없거나 헤더에 못 실으면 붙이지 않는다.
 * @param {Record<string, string|undefined>} env
 * @param {string} apiKey
 */
export function buildHeaders(env, apiKey) {
  const headers = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  };

  // OpenRouter 리더보드 표기용 (선택). 없으면 생략한다.
  for (const [name, raw] of [
    ['HTTP-Referer', env.OPENROUTER_SITE_URL],
    ['X-Title', env.OPENROUTER_APP_NAME],
  ]) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === '') continue;
    if (!isHeaderSafe(value)) {
      console.warn(
        `[ai/openrouter] ${name} 헤더에 실을 수 없는 문자가 있어 생략합니다 (ASCII 만 가능).`
      );
      continue;
    }
    headers[name] = value;
  }
  return headers;
}

/**
 * system 블록 배열을 role:'system' 메시지 하나로 접는다.
 * OpenAI 호환 API 에는 블록·캐시 개념이 없다.
 * @param {Array<{text: string}>|string|undefined} system
 * @returns {string}
 */
function joinSystem(system) {
  if (typeof system === 'string') return system.trim();
  if (!Array.isArray(system)) return '';
  return system
    .map((block) => (typeof block === 'string' ? block : (block?.text ?? '')))
    .filter((text) => typeof text === 'string' && text.trim() !== '')
    .join('\n\n');
}

/** 응답 메시지의 content 를 문자열로 만든다 (배열 멀티파트도 다룬다) */
function readContent(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part?.text ?? '')))
      .filter((text) => typeof text === 'string')
      .join('');
  }
  // 모델이 답을 거절하면 content 대신 refusal 이 온다
  if (typeof message?.refusal === 'string') return message.refusal;
  return '';
}

/** 스키마 이름은 OpenAI 규격상 `[a-zA-Z0-9_-]` 다 */
function safeSchemaName(name) {
  const cleaned = typeof name === 'string' ? name.replace(/[^A-Za-z0-9_-]/g, '') : '';
  return cleaned === '' ? 'output' : cleaned.slice(0, 64);
}

/** 업스트림 오류 본문에서 메시지만 뽑는다 (사용자에게 보여주지는 않고 분류에만 쓴다) */
function readErrorMessage(bodyText) {
  if (typeof bodyText !== 'string' || bodyText.trim() === '') return '';
  try {
    const parsed = JSON.parse(bodyText);
    const message = parsed?.error?.message ?? parsed?.message;
    return typeof message === 'string' ? message : bodyText;
  } catch {
    return bodyText;
  }
}

/** 헤더 값을 수로 읽는다. 없거나(`null`) 빈 문자열이면 null — `Number(null)` 은 0 이라 그냥 쓰면 안 된다. */
function headerNumber(headers, name) {
  const raw = headers?.get?.(name);
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** 초 단위 대기 시간을 헤더에서 읽는다 */
function readRetryAfter(headers, now) {
  const retryAfter = headerNumber(headers, 'retry-after');
  if (retryAfter !== null && retryAfter >= 0) return Math.round(retryAfter);

  const reset = headerNumber(headers, 'x-ratelimit-reset');
  if (reset !== null && reset > 0) {
    // ms epoch 로 온다. 이미 지난 값이면 쓰지 않는다.
    const seconds = Math.round((reset - now) / 1000);
    if (seconds > 0) return seconds;
  }
  return null;
}

/**
 * HTTP 상태와 본문으로 실패를 분류한다.
 *
 * 순서는 좁은 것부터다. 특히 **404 는 "모델 id 가 사라졌다"** 로 읽어야 한다 —
 * 무료 모델 id 는 실제로 바뀌고, 그때 나오는 메시지가 유일한 단서다.
 * @returns {UpstreamFailure}
 */
export function classifyStatus({ status, bodyText, headers, model, now = Date.now() }) {
  const upstreamMessage = readErrorMessage(bodyText);

  if (status === 401 || status === 403) {
    return {
      code: 'UPSTREAM',
      message:
        'AI 요청이 거부되었습니다. OPENROUTER_API_KEY 가 올바른지 서버 설정을 확인해 주세요.',
      retryable: false,
      status,
    };
  }

  if (status === 402) {
    return {
      code: 'UPSTREAM',
      message:
        'OpenRouter 계정의 크레딧이나 사용 한도가 부족합니다. 계정 상태를 확인해 주세요.',
      retryable: false,
      status,
    };
  }

  if (status === 404) {
    return {
      code: 'UPSTREAM',
      message:
        `요청한 모델(${model})을 찾을 수 없습니다. OpenRouter 의 무료 모델 id 는 바뀌거나 사라집니다. ` +
        `${MODELS_URL} 에서 쓸 수 있는 모델을 확인한 뒤 OPENROUTER_MODEL 을 바꿔 주세요.`,
      retryable: false,
      status,
    };
  }

  if (status === 429) {
    const fromHeader = readRetryAfter(headers, now);
    const looksDaily =
      /per[-\s]?day|daily|하루|일일/i.test(upstreamMessage) ||
      (fromHeader !== null && fromHeader > DAILY_LIMIT_THRESHOLD_SECONDS);

    return {
      code: 'RATE_LIMITED',
      message: looksDaily
        ? '무료 모델의 하루 사용 한도를 다 썼습니다. 내일 다시 시도하거나 다른 모델·프로바이더로 바꿔 주세요.'
        : 'AI 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.',
      retryable: true,
      status,
      retryAfterSeconds: fromHeader ?? DEFAULT_RETRY_AFTER_SECONDS,
      limitScope: looksDaily ? 'daily' : 'minute',
    };
  }

  const retryable = typeof status === 'number' && status >= 500;
  return {
    code: 'UPSTREAM',
    message: retryable
      ? 'AI 서버가 일시적으로 응답하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      : 'AI 요청이 거부되었습니다. 서버 설정을 확인해 주세요.',
    retryable,
    status,
  };
}

/**
 * 어떤 예외든 계약 모양으로 만든다. `classifyUpstreamError`(client.js)와 같은 자리다.
 * @param {unknown} error
 * @returns {UpstreamFailure}
 */
export function classifyOpenRouterError(error) {
  if (error instanceof OpenRouterError) return error.failure;

  // AbortSignal.timeout 은 TimeoutError, 수동 취소는 AbortError 로 온다
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return {
      code: 'UPSTREAM',
      message: 'AI 서버가 시간 안에 응답하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      retryable: true,
      status: undefined,
    };
  }

  // undici 는 연결 실패를 TypeError('fetch failed') 로 던진다
  if (error instanceof TypeError) {
    return {
      code: 'UPSTREAM',
      message: 'AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      retryable: true,
      status: undefined,
    };
  }

  return { ...GENERIC_FAILURE };
}

/** 구조화 출력을 못 쓴다는 뜻의 오류인가 (능력표가 낡았다는 신호) */
function isUnsupportedFormatFailure(failure, upstreamMessage) {
  if (failure.status !== 400 && failure.status !== 404 && failure.status !== 422) return false;
  return /response_format|json_schema|structured|schema/i.test(upstreamMessage);
}

/**
 * OpenRouter 프로바이더를 만든다.
 * @param {Record<string, string|undefined>} [env]
 */
export function createOpenRouterProvider(env = process.env) {
  const apiKey = typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY.trim() : '';
  const configured =
    typeof env.OPENROUTER_MODEL === 'string' ? env.OPENROUTER_MODEL.trim() : '';
  const model = configured === '' ? DEFAULT_OPENROUTER_MODEL : configured;

  const known = Object.hasOwn(MODEL_CAPABILITIES, model);
  const caps = known ? MODEL_CAPABILITIES[model] : UNKNOWN_MODEL_CAPABILITIES;

  if (!known) {
    // 능력표에 없는 모델은 낡음의 첫 신호다. 404 를 받기 전에 로그로 알린다.
    console.warn(
      `[ai/openrouter] 모델 "${model}" 은 능력표(${CAPABILITIES_AS_OF} 기준)에 없습니다. ` +
        `구조화 출력을 걸지 않고 프롬프트로만 형식을 알립니다. ` +
        `${MODELS_URL} 에서 supported_parameters 를 확인해 능력표를 갱신하세요.`
    );
  }

  /**
   * 이 프로바이더 인스턴스가 실제로 쓸 수 있다고 확인한 단계.
   * 능력표가 틀려 400 을 받으면 한 단계 내려 **기억한다** — 하루 50회 제약 아래에서
   * 매 호출마다 같은 400 을 한 번씩 낭비할 수는 없다.
   */
  let tierFloor = caps.strictSchema ? 0 : caps.responseFormat ? 1 : 2;

  const requireKey = () => {
    if (apiKey === '') {
      throw new OpenRouterError({
        code: 'UPSTREAM',
        message: 'AI 기능이 설정되지 않았습니다 (OPENROUTER_API_KEY 없음).',
        retryable: false,
        status: undefined,
      });
    }
    return apiKey;
  };

  /**
   * 요청 본문을 만든다.
   * @param {object} args
   * @param {number} args.tier 구조화 출력 단계 인덱스
   */
  const buildBody = ({ system, messages, maxTokens, effort, schema, schemaName, tools, stream, tier }) => {
    const useSchema = schema !== null && typeof schema === 'object';
    const tierName = TIERS[tier];

    const systemParts = [joinSystem(system)];
    // ②·③ 단계에서는 스키마를 프롬프트로 알리는 수밖에 없다.
    // **지시 뒤에** 붙인다 — 마지막에 읽는 것이 형식이어야 형식을 지킨다.
    if (useSchema && tierName !== 'json_schema') {
      systemParts.push(describeSchema(schema, schemaName));
    }
    const systemText = systemParts.filter((part) => part !== '').join('\n\n');

    const body = { model, messages: [] };
    if (systemText !== '') body.messages.push({ role: 'system', content: systemText });
    for (const message of Array.isArray(messages) ? messages : []) {
      if (message && typeof message === 'object') body.messages.push(message);
    }

    if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;
    if (caps.reasoningEffort && EFFORTS.includes(effort)) body.reasoning_effort = effort;

    if (useSchema && tierName === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: safeSchemaName(schemaName), strict: true, schema },
      };
    } else if (useSchema && tierName === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
    if (stream) {
      body.stream = true;
      // 마지막 청크에 usage 를 실어 달라는 OpenAI 표준 플래그
      body.stream_options = { include_usage: true };
    }
    return body;
  };

  /**
   * 요청을 한 번 보낸다. 실패하면 분류된 `OpenRouterError` 를 던진다.
   * @returns {Promise<Response>}
   */
  const send = async (body, { stream }) => {
    const key = requireKey();
    let response;
    try {
      response = await fetch(CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: buildHeaders(env, key),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new OpenRouterError(classifyOpenRouterError(error));
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const failure = classifyStatus({
        status: response.status,
        bodyText,
        headers: response.headers,
        model,
      });
      const error = new OpenRouterError(failure);
      error.upstreamMessage = readErrorMessage(bodyText);
      throw error;
    }

    // 200 인데 본문이 오류인 경우가 있다 (중계 계층이 그렇게 낸다)
    if (!stream) {
      const payload = await response.json().catch(() => null);
      if (payload === null) {
        throw new OpenRouterError({
          code: 'UPSTREAM',
          message: 'AI 응답을 읽지 못했습니다 (JSON 이 아닙니다).',
          retryable: true,
          status: response.status,
        });
      }
      if (payload.error && !Array.isArray(payload.choices)) {
        const status = Number(payload.error?.code);
        throw new OpenRouterError(
          classifyStatus({
            status: Number.isFinite(status) ? status : undefined,
            bodyText: JSON.stringify(payload),
            headers: response.headers,
            model,
          })
        );
      }
      return payload;
    }

    return response;
  };

  /**
   * 구조화 출력 단계를 내려 가며 한 번만 다시 시도한다.
   *
   * 능력표가 낡아 400 이 나는 경우가 유일한 재시도 사유다. 하루 50회 제약 때문에
   * 무턱대고 재시도할 수 없어 **한 호출당 한 번**으로 못 박는다.
   */
  const sendWithTierFallback = async (args, { stream }) => {
    const hasSchema = args.schema !== null && typeof args.schema === 'object';
    let tier = tierFloor;
    let downgraded = false;

    for (;;) {
      try {
        return await send(buildBody({ ...args, tier, stream }), { stream });
      } catch (error) {
        const canDowngrade =
          hasSchema &&
          !downgraded && // 한 호출에 한 번뿐 — 하루 50회 아래에서 재시도는 비싸다
          error instanceof OpenRouterError &&
          tier < TIERS.length - 1 &&
          isUnsupportedFormatFailure(error.failure, error.upstreamMessage ?? '');

        if (!canDowngrade) throw error;
        downgraded = true;

        console.warn(
          `[ai/openrouter] 모델 "${model}" 이 ${TIERS[tier]} 를 거부했습니다. ` +
            `${TIERS[tier + 1]} 단계로 내려 다시 시도합니다 (능력표가 낡았을 수 있습니다).`
        );
        tier += 1;
        tierFloor = tier; // 다음 호출부터는 처음부터 이 단계로 간다
      }
    }
  };

  /** 비스트리밍 응답 하나를 계약 모양으로 옮긴다 */
  const readCompletion = (payload) => {
    const message = payload?.choices?.[0]?.message ?? null;
    const text = readContent(message);
    return {
      data: extractJsonObject(text),
      text,
      usage: mapOpenAiUsage(payload?.usage, model),
      message,
    };
  };

  return {
    name: 'openrouter',
    model,
    capabilities: caps,
    supportsPromptCache: false,
    supportsStrictSchema: Boolean(caps.strictSchema),
    supportsTools: Boolean(caps.tools),

    hasKey: () => apiKey !== '',
    classifyError: classifyOpenRouterError,

    /**
     * 스트리밍 텍스트 (해설).
     *
     * async generator 라 **첫 `next()` 에서야 요청이 나간다** — 엔드포인트가
     * "첫 이벤트까지만 먼저 받아 보고, 실패하면 아직 헤더를 안 보냈으니
     * JSON 오류로 내려간다" 는 기존 패턴(`api/ai/tutor.js`)을 그대로 쓸 수 있다.
     */
    async *streamText({ system, messages, maxTokens, effort }) {
      const response = await sendWithTierFallback(
        { system, messages, maxTokens, effort, schema: null },
        { stream: true }
      );

      let usage = null;
      let failure = null;

      for await (const event of iterateSseJson(response.body)) {
        // 200 으로 열린 스트림 안에 오류가 실려 오는 경우가 있다. 그 자리에서 끝낸다.
        if (event.error) {
          const status = Number(event.error?.code);
          failure = classifyStatus({
            status: Number.isFinite(status) ? status : undefined,
            bodyText: JSON.stringify(event),
            headers: response.headers,
            model,
          });
          break;
        }

        if (event.usage) usage = mapOpenAiUsage(event.usage, model);

        // `delta.reasoning` 은 해설 본문이 아니다 — 흘리면 화면에 사고 과정이 섞인다
        const text = event.choices?.[0]?.delta?.content;
        if (typeof text === 'string' && text !== '') yield { type: 'text', text };
      }

      if (failure) throw new OpenRouterError(failure);
      // usage 를 못 받았어도 done 은 낸다. 모르는 값은 0 이 아니라 null 이다.
      yield { type: 'done', usage: usage ?? emptyUsage(model) };
    },

    /** 도구 루프 (플래너) */
    runToolLoop(args) {
      return runOpenRouterToolLoop({ args, model, sendWithTierFallback, readCompletion });
    },

    /** 구조화 출력 1회 (채점) */
    async completeJson({ system, messages, schema, schemaName, maxTokens, effort }) {
      const payload = await sendWithTierFallback(
        { system, messages, schema: schema ?? null, schemaName, maxTokens, effort },
        { stream: false }
      );
      const { data, text, usage } = readCompletion(payload);
      return { data, text, usage };
    },

  };
}

/**
 * 도구 루프 본체 — SDK Tool Runner 에 해당하는 것이 없어 직접 돈다.
 *
 * 지켜야 할 것 넷:
 *   1. **한 턴에 여러 도구를 병렬로 부를 수 있다.** `tool_calls` 는 배열이고,
 *      각각에 대해 `{role:'tool', tool_call_id, content}` 를 **하나도 빠짐없이**
 *      돌려줘야 한다. 하나만 빠뜨려도 다음 요청이 400 이다.
 *   2. **도구를 부른 assistant 메시지를 `tool_calls` 째로 대화에 남긴다.**
 *      이것이 없으면 tool 메시지가 어디에 붙는 결과인지 알 수 없다.
 *   3. **호출 상한을 넘으면 실행하지 않되 결과는 돌려준다.** "더 못 쓴다, 지금까지
 *      모은 것으로 마무리하라" 는 도구 결과를 주면 모델이 계획을 쓰고 끝낸다
 *      (`lib/ai/tools/index.js` 가 쓰는 방식과 같다. 거절도 결과다).
 *   4. **반복 상한**을 따로 둔다. 상한에 걸린 뒤에도 도구만 부르며 맴도는 모델이
 *      있으면 여기서 끊는다 (`PLAN_MAX_ITERATIONS` 와 같은 성격의 안전망).
 *
 * 도구가 던져도 루프는 죽지 않는다 — `{error}` 를 돌려주면 모델이 다른 길을 찾는다.
 * @returns {Promise<{data: object|null, text: string, usage: object, toolCalls: number}>}
 */
async function runOpenRouterToolLoop({ args, model, sendWithTierFallback, readCompletion }) {
  const {
    system,
    messages,
    tools = [],
    maxToolCalls = DEFAULT_MAX_TOOL_CALLS,
    maxTokens,
    effort,
    schema = null,
    schemaName,
    onEvent,
  } = args;

  const emit = (event) => {
    if (typeof onEvent === 'function') onEvent(event);
  };

  const byName = new Map();
  const wireTools = [];
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (typeof tool?.name !== 'string' || tool.name === '') continue;
    byName.set(tool.name, tool);
    wireTools.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.parameters ?? { type: 'object', properties: {} },
      },
    });
  }

  const conversation = Array.isArray(messages) ? [...messages] : [];
  const usageTotal = createUsageAccumulator(model);
  const maxIterations = maxToolCalls + ITERATION_HEADROOM;

  let toolCalls = 0;
  let text = '';
  let data = null;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const payload = await sendWithTierFallback(
      {
        system,
        messages: conversation,
        schema,
        schemaName,
        maxTokens,
        effort,
        tools: wireTools,
      },
      { stream: false }
    );

    usageTotal.add(mapOpenAiUsage(payload?.usage, model));

    const completion = readCompletion(payload);
    const message = completion.message;
    const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

    if (calls.length === 0) {
      text = completion.text;
      data = completion.data;
      break;
    }

    conversation.push({ role: 'assistant', content: message?.content ?? null, tool_calls: calls });

    for (const call of calls) {
      const name = typeof call?.function?.name === 'string' ? call.function.name : '(이름 없음)';
      const { input, parseFailed } = readToolArguments(call?.function?.arguments);

      emit({ type: 'tool', name, input });

      let result;
      let ok = false;
      if (parseFailed) {
        result = { error: `${name} 의 인자를 JSON 으로 읽지 못했습니다. 다시 만들어 주세요.` };
      } else if (!byName.has(name)) {
        const available = [...byName.keys()].join(', ') || '(없음)';
        result = { error: `${name} 이라는 도구는 없습니다. 쓸 수 있는 도구: ${available}.` };
      } else if (toolCalls >= maxToolCalls) {
        result = {
          error:
            `도구 호출 상한(${maxToolCalls}회)에 도달했습니다. 더 이상 도구를 쓸 수 없습니다. ` +
            `지금까지 모은 정보만으로 마무리해 주세요.`,
        };
      } else {
        toolCalls += 1;
        try {
          result = await byName.get(name).run(input);
          ok = !(result !== null && typeof result === 'object' && result.error);
        } catch (error) {
          console.error(`[ai/openrouter] 도구 ${name} 실행 실패`, error);
          result = { error: `${name} 실행 중 오류가 발생했습니다.` };
        }
      }

      emit({ type: 'tool_result', name, ok });
      conversation.push({
        role: 'tool',
        tool_call_id: typeof call?.id === 'string' ? call.id : '',
        content: typeof result === 'string' ? result : JSON.stringify(result ?? null),
      });
    }
  }

  return { data, text, usage: usageTotal.total(), toolCalls };
}

/**
 * 도구 인자를 읽는다. 문자열 JSON 이 정석이지만 객체로 주는 중계기도 있다.
 * 객체가 아닌 JSON(문자열·숫자)은 인자로 쓸 수 없으므로 빈 객체로 본다 —
 * 그것 때문에 도구 실행을 거절하면 모델이 고칠 수 없는 이유로 막힌다.
 * @returns {{input: object, parseFailed: boolean}}
 */
function readToolArguments(raw) {
  if (raw !== null && typeof raw === 'object') return { input: raw, parseFailed: false };
  if (typeof raw !== 'string' || raw.trim() === '') return { input: {}, parseFailed: false };

  try {
    const parsed = JSON.parse(raw);
    return {
      input: parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {},
      parseFailed: false,
    };
  } catch {
    return { input: {}, parseFailed: true };
  }
}
