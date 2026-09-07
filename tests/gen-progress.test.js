// 무료 경로의 **중단·재개** — Batch 의 `--resume <batch_id>` 에 해당하는 것이 없다.
//
// Batch 는 서버가 결과를 24시간 들고 있어 batch id 하나만 있으면 언제든 되찾는다.
// OpenRouter 에는 그런 것이 없다. 만든 문항은 우리 프로세스 메모리에만 있고,
// 하루 한도(무입금 계정 50회)에 걸리면 **다음 날까지** 이어갈 수 없다.
//
// 그래서 성공한 결과를 그때그때 파일에 쌓는다. 30건 중 20건에서 막혔다면
// 다음 날 같은 명령을 다시 돌려 **남은 10건만** 나가야 한다.

import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { loadSource, clearContentCache } from '../lib/ai/content.js';
import { buildVariantCalls, sortVariantEntries } from '../lib/ai/variants.js';
import {
  PROGRESS_VERSION,
  createRateLimiter,
  createVariantProgress,
  variantProgressPath,
  saveVariantProgress,
  loadVariantProgress,
  clearVariantProgress,
  remainingCalls,
  runVariantCalls,
} from '../lib/ai/batchRunner.js';
import { OpenRouterError, classifyStatus } from '../lib/ai/providers/openrouter.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/ai-data', import.meta.url));
const FREE_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

let dir;

