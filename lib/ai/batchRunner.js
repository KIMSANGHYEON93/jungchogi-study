// Batch API 호출 계층 — 생성 · 폴링 · 결과 수거 · 재개 기록.
//
// Batch 는 **최대 24시간** 걸릴 수 있다. 그래서 두 가지가 필요하다:
//   1) 지수 백오프 폴링 — 한 시간을 5초마다 두드릴 이유가 없다.
//   2) 재개 — 배치를 만들자마자 batch id 를 파일로 남기고, 나중에
//      `--resume <batch_id>` 로 결과만 다시 수거할 수 있게 한다.
//
// 순수 로직(요청 조립·결과 매칭)은 `lib/ai/variants.js`, 파일 계약은
// `lib/ai/generated.js` 에 있다. 여기는 SDK 를 만지는 층이다.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getClient, classifyUpstreamError } from './client.js';

/** 첫 폴링 간격. 짧은 배치(문항 몇 개)는 1분 안에 끝나기도 한다. */
export const POLL_INITIAL_MS = 5_000;
/** 폴링 간격 상한. 이보다 뜸해지면 끝난 배치를 오래 붙잡고 있게 된다. */
export const POLL_MAX_MS = 60_000;
export const POLL_FACTOR = 1.6;
/** 기본 대기 상한 — Batch 자체의 만료 시간(24시간)과 같게 둔다. */
export const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1_000;

/**
 * 재개 기록을 두는 곳. 생성물(`public/`)과 섞지 않는다 — 배포에 나갈 파일이 아니다.
 * @returns {string}
 */
export function defaultRecordDir() {
  return fileURLToPath(new URL('../../claudedocs/generated-batches', import.meta.url));
}

/**
 * 다음 폴링 간격.
 * @param {number} previousMs 직전 간격 (첫 폴링이면 0)
 * @returns {number}
 */
export function nextPollDelay(previousMs) {
  if (!previousMs) return POLL_INITIAL_MS;
  return Math.min(POLL_MAX_MS, Math.round(previousMs * POLL_FACTOR));
}

/** SDK 예외를 계약된 오류로 바꿔 다시 던진다 (`classifyUpstreamError` 재사용). */
function rethrowUpstream(error) {
  const failure = classifyUpstreamError(error);
  const wrapped = new Error(failure.message);
  Object.assign(wrapped, failure, { cause: error });
  throw wrapped;
}

/**
 * 배치를 만든다.
 * @param {Array<{custom_id: string, params: object}>} requests
 * @returns {Promise<object>} MessageBatch
 */
export async function createVariantBatch(requests) {
  try {
    return await getClient().messages.batches.create({ requests });
  } catch (error) {
    return rethrowUpstream(error);
  }
}

/**
 * `processing_status` 가 `ended` 가 될 때까지 기다린다.
 *
 * `in_progress` 와 `canceling` 은 둘 다 "아직" 이다 — `ended` 만 끝이다.
 * 제한 시간을 넘기면 **batch id 를 메시지에 담아** 던진다. 그래야 `--resume` 으로
 * 이어받을 수 있다.
 *
 * @param {string} batchId
 * @param {{sleep?: (ms: number) => Promise<void>|void, onPoll?: (batch: object) => void,
 *          now?: () => number, timeoutMs?: number}} [options]
 * @returns {Promise<object>} 끝난 MessageBatch
 */
export async function waitForBatchEnd(batchId, options = {}) {
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = now();

  let delay = 0;
  for (;;) {
    let batch;
    try {
      batch = await getClient().messages.batches.retrieve(batchId);
    } catch (error) {
      rethrowUpstream(error);
    }

    options.onPoll?.(batch);
    if (batch.processing_status === 'ended') return batch;

    if (now() - startedAt >= timeoutMs) {
      throw new Error(
        `배치 ${batchId} 가 제한 시간 안에 끝나지 않았습니다. ` +
          `--resume ${batchId} 로 결과만 다시 수거할 수 있습니다.`
      );
    }

    delay = nextPollDelay(delay);
    await sleep(delay);
  }
}

/**
 * 결과 스트림(JSONL 디코더)을 연다. 소비는 `for await`.
 * @param {string} batchId
 * @returns {Promise<AsyncIterable<object>>}
 */
export async function streamBatchResults(batchId) {
  try {
    return await getClient().messages.batches.results(batchId);
  } catch (error) {
    return rethrowUpstream(error);
  }
}

/**
 * 배치를 취소한다 (`ended` 전에만 의미가 있다).
 * @param {string} batchId
 * @returns {Promise<object>}
 */
