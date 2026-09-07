// Anthropic 프로바이더 — 기존 `lib/ai/client.js` 호출을 프로바이더 계약으로 감싼다.
//
// **기존 동작을 바꾸지 않는 것이 이 파일의 유일한 요구사항이다.** 그래서 요청
// 파라미터를 여기서 다시 조립하지 않고 `client.js` 의 `build*Request` 를 **그대로
// 부른다**. 모델·effort·`thinking` 생략·`cache_control` TTL·서버측 폴백·prefill 금지가
// 전부 그 함수들 안에 있고, 여기서는 계약이 허용하는 두 값(maxTokens·effort)만
// 위에 덮어쓴다. `tests/provider-anthropic.test.js` 가 두 결과를 직접 비교한다.
//
// 불가피한 중복은 두 줄뿐이다:
//   · 스트림 네임스페이스 선택(`USE_SERVER_FALLBACK ? beta : 기본`) — `streamTutorMessage`
//     는 tutor 전용 파라미터를 스스로 만들어서 maxTokens·effort 를 받을 자리가 없다.
//   · `parse` 네임스페이스 선택 — `gradeMessage` 도 같은 이유다.
// client.js 를 고치지 않기로 한 제약 아래에서 이보다 줄일 방법이 없었다.

import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';

import {
  MODEL,
  USE_SERVER_FALLBACK,
  PLAN_MAX_ITERATIONS,
  getClient,
  hasApiKey,
  classifyUpstreamError,
  buildTutorRequest,
  buildGradeRequest,
  buildPlanRequest,
} from '../client.js';
import { mapAnthropicUsage } from './usage.js';

/** 프롬프트 캐시 breakpoint (블루프린트 §3.2 — 1시간 TTL) */
const CACHE_CONTROL = Object.freeze({ type: 'ephemeral', ttl: '1h' });

/** 호출부가 상한을 주지 않았을 때 (블루프린트 §4.3) */
export const DEFAULT_MAX_TOOL_CALLS = 12;

/** 도구 루프 안전망의 여유분. 12 + 4 = 16 = `PLAN_MAX_ITERATIONS` 다. */
const ITERATION_HEADROOM = PLAN_MAX_ITERATIONS - DEFAULT_MAX_TOOL_CALLS;

/**
 * 프로바이더 공통 system 블록을 Anthropic 형태로 옮긴다.
 *
 * **캐시 breakpoint 는 `cacheable` 로 표시된 마지막 블록 하나에만 건다.**
 * 기존 엔드포인트가 그렇게 만들고 있고 `tests/prompt-cache-prefix.test.js` 가
 * "고정 프리픽스의 **마지막 블록에만** 존재" 를 지키고 있다 — 늘리면 그 불변이 깨진다.
 * @param {Array<{text: string, cacheable?: boolean}>|string|undefined} system
 * @returns {Array<object>}
 */
export function toAnthropicSystem(system) {
  if (typeof system === 'string') return system === '' ? [] : [{ type: 'text', text: system }];
  if (!Array.isArray(system)) return [];

  const blocks = system.map((block) => {
    if (typeof block === 'string') return { type: 'text', text: block };
    // 이미 SDK 모양이면 손대지 않는다 (엔드포인트가 직접 만든 블록을 그대로 넘길 수 있게)
    if (block?.type === 'text') return { ...block };
    return { type: 'text', text: block?.text ?? '' };
  });

  let lastCacheable = -1;
  system.forEach((block, index) => {
    if (block?.cacheable) lastCacheable = index;
  });
  if (lastCacheable >= 0) blocks[lastCacheable].cache_control = { ...CACHE_CONTROL };

  return blocks;
}

/** 계약이 허용하는 두 값만 덮어쓴다. 나머지는 build*Request 가 정한 그대로다. */
function applyOverrides(params, { maxTokens, effort }) {
  if (Number.isFinite(maxTokens) && maxTokens > 0) params.max_tokens = maxTokens;
  if (typeof effort === 'string' && effort !== '') {
    params.output_config = { ...params.output_config, effort };
  }
  return params;
}