beforeEach(() => {
  vi.stubEnv('JUNGCHOGI_DATA_DIR', FIXTURE_DIR);
  clearContentCache();
  dir = mkdtempSync(join(tmpdir(), 'gen-progress-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearContentCache();
  rmSync(dir, { recursive: true, force: true });
});

const newProgress = (overrides = {}) =>
  createVariantProgress({
    source: 'quiz100',
    model: FREE_MODEL,
    out: 'public/data/generated/quiz100.json',
    ...overrides,
  });

const entryFor = (call) => ({
  customId: call.customId,
  item: {
    id: `${call.id}-v${call.variant}`,
    question: '지문',
    answer: '정답',
    category: '데이터베이스',
    variantOf: call.id,
    generated: true,
  },
});

function fixtureCalls({ source = 'quiz100', variants = 2 } = {}) {
  const problems = loadSource(source);
  return { problems, calls: buildVariantCalls({ source, problems, variantsPerItem: variants }) };
}

describe('진행 기록 파일 — 저장과 되읽기', () => {
  it('source 마다 한 파일을 쓴다', () => {
    expect(variantProgressPath('quiz100', dir)).toBe(join(dir, 'quiz100-progress.json'));
  });

  it('경로 구분자가 섞인 source 는 파일명으로 쓰지 않는다', () => {
    expect(() => variantProgressPath('../../etc/passwd', dir)).toThrow();
  });

  it('저장한 뒤 그대로 되읽는다', () => {
    const { calls } = fixtureCalls();
    const progress = newProgress();
    progress.entries.push(entryFor(calls[0]));

    const path = saveVariantProgress(progress, { dir });
    expect(existsSync(path)).toBe(true);

    const loaded = loadVariantProgress({ source: 'quiz100', dir });
    expect(loaded.version).toBe(PROGRESS_VERSION);
    expect(loaded.model).toBe(FREE_MODEL);
    expect(loaded.entries).toEqual(progress.entries);
  });

  it('기록이 없으면 null 이다 (첫 실행)', () => {
    expect(loadVariantProgress({ source: 'quiz100', dir })).toBeNull();
  });

  it('저장할 때마다 updatedAt 이 올라간다', () => {
    const progress = newProgress({ now: () => new Date('2026-09-07T00:00:00.000Z') });
    saveVariantProgress(progress, { dir, now: () => new Date('2026-09-07T01:00:00.000Z') });

    const loaded = loadVariantProgress({ source: 'quiz100', dir });
    expect(loaded.startedAt).toBe('2026-09-07T00:00:00.000Z');
    expect(loaded.updatedAt).toBe('2026-09-07T01:00:00.000Z');
  });

  it('다 끝나면 지운다 — 다음 실행이 낡은 결과를 집지 않게', () => {
    const path = saveVariantProgress(newProgress(), { dir });
    expect(existsSync(path)).toBe(true);

    clearVariantProgress({ source: 'quiz100', dir });
    expect(existsSync(path)).toBe(false);
    expect(() => clearVariantProgress({ source: 'quiz100', dir })).not.toThrow();
  });
});

describe('진행 기록 파일 — 섞이면 거절한다', () => {
  it('다른 source 의 기록이면 던진다', () => {
    saveVariantProgress(newProgress({ source: 'bogang' }), { dir, path: variantProgressPath('quiz100', dir) });

    expect(() => loadVariantProgress({ source: 'quiz100', dir })).toThrow(/source/);
  });

  it('다른 모델이 만든 기록이면 던진다 — 봉투의 model 이 거짓말을 하게 된다', () => {
    saveVariantProgress(newProgress({ model: 'google/gemma-4-31b-it:free' }), { dir });

    expect(() => loadVariantProgress({ source: 'quiz100', model: FREE_MODEL, dir })).toThrow(
      /model|모델/
    );
  });

  it('모델을 주지 않으면 모델은 따지지 않는다 (읽기만 하는 경우)', () => {
    saveVariantProgress(newProgress({ model: 'google/gemma-4-31b-it:free' }), { dir });

    expect(loadVariantProgress({ source: 'quiz100', dir }).model).toBe('google/gemma-4-31b-it:free');
  });

  it('읽을 수 없는 파일이면 던진다 — 조용히 무시하면 이미 만든 문항을 덮어쓴다', () => {
    writeFileSync(variantProgressPath('quiz100', dir), '{ 깨진 JSON', 'utf8');

    expect(() => loadVariantProgress({ source: 'quiz100', dir })).toThrow();
  });

  it('version 이 다르면 던진다', () => {
    const progress = newProgress();
    progress.version = PROGRESS_VERSION + 1;
    writeFileSync(variantProgressPath('quiz100', dir), JSON.stringify(progress), 'utf8');

    expect(() => loadVariantProgress({ source: 'quiz100', dir })).toThrow(/version/);
  });
});

describe('remainingCalls — 이미 만든 것은 다시 부르지 않는다', () => {
  it('기록이 없으면 전부 남는다', () => {
    const { calls } = fixtureCalls();
    expect(remainingCalls(calls, null)).toHaveLength(calls.length);
  });

  it('성공한 customId 는 빠진다', () => {
    const { calls } = fixtureCalls();
    const progress = newProgress();
    progress.entries.push(entryFor(calls[0]), entryFor(calls[3]));

    const remaining = remainingCalls(calls, progress);

    expect(remaining.map((c) => c.customId)).toEqual(
      calls.filter((c) => c !== calls[0] && c !== calls[3]).map((c) => c.customId)
    );
  });

  it('실패한 것은 다시 부른다 — 실패는 결과가 아니다', () => {
    const { calls } = fixtureCalls();
    const progress = newProgress();
    progress.entries.push(entryFor(calls[0]));
    progress.failures.push({ customId: calls[1].customId, type: 'errored', message: '5xx' });

    expect(remainingCalls(calls, progress).map((c) => c.customId)).toContain(calls[1].customId);
  });

  it('30건 중 20건에서 막혔다면 다음 실행은 10건이다', () => {
    const source = 'codedrill';
    const problems = loadSource(source); // 픽스처 4문항
    const calls = buildVariantCalls({ source, problems, variantsPerItem: 5 }); // 20건
    expect(calls).toHaveLength(20);

    const progress = createVariantProgress({ source, model: FREE_MODEL, out: 'x.json' });
    for (const call of calls.slice(0, 13)) progress.entries.push(entryFor(call));

    expect(remainingCalls(calls, progress)).toHaveLength(7);
  });
});

describe('중단 → 다음 날 이어하기 (30건 중 20건에서 한도에 걸렸을 때)', () => {
  /** 실제 분류기가 "하루 한도" 로 읽는 429 */
  const dailyLimitError = () =>
    new OpenRouterError(
      classifyStatus({
        status: 429,
        bodyText: JSON.stringify({ error: { message: 'Rate limit exceeded: free-models-per-day' } }),
        headers: new Headers(),
        model: FREE_MODEL,
      })
    );

  const answerFor = (call) => ({
    data: { question: `${call.customId} 지문`, answer: `${call.customId} 정답` },
    text: '',
    usage: { model: FREE_MODEL, inputTokens: 100, outputTokens: 200 },
  });

  /** customId 로 응답을 고르는 프로바이더 */
  function providerFor(calls, responder) {
    const byPrompt = new Map(calls.map((call) => [call.messages[0].content, call]));
    return {
      name: 'openrouter',
      model: FREE_MODEL,
      hasKey: () => true,
      classifyError: (error) =>
        error instanceof OpenRouterError
          ? error.failure
          : { code: 'UPSTREAM', message: String(error), retryable: false },
      completeJson: async (args) => responder(byPrompt.get(args.messages[0].content)),
    };
  }

  const noWaitLimiter = () =>
    createRateLimiter({ limit: 1_000, windowMs: 1, now: () => 0, sleep: async () => {} });

  it('첫날 20건까지 만들고 멈춘 뒤, 다음 날 남은 10건만 나간다', async () => {
    const source = 'quiz100';
    const problems = loadSource(source); // 픽스처 3문항
    const calls = buildVariantCalls({ source, problems, variantsPerItem: 10 });
    expect(calls).toHaveLength(30);

    const done = new Set();

    // ── 첫날: 20건째부터 하루 한도 ──────────────────────────────────────────
    const progress = createVariantProgress({ source, model: FREE_MODEL, out: 'out.json' });
    const day1 = await runVariantCalls({
      calls,
      provider: providerFor(calls, (call) => {
        if (done.size >= 20) throw dailyLimitError();
        done.add(call.customId);
        return answerFor(call);
      }),
      originals: problems,
      concurrency: 1,
      limiter: noWaitLimiter(),
      onEntry: (entry) => {
        progress.entries.push(entry);
        saveVariantProgress(progress, { dir }); // 한 건마다 굳힌다
      },
    });

    expect(day1.entries).toHaveLength(20);
    expect(day1.stopped).toMatchObject({ reason: 'daily-quota', remaining: 10 });

    // ── 프로세스가 죽었다 치고, 파일에서만 되읽는다 ────────────────────────
    const reloaded = loadVariantProgress({ source, model: FREE_MODEL, dir });
    expect(reloaded.entries).toHaveLength(20);

    const left = remainingCalls(calls, reloaded);
    expect(left).toHaveLength(10);
    expect(left.map((call) => call.customId)).toEqual(
      calls.slice(20).map((call) => call.customId)
    );

    // ── 다음 날: 남은 10건만 부른다 ────────────────────────────────────────
    let called = 0;
    const day2 = await runVariantCalls({
      calls: left,
      provider: providerFor(left, (call) => {
        called += 1;
        return answerFor(call);
      }),
      originals: problems,
      concurrency: 1,
      limiter: noWaitLimiter(),
      onEntry: (entry) => {
        reloaded.entries.push(entry);
        saveVariantProgress(reloaded, { dir });
      },
    });

    expect(called).toBe(10); // 이미 만든 20건은 **다시 부르지 않았다**
    expect(day2.stopped).toBeNull();
    expect(reloaded.entries).toHaveLength(30);
    expect(remainingCalls(calls, reloaded)).toHaveLength(0);

    // ── 이어 붙인 결과가 원본 순서를 지킨다 ────────────────────────────────
    const items = sortVariantEntries(reloaded.entries, problems);
    expect(items).toHaveLength(30);
    expect(new Set(items.map((item) => item.id)).size).toBe(30);
    expect(items.slice(0, 10).every((item) => item.variantOf === problems[0].id)).toBe(true);
    expect(items[0].id).toBe(`${problems[0].id}-v1`);
    expect(items[29].id).toBe(`${problems[2].id}-v10`);
  });
});

describe('sortVariantEntries — 이어 붙여도 파일 순서는 원본 순서다', () => {
  it('나중에 만든 항목이 원래 자리에 들어간다', () => {
    const source = 'quiz100';
    const problems = loadSource(source);
    const calls = buildVariantCalls({ source, problems, variantsPerItem: 2 });

    // 어제 만든 것(1번 문항 변형 2개) + 오늘 만든 것(0번·2번)을 섞어서 넣는다
    const entries = [
      entryFor(calls[2]),
      entryFor(calls[3]),
      entryFor(calls[4]),
      entryFor(calls[0]),
      entryFor(calls[1]),
      entryFor(calls[5]),
    ];

    const items = sortVariantEntries(entries, problems);

    expect(items.map((item) => item.id)).toEqual([
      `${problems[0].id}-v1`,
      `${problems[0].id}-v2`,
      `${problems[1].id}-v1`,
      `${problems[1].id}-v2`,
      `${problems[2].id}-v1`,
      `${problems[2].id}-v2`,
    ]);
  });

  it('원본에 없는 항목은 뒤로 밀되 버리지 않는다', () => {
    const problems = loadSource('quiz100');
    const calls = buildVariantCalls({ source: 'quiz100', problems, variantsPerItem: 1 });
    const orphan = {
      customId: 'quiz100__없는id__v1',
      item: { id: '없는id-v1', variantOf: '없는id', generated: true },
    };

    const items = sortVariantEntries([orphan, entryFor(calls[0])], problems);

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(`${problems[0].id}-v1`);
    expect(items[1].id).toBe('없는id-v1');
  });

  it('저장 파일이 JSON 으로 읽을 수 있는 모양이다', () => {
    const progress = newProgress();
    const path = saveVariantProgress(progress, { dir });
    expect(() => JSON.parse(readFileSync(path, 'utf8'))).not.toThrow();
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true);
  });
});