export async function cancelBatch(batchId) {
  try {
    return await getClient().messages.batches.cancel(batchId);
  } catch (error) {
    return rethrowUpstream(error);
  }
}

/** batch id 를 파일명으로 쓰기 전에 경로 구분자를 막는다. */
function assertSafeBatchId(batchId) {
  if (typeof batchId !== 'string' || batchId === '' || /[\\/]/.test(batchId) || batchId.includes('..')) {
    throw new Error(`batch id 로 쓸 수 없는 값입니다: ${batchId}`);
  }
  return batchId;
}

/**
 * @param {string} batchId
 * @param {string} [dir]
 * @returns {string}
 */
export function batchRecordPath(batchId, dir = defaultRecordDir()) {
  return join(dir, `${assertSafeBatchId(batchId)}.json`);
}

/**
 * @typedef {object} BatchRecord
 * @property {string} batchId
 * @property {string} source
 * @property {string[]} ids 이 배치에 넣은 원본 문항 id
 * @property {number} variantsPerItem
 * @property {string} out 결과를 쓸 파일 경로
 * @property {string} createdAt
 */

/**
 * 재개 기록을 남긴다. **배치를 만든 직후** 부르는 것이 중요하다 —
 * 그 뒤에 프로세스가 죽어도 batch id 를 잃지 않는다.
 * @param {BatchRecord} record
 * @param {{dir?: string}} [options]
 * @returns {string} 기록 파일 경로
 */
