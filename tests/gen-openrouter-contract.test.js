// **두 경로가 같은 계약을 낸다** (블루프린트 §4.4).
//
// Anthropic 은 Batch, OpenRouter 는 직렬 호출이라 실행 방식이 전혀 다르다.
// 그런데 결과물은 **같은 파일 형식**이어야 한다 — 앱은 어느 경로가 만들었는지
// 모른 채 `public/data/generated/<source>.json` 하나를 읽는다.
//
// 다른 것은 봉투의 `model` 한 칸뿐이고, 그건 **달라야 한다** —
// 검수자가 무엇이 만든 문항인지 알아야 한다.

import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { loadSource, clearContentCache } from '../lib/ai/content.js';
import {
  buildVariantCalls,
  collectVariantResults,
  formatCustomId,
  sortVariantEntries,
} from '../lib/ai/variants.js';
import { createRateLimiter, runVariantCalls } from '../lib/ai/batchRunner.js';
import {
  GENERATED_VERSION,
  buildGeneratedDoc,
  generatedItemFields,
  validateGeneratedDoc,
} from '../lib/ai/generated.js';
import { MODEL } from '../lib/ai/client.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/ai-data', import.meta.url));
const FREE_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
const GENERATED_AT = '2026-09-07T00:00:00.000Z';

beforeEach(() => {
  vi.stubEnv('JUNGCHOGI_DATA_DIR', FIXTURE_DIR);
  clearContentCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearContentCache();
});

const noWaitLimiter = () =>
  createRateLimiter({ limit: 1_000, windowMs: 1, now: () => 0, sleep: async () => {} });

/** source 별로 두 경로에 **같은 모델 출력**을 준다 */
function outputFor(source, id, variant) {
  if (source === 'codedrill') {
    return {
      title: `${id}-v${variant} 변형 제목`,
      context: '',
      code: `int a = ${variant};`,
      answer: '추적표: a=1 → 출력 1',
      expectedOutput: String(variant),
      pitfall: '증감 연산자 위치',
    };
  }
  return { question: `${id}-v${variant} 변형 지문`, answer: `${id}-v${variant} 정답` };
}

/** Batch 결과 스트림 한 줄 */
function batchRow(source, id, variant) {
  return {
    custom_id: formatCustomId({ source, id, variant }),
    result: {
      type: 'succeeded',
      message: {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(outputFor(source, id, variant)) }],
        usage: { input_tokens: 900, output_tokens: 1_400 },
      },
    },
  };
}

async function* stream(rows) {
  for (const row of rows) yield row;
}

/** Batch 경로로 만든 항목 */
async function itemsFromBatchPath(source, problems, variants) {
  const rows = [];
  for (const problem of problems) {
    for (let variant = 1; variant <= variants; variant += 1) {
      rows.push(batchRow(source, problem.id, variant));
    }
  }
  const { items, failures } = await collectVariantResults({
    results: stream(rows),
    source,
    originals: loadSource(source),
  });
  expect(failures).toEqual([]);
  return items;
}

/** 무료 경로로 만든 항목 */
async function itemsFromFreePath(source, problems, variants) {
  const calls = buildVariantCalls({ source, problems, variantsPerItem: variants });
  const byPrompt = new Map(calls.map((call) => [call.messages[0].content, call]));

  const provider = {
    name: 'openrouter',
    model: FREE_MODEL,
    hasKey: () => true,
    classifyError: (error) => ({ code: 'UPSTREAM', message: String(error), retryable: false }),
    completeJson: async (args) => {
      const call = byPrompt.get(args.messages[0].content);
      return {
        data: outputFor(source, call.id, call.variant),
        text: '',
        usage: {
          model: FREE_MODEL,
          inputTokens: 900,
          outputTokens: 1_400,
          cacheReadTokens: null,
          cacheCreationTokens: null,
        },
      };
    },
  };

  const { entries, failures, stopped } = await runVariantCalls({
    calls,
    provider,
    originals: problems,
    limiter: noWaitLimiter(),
  });
  expect(failures).toEqual([]);
  expect(stopped).toBeNull();
  return sortVariantEntries(entries, loadSource(source));
}