/** 메시지의 text 블록만 이어 붙인다 (`extractPlan`·`normalizeGrade` 와 같은 규칙) */
function readText(message) {
  return (message?.content ?? [])
    .filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * 프로바이더 공통 도구를 SDK Tool Runner 가 쓰는 형태로 감싼다.
 *
 * `lib/ai/tools/index.js` 와 같은 방식이다 — `betaTool` 이 만든 것에 `strict: true`
 * 를 얹고(헬퍼가 받지 않는 필드라 뒤에 붙인다), 실행 래퍼가 진행 이벤트·호출 상한·
 * 예외 흡수를 맡는다. 결과는 언제나 JSON 문자열이다: 실패해도 던지지 않고 `{error}`
 * 를 돌려주어야 모델이 다른 길을 찾는다 (루프가 죽는 것보다 낫다).
 */
function wrapTools({ tools, maxToolCalls, emit, stats }) {
  return (Array.isArray(tools) ? tools : [])
    .filter((tool) => typeof tool?.name === 'string' && tool.name !== '')
    .map((tool) => ({
      ...betaTool({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.parameters ?? { type: 'object', properties: {} },
        run: async (rawInput) => {
          const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
          emit({ type: 'tool', name: tool.name, input });

          if (stats.calls >= maxToolCalls) {
            emit({ type: 'tool_result', name: tool.name, ok: false });
            return JSON.stringify({
              error:
                `도구 호출 상한(${maxToolCalls}회)에 도달했습니다. 더 이상 도구를 쓸 수 없습니다. ` +
                `지금까지 모은 정보만으로 마무리해 주세요.`,
            });
          }
          stats.calls += 1;

          let result;
          try {
            result = await tool.run(input);
          } catch (error) {
            console.error(`[ai/anthropic] 도구 ${tool.name} 실행 실패`, error);
            result = { error: `${tool.name} 실행 중 오류가 발생했습니다.` };
          }

          const ok = !(result !== null && typeof result === 'object' && result.error);
          emit({ type: 'tool_result', name: tool.name, ok });
          return typeof result === 'string' ? result : JSON.stringify(result ?? null);
        },
      }),
      strict: true,
    }));
}

/**
 * Anthropic 프로바이더를 만든다.
 * 키는 여기서 확인하지 않는다 — `getClient()` 가 실제로 쓸 때 던진다
 * (모듈 import 시점에 키를 요구하면 키 없는 환경에서 테스트가 안 돈다).
 */
export function createAnthropicProvider() {
  return {
    name: 'anthropic',
    model: MODEL,
    supportsPromptCache: true,
    supportsStrictSchema: true,
    supportsTools: true,

    hasKey: hasApiKey,
    classifyError: classifyUpstreamError,

    /** 스트리밍 텍스트 (해설) */
    async *streamText({ system, messages, maxTokens, effort }) {
      const params = applyOverrides(
        buildTutorRequest({ system: toAnthropicSystem(system), messages }),
        { maxTokens, effort }
      );

      const anthropic = getClient();
      const stream = USE_SERVER_FALLBACK
        ? anthropic.beta.messages.stream(params)
        : anthropic.messages.stream(params);

      for await (const event of stream) {
        // thinking 델타는 흘리지 않는다 (기본 display 가 omitted 라 비어 있기도 하다)
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      yield { type: 'done', usage: mapAnthropicUsage(final?.usage, MODEL) };
    },

    /** 구조화 출력 1회 (채점) */
    async completeJson({ system, messages, schema, maxTokens, effort }) {
      const params = applyOverrides(
        buildGradeRequest({ system: toAnthropicSystem(system), messages, schema }),
        { maxTokens, effort }
      );

      const anthropic = getClient();
      const message = USE_SERVER_FALLBACK
        ? await anthropic.beta.messages.parse(params)
        : await anthropic.messages.parse(params);

      const parsed = message?.parsed_output;
      return {
        data: parsed !== null && typeof parsed === 'object' ? parsed : null,
        text: readText(message),
        usage: mapAnthropicUsage(message?.usage, MODEL),
      };
    },

    /** 도구 루프 (플래너) */
    async runToolLoop({
      system,
      messages,
      tools,
      maxToolCalls = DEFAULT_MAX_TOOL_CALLS,
      maxTokens,
      effort,
      schema,
      onEvent,
    }) {
      const stats = { calls: 0 };
      const emit = (event) => {
        if (typeof onEvent === 'function') onEvent(event);
      };

      const params = applyOverrides(
        buildPlanRequest({
          system: toAnthropicSystem(system),
          messages,
          tools: wrapTools({ tools, maxToolCalls, emit, stats }),
          schema,
        }),
        { maxTokens, effort }
      );
      // 호출 상한이 기본값이면 결과가 PLAN_MAX_ITERATIONS 와 같다 (12 + 4 = 16).
      params.max_iterations = maxToolCalls + ITERATION_HEADROOM;

      const runner = getClient().beta.messages.toolRunner(params);
      // 도구 실행은 러너가 next() 안에서 한다. 진행 이벤트는 그때 위 래퍼가 발행한다.
      for await (const stream of runner) await stream.finalMessage();

      const final = await runner.done();
      const parsed = final?.parsed_output;
      return {
        data: parsed !== null && typeof parsed === 'object' ? parsed : null,
        text: readText(final),
        usage: mapAnthropicUsage(final?.usage, MODEL),
        toolCalls: stats.calls,
      };
    },
  };
}