export function saveBatchRecord(record, options = {}) {
  const dir = options.dir ?? defaultRecordDir();
  const path = batchRecordPath(record.batchId, dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return path;
}

/**
 * @param {string} batchId
 * @param {{dir?: string}} [options]
 * @returns {BatchRecord|null} 기록이 없으면 null
 */
export function loadBatchRecord(batchId, options = {}) {
  const path = batchRecordPath(batchId, options.dir ?? defaultRecordDir());
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 무료 경로(OpenRouter) — Batch API 가 없어 `completeJson` 을 반복 호출한다
// ─────────────────────────────────────────────────────────────────────────────
//
// 위쪽 Batch 경로는 Anthropic 전용이다. OpenRouter 에는 그것에 해당하는 것이 없어
// 같은 일을 **제한 병렬 + 스로틀**로 한다. 배치와 달리 여기서는 우리가 직접
// 속도를 지켜야 한다:
//
//   · 분당 20회를 넘기면 429 가 줄줄이 난다. 실패한 호출도 하루 한도를 깎으므로
//     "넘으면 재시도" 가 아니라 애초에 넘지 않는 것이 답이다 → `createRateLimiter`.
//   · 하루 50회(무입금 계정)가 진짜 벽이다. 30건짜리 실행 하나가 하루치의 60% 다.
//     한도를 다 쓰면 남은 호출은 전부 429 이므로 **더 두드리지 않고 멈춘다**.
//   · 멈춘 자리에서 이어갈 수 있어야 한다. Batch 의 `--resume <batch_id>` 에
//     해당하는 것이 없으니 **성공한 결과를 파일에 쌓아** 다음 실행이 남은 것만 돌린다.

import { getProvider } from './provider.js';
import { OPENROUTER_FREE_LIMITS } from './usage.js';
import { missingVariantFields, variantItemFromOutput } from './variants.js';

const MINUTE_MS = 60_000;

/** 동시에 띄우는 호출 수. 분당 한도가 실질 상한이라 크게 잡을 이유가 없다. */
export const DEFAULT_CONCURRENCY = 3;

/** 분당 한도에 걸렸을 때 한 호출에 허용하는 재시도 횟수 (하루 한도는 재시도하지 않는다). */
export const MINUTE_LIMIT_RETRIES = 1;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 미끄러지는 창(sliding window) 방식의 호출 속도 제한기.
 *
 * `windowMs` 안에 `limit` 건까지만 통과시키고, 넘으면 가장 오래된 호출이 창 밖으로
 * 나갈 때까지 재운다. 고정 간격(예: 3초에 한 건)이 아니라 창을 쓰는 이유는,
 * 한도가 "분당 N회" 로 정의돼 있어 앞쪽에 몰아 보내고 기다리는 편이 전체 시간이
 * 짧기 때문이다.
 *
 * `acquire` 는 **직렬화**된다 — 워커 여러 개가 동시에 불러도 창 계산이 겹치지 않는다.
 * 시계와 대기는 주입할 수 있다 (진짜로 1분을 기다리는 테스트는 쓸 수 없다).
 *
 * @param {{limit: number, windowMs?: number, now?: () => number,
 *          sleep?: (ms: number) => Promise<void>|void}} options
 * @returns {{acquire: () => Promise<void>, count: () => number}}
 */
export function createRateLimiter({ limit, windowMs = MINUTE_MS, now = Date.now, sleep = defaultSleep } = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limit 은 1 이상의 정수여야 합니다: ${limit}`);
  }

  /** 창 안에 남아 있는 호출 시각들 (오래된 것이 앞) */
  const stamps = [];
  let queue = Promise.resolve();

  async function take() {
    for (;;) {
      const cutoff = now() - windowMs;
      while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();

      if (stamps.length < limit) {
        stamps.push(now());
        return;
      }

      // 가장 오래된 호출이 창 밖으로 나갈 때까지. 0 이하면 1ms 라도 양보한다
      // (그대로 돌면 바쁜 대기가 된다).
      const waitMs = stamps[0] + windowMs - now();
      await sleep(waitMs > 0 ? waitMs : 1);
    }
  }

  return {
    acquire() {
      const next = queue.then(take);
      queue = next.then(
        () => {},
        () => {}
      );
      return next;
    },
    count: () => stamps.length,
  };
}

/**
 * @typedef {object} VariantEntry
 * @property {string} customId
 * @property {object} item 생성물 계약 shape 의 항목
 */

/**
 * @typedef {object} SerialUsage
 * @property {string} model 실제로 부른 모델 id
 * @property {number} calls 업스트림에 나간 **시도** 수 (실패도 한도를 깎으므로 함께 센다)
 * @property {number} inputTokens 아는 값만 더한 합
 * @property {number} outputTokens 아는 값만 더한 합
 * @property {number} unknownUsage 토큰 수를 알 수 없었던 응답 수
 */

/** 한 호출을 실패로 적는다 (Batch 경로의 `VariantFailure` 와 같은 모양). */
function serialFailure(call, type, message) {
  return { customId: call.customId, id: call.id, variant: call.variant, type, message };
}

/**
 * 변형 호출들을 **제한 병렬 + 스로틀**로 돌린다. Batch 경로의
 * `createVariantBatch` + `waitForBatchEnd` + `collectVariantResults` 를 합친 자리다.
 *
 * 지키는 것 넷:
 *   1. **분당 한도를 넘지 않는다** — 모든 시도가 `limiter.acquire()` 를 지나간다.
 *   2. **개별 실패가 전체를 죽이지 않는다** — 5xx·JSON 파싱 실패·필수 필드 누락은
 *      그 호출만 `failures` 로 가고 나머지는 계속 돈다.
 *   3. **하루 한도는 재시도하지 않고 멈춘다** — 남은 호출도 전부 429 일 것이고,
 *      429 도 한도를 깎아 다음 날 몫까지 미리 태운다.
 *   4. **성공은 그때그때 흘려보낸다** (`onEntry`) — 중간에 죽어도 이미 만든 문항을
 *      잃지 않게 호출부가 파일에 쌓을 수 있어야 한다.
 *
 * 결과 배열은 **호출 순서**다 — 동시성을 바꿔도 같은 파일이 나온다.
 *
 * @param {{calls: import('./variants.js').VariantCall[], provider?: object,
 *          originals?: Array<object>, concurrency?: number,
 *          limiter?: {acquire: () => Promise<void>},
 *          sleep?: (ms: number) => Promise<void>|void,
 *          onEntry?: (entry: VariantEntry) => void,
 *          onFailure?: (failure: object) => void}} args
 * @returns {Promise<{entries: VariantEntry[], failures: object[], usage: SerialUsage,
 *                    stopped: {reason: string, message: string, retryAfterSeconds: number|null,
 *                              remaining: number}|null}>}
 */
export async function runVariantCalls({
  calls,
  provider = getProvider(),
  originals = [],
  concurrency = DEFAULT_CONCURRENCY,
  limiter = createRateLimiter({ limit: OPENROUTER_FREE_LIMITS.requestsPerMinute }),
  sleep = defaultSleep,
  onEntry,
  onFailure,
} = {}) {
  if (!Array.isArray(calls)) throw new Error('calls 는 배열이어야 합니다.');
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency 는 1 이상의 정수여야 합니다: ${concurrency}`);
  }

  const byId = new Map(originals.map((item) => [item.id, item]));

  // 완료 순서가 아니라 **호출 순서**로 담는다 — 동시성이 결과 파일을 흔들면 안 된다.
  const entrySlots = new Array(calls.length).fill(null);
  const failureSlots = new Array(calls.length).fill(null);

  const usage = {
    model: provider.model,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    unknownUsage: 0,
  };

  let stopped = null;

  const record = (index, call, type, message) => {
    const failure = serialFailure(call, type, message);
    failureSlots[index] = failure;
    onFailure?.(failure);
  };

  const accumulate = (reported) => {
    let known = true;
    for (const field of ['inputTokens', 'outputTokens']) {
      const value = reported?.[field];
      if (typeof value === 'number' && Number.isFinite(value)) usage[field] += value;
      else known = false;
    }
    if (!known) usage.unknownUsage += 1;
  };

  async function attempt(call, index) {
    for (let tries = 0; ; tries += 1) {
      await limiter.acquire();
      usage.calls += 1;

      let payload;
      try {
        payload = await provider.completeJson({
          system: call.system,
          messages: call.messages,
          schema: call.schema,
          schemaName: call.schemaName,
          maxTokens: call.maxTokens,
          effort: call.effort,
        });
      } catch (error) {
        const failure = provider.classifyError(error);
        const rateLimited = failure.code === 'RATE_LIMITED';

        if (rateLimited && failure.limitScope === 'daily') {
          stopped = {
            reason: 'daily-quota',
            message: failure.message,
            retryAfterSeconds: failure.retryAfterSeconds ?? null,
            remaining: 0, // 아래에서 성공 수를 뺀 값으로 채운다
          };
          record(index, call, 'rate_limited', failure.message);
          return;
        }

        if (rateLimited && tries < MINUTE_LIMIT_RETRIES) {
          await sleep((failure.retryAfterSeconds ?? 60) * 1_000);
          continue;
        }

        record(index, call, rateLimited ? 'rate_limited' : 'errored', failure.message);
        return;
      }

      accumulate(payload?.usage);

      const output = payload?.data;
      if (output === null || typeof output !== 'object') {
        record(index, call, 'invalid', '응답에서 JSON 객체를 읽지 못했습니다.');
        return;
      }

      const original = byId.get(call.id);
      if (!original) {
        record(index, call, 'unknown', `원본 문항을 찾지 못했습니다: ${call.id}`);
        return;
      }

      const missing = missingVariantFields(call.source, output);
      if (missing.length > 0) {
        record(index, call, 'invalid', `필수 필드가 비었습니다: ${missing.join(', ')}`);
        return;
      }

      const entry = {
        customId: call.customId,
        item: variantItemFromOutput({
          source: call.source,
          original,
          output,
          variant: call.variant,
        }),
      };
      entrySlots[index] = entry;
      onEntry?.(entry);
      return;
    }
  }

  let next = 0;
  const worker = async () => {
    for (;;) {
      if (stopped) return;
      const index = next;
      next += 1;
      if (index >= calls.length) return;
      await attempt(calls[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, calls.length) }, () => worker())
  );

  const entries = entrySlots.filter(Boolean);
  if (stopped) stopped.remaining = calls.length - entries.length;

  return { entries, failures: failureSlots.filter(Boolean), usage, stopped };
}