describe.each(['quiz100', 'bogang', 'codedrill'])('생성물 계약 — %s', (source) => {
  it('두 경로가 글자 그대로 같은 items 를 낸다', async () => {
    const problems = loadSource(source);
    const [batchItems, freeItems] = await Promise.all([
      itemsFromBatchPath(source, problems, 2),
      itemsFromFreePath(source, problems, 2),
    ]);

    expect(freeItems).toEqual(batchItems);
    expect(freeItems).toHaveLength(problems.length * 2);
  });

  it('항목 필드가 계약과 정확히 같다 (여분 필드도 위반이다)', async () => {
    const problems = loadSource(source);
    const items = await itemsFromFreePath(source, problems, 1);

    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(generatedItemFields(source).sort());
    }
  });

  it('무료 경로 생성물이 검증기를 통과한다', async () => {
    const problems = loadSource(source);
    const items = await itemsFromFreePath(source, problems, 2);

    const doc = buildGeneratedDoc({
      source,
      items,
      model: FREE_MODEL,
      generatedAt: GENERATED_AT,
    });
    const validation = validateGeneratedDoc(doc, { originals: loadSource(source) });

    expect(validation.issues).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('봉투는 두 경로에서 model 만 다르다', async () => {
    const problems = loadSource(source);
    const items = await itemsFromFreePath(source, problems, 1);

    const free = buildGeneratedDoc({ source, items, model: FREE_MODEL, generatedAt: GENERATED_AT });
    const anthropic = buildGeneratedDoc({ source, items, generatedAt: GENERATED_AT });

    expect(free).toEqual({ ...anthropic, model: FREE_MODEL });
    expect(anthropic.model).toBe(MODEL);
    expect(free.version).toBe(GENERATED_VERSION);
    expect(free.reviewed).toBe(false);
  });

  it('무료 경로 생성물도 reviewed 는 false 다 — 앱이 쓰지 않는다', async () => {
    const problems = loadSource(source);
    const items = await itemsFromFreePath(source, problems, 1);

    expect(buildGeneratedDoc({ source, items, model: FREE_MODEL }).reviewed).toBe(false);
  });

  it('생성 id 가 원본과 충돌하지 않는다', async () => {
    const problems = loadSource(source);
    const items = await itemsFromFreePath(source, problems, 2);
    const originalIds = new Set(loadSource(source).map((item) => item.id));

    for (const item of items) {
      expect(originalIds.has(item.id)).toBe(false);
      expect(item.id.startsWith(`${item.variantOf}-v`)).toBe(true);
    }
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
});

describe('무료 경로에서 부분 실패가 나도 생성물은 계약을 지킨다', () => {
  it('실패한 것만 빠지고 나머지는 그대로 파일이 된다', async () => {
    const source = 'quiz100';
    const problems = loadSource(source);
    const calls = buildVariantCalls({ source, problems, variantsPerItem: 2 });
    const byPrompt = new Map(calls.map((call) => [call.messages[0].content, call]));

    const provider = {
      name: 'openrouter',
      model: FREE_MODEL,
      hasKey: () => true,
      classifyError: () => ({ code: 'UPSTREAM', message: '5xx', retryable: true }),
      completeJson: async (args) => {
        const call = byPrompt.get(args.messages[0].content);
        if (call.customId === calls[2].customId) throw new Error('boom');
        if (call.customId === calls[4].customId) {
          return { data: { question: '지문', answer: '' }, text: '', usage: null };
        }
        return {
          data: outputFor(source, call.id, call.variant),
          text: '',
          usage: { model: FREE_MODEL, inputTokens: 1, outputTokens: 1 },
        };
      },
    };

    const { entries, failures } = await runVariantCalls({
      calls,
      provider,
      originals: problems,
      limiter: noWaitLimiter(),
    });

    expect(failures.map((f) => f.type).sort()).toEqual(['errored', 'invalid']);

    const doc = buildGeneratedDoc({
      source,
      items: sortVariantEntries(entries, loadSource(source)),
      model: FREE_MODEL,
      generatedAt: GENERATED_AT,
    });

    expect(doc.items).toHaveLength(calls.length - 2);
    expect(validateGeneratedDoc(doc, { originals: loadSource(source) }).issues).toEqual([]);
  });
});