// ─────────────────────────────────────────────────────────────────────────────
// 진행 기록 — 무료 경로의 "재개"
// ─────────────────────────────────────────────────────────────────────────────
//
// Batch 는 서버가 결과를 24시간 들고 있어 batch id 하나로 언제든 되찾는다.
// 무료 경로에는 그런 것이 없다 — 만든 문항은 우리 프로세스 안에만 있고, 하루 한도에
// 걸리면 **다음 날까지** 이어갈 수 없다. 그래서 성공한 결과를 그때그때 파일에 쌓고,
// 다음 실행이 남은 것만 부른다.
//
// **섞이면 거절한다.** 다른 source·다른 모델·읽을 수 없는 파일을 조용히 무시하면,
// 봉투의 `model` 이 거짓말을 하거나 이미 만든 문항을 덮어쓴다.

/** 진행 기록 형식 버전. 모양이 바뀌면 올리고 옛 파일은 거절한다. */
export const PROGRESS_VERSION = 1;

/**
 * @typedef {object} VariantProgress
 * @property {number} version
 * @property {string} source
 * @property {string} model 이 기록을 만든 모델 id
 * @property {string} out 결과를 쓸 파일 경로
 * @property {string} startedAt
 * @property {string} updatedAt
 * @property {VariantEntry[]} entries 성공한 것만
 * @property {object[]} failures 마지막 실행에서 실패한 것들 (참고용 — 다시 부른다)
 */

/**
 * 새 진행 기록을 만든다 (아직 파일에 쓰지는 않는다).
 * @param {{source: string, model: string, out: string, now?: () => Date}} args
 * @returns {VariantProgress}
 */
export function createVariantProgress({ source, model, out, now = () => new Date() }) {
  const at = now().toISOString();
  return {
    version: PROGRESS_VERSION,
    source,
    model,
    out,
    startedAt: at,
    updatedAt: at,
    entries: [],
    failures: [],
  };
}

/** source 를 파일명으로 쓰기 전에 경로 구분자를 막는다 (`assertSafeBatchId` 와 같은 이유). */
function assertSafeSource(source) {
  if (
    typeof source !== 'string' ||
    source === '' ||
    /[\\/]/.test(source) ||
    source.includes('..')
  ) {
    throw new Error(`진행 기록 파일명으로 쓸 수 없는 source 입니다: ${source}`);
  }
  return source;
}

/**
 * @param {string} source
 * @param {string} [dir]
 * @returns {string} `<dir>/<source>-progress.json`
 */
export function variantProgressPath(source, dir = defaultRecordDir()) {
  return join(dir, `${assertSafeSource(source)}-progress.json`);
}

/**
 * 진행 기록을 파일로 굳힌다. **성공이 하나 늘 때마다** 부르는 것이 요점이다 —
 * 그 뒤에 프로세스가 죽어도 이미 만든 문항을 잃지 않는다.
 * @param {VariantProgress} progress
 * @param {{dir?: string, path?: string, now?: () => Date}} [options]
 * @returns {string} 기록 파일 경로
 */
export function saveVariantProgress(progress, options = {}) {
  const dir = options.dir ?? defaultRecordDir();
  const path = options.path ?? variantProgressPath(progress.source, dir);
  const now = options.now ?? (() => new Date());

  progress.updatedAt = now().toISOString();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
  return path;
}

/**
 * 진행 기록을 되읽는다. 없으면 null (첫 실행이다).
 *
 * `model` 을 주면 **같은 모델이 만든 기록인지 확인한다.** 다른 모델이 만든 항목과
 * 섞으면 생성물 봉투의 `model` 한 칸이 무엇이 만든 문항인지 더는 말해 주지 못한다.
 *
 * @param {{source: string, model?: string, dir?: string, path?: string}} args
 * @returns {VariantProgress|null}
 */
export function loadVariantProgress({ source, model, dir, path } = {}) {
  const file = path ?? variantProgressPath(source, dir ?? defaultRecordDir());
  if (!existsSync(file)) return null;

  let progress;
  try {
    progress = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `진행 기록을 읽지 못했습니다: ${file}\n` +
        `  ${error.message}\n` +
        '  손으로 고치거나 파일을 지우고 처음부터 다시 돌리세요.'
    );
  }

  if (progress?.version !== PROGRESS_VERSION) {
    throw new Error(
      `진행 기록의 version 이 ${PROGRESS_VERSION} 이 아닙니다 (${progress?.version}): ${file}`
    );
  }
  if (progress.source !== source) {
    throw new Error(
      `진행 기록의 source 가 다릅니다: 파일 ${progress.source} · 요청 ${source} (${file})`
    );
  }
  if (typeof model === 'string' && progress.model !== model) {
    throw new Error(
      `진행 기록을 만든 model 이 지금 쓰는 것과 다릅니다: ` +
        `기록 ${progress.model} · 지금 ${model}\n` +
        '  섞으면 생성물의 model 이 무엇이 만든 문항인지 말해 주지 못합니다. ' +
        '이어가려면 같은 모델로, 새로 만들려면 --fresh 로 돌리세요.'
    );
  }

  progress.entries ??= [];
  progress.failures ??= [];
  return progress;
}

/**
 * 진행 기록을 지운다. 다 끝난 뒤에만 부른다 — 남겨 두면 다음 실행이 낡은 결과를 집는다.
 * @param {{source: string, dir?: string, path?: string}} args
 */
export function clearVariantProgress({ source, dir, path } = {}) {
  const file = path ?? variantProgressPath(source, dir ?? defaultRecordDir());
  rmSync(file, { force: true });
}

/**
 * 아직 만들지 못한 호출만 남긴다.
 *
 * **실패는 결과가 아니다** — `failures` 에 있는 것은 다시 부른다. 성공한 `entries`
 * 의 customId 만 건너뛴다.
 *
 * @param {import('./variants.js').VariantCall[]} calls
 * @param {VariantProgress|null} progress
 * @returns {import('./variants.js').VariantCall[]}
 */
export function remainingCalls(calls, progress) {
  const done = new Set((progress?.entries ?? []).map((entry) => entry.customId));
  return calls.filter((call) => !done.has(call.customId));
}
