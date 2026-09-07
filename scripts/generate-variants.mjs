#!/usr/bin/env node
// 변형 문제 생성기 (블루프린트 §4.4 · §5 Phase 4).
//
// **엔드포인트가 아니라 스크립트다.** 블루프린트 §4.4 의 정정 사유:
//   · Vercel 서버리스는 파일시스템이 읽기 전용이라 `public/data/` 에 쓸 수 없다.
//   · 결과물은 런타임 생성이 아니라 **리포에 커밋되는 파일**이다.
//   · Batch 는 완료까지 최대 24시간 걸려 함수 실행 시간 안에 끝나지 않는다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 경로가 둘이다 — 어느 쪽인지는 `lib/ai/provider.js` 가 정한다
// ─────────────────────────────────────────────────────────────────────────────
//   anthropic  : Batch API. 요청을 한 번에 올리고 최대 24시간 기다린다.
//                **토큰 50% 할인**이 실제 이득이라 유지한다. `--resume <batch_id>`.
//   openrouter : **Batch API 가 없다.** `completeJson` 을 제한 병렬로 반복 호출한다.
//                분당 20회 스로틀이 필수고(넘기면 429 가 줄줄이 난다), 무입금 계정
//                하루 50회가 진짜 벽이다. 재개는 batch id 가 아니라 **진행 기록 파일**로 한다 —
//                같은 명령을 다시 돌리면 남은 것만 나간다.
//
// 사용법:
//   node scripts/generate-variants.mjs --source quiz100 --ids 001,002,042
//   node scripts/generate-variants.mjs --source codedrill --category sql --variants 3
//   node scripts/generate-variants.mjs --source bogang --all --yes
//   node scripts/generate-variants.mjs --resume msgbatch_01ABC...     # anthropic 전용
//
// 옵션 (두 경로 공통):
//   --source <quiz100|codedrill|bogang>   필수 (--resume 이면 기록에서 읽는다)
//   --ids <id,id,...>                     문항 선택. --all / --category 와 택일
//   --all                                 source 전체
//   --category <이름>                     카테고리(드릴은 언어)로 선택
//   --variants <n>                        문항당 변형 수 (기본 2)
//   --out <path>                          기본 public/data/generated/<source>.json
//   --yes                                 실행 전 확인 프롬프트를 건너뛴다
//   --record-dir <path>                   기록 위치 (기본 claudedocs/generated-batches)
//
// anthropic 전용:
//   --resume <batch_id>                   이미 만든 배치의 결과만 수거한다
//   --timeout-hours <n>                   폴링 대기 상한 (기본 24 — Batch 만료와 같다)
//
// openrouter 전용:
//   --concurrency <n>                     동시 호출 수 (기본 3). 분당 한도가 실질 상한이다
//   --free-daily-limit <n>                하루 한도 (기본 50 — 누적 $10 결제 이력이 있으면 1000)
//   --fresh                               진행 기록을 버리고 처음부터 다시 만든다
//
// ⚠️ **실제 API 를 호출한다.** 그래서 `npm test` 에 넣지 않는다 — 키 없이 실패하면
//    CI 가 깨진다. 계약 검증만 하려면 `scripts/validate-generated.mjs`.
//    유료 경로는 돈이 들고, 무료 경로는 돈 대신 **하루 호출 수**를 쓴다.
//
// 생성물은 항상 `reviewed: false` 로 나온다. 사람 검수를 통과해야 손으로 true 로 올리며,
// 그 전까지 앱은 이 파일을 쓰지 않는다. 검수 절차: `claudedocs/GENERATED_REVIEW.md`

import { relative } from 'node:path';
import { createInterface } from 'node:readline/promises';

import {
  DEFAULT_VARIANTS,
  PRICE_INPUT_PER_MTOK,
  PRICE_OUTPUT_PER_MTOK,
  BATCH_DISCOUNT,
  VARIANT_SOURCES,
  selectProblems,
  buildVariantCalls,
  buildVariantRequests,
  estimateFreeQuota,
  estimateVariantCost,
  collectVariantResults,
  sortVariantEntries,
} from '../lib/ai/variants.js';
import { loadSource } from '../lib/ai/content.js';
import {
  buildGeneratedDoc,
  saveGeneratedDoc,
  generatedPath,
  validateGeneratedDoc,
} from '../lib/ai/generated.js';
import {
  DEFAULT_CONCURRENCY,
  createVariantBatch,
  createVariantProgress,
  clearVariantProgress,
  loadVariantProgress,
  remainingCalls,
  runVariantCalls,
  saveVariantProgress,
  variantProgressPath,
  waitForBatchEnd,
  streamBatchResults,
  saveBatchRecord,
  loadBatchRecord,
} from '../lib/ai/batchRunner.js';
import { getProvider } from '../lib/ai/provider.js';
import { OPENROUTER_FREE_LIMITS } from '../lib/ai/usage.js';

const HOUR_MS = 60 * 60 * 1_000;

function parseArgs(argv) {
  const args = {
    source: null,
    ids: null,
    all: false,
    category: null,
    variants: DEFAULT_VARIANTS,
    out: null,
    yes: false,
    resume: null,
    recordDir: null,
    timeoutHours: 24,
    concurrency: DEFAULT_CONCURRENCY,
    freeDailyLimit: OPENROUTER_FREE_LIMITS.requestsPerDay,
    fresh: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--source') args.source = value;
    else if (flag === '--ids') args.ids = value?.split(',').map((s) => s.trim()).filter(Boolean);
    else if (flag === '--all') args.all = true;
    else if (flag === '--category') args.category = value;
    else if (flag === '--variants') args.variants = Number(value);
    else if (flag === '--out') args.out = value;
    else if (flag === '--yes' || flag === '-y') args.yes = true;
    else if (flag === '--resume') args.resume = value;
    else if (flag === '--record-dir') args.recordDir = value;
    else if (flag === '--timeout-hours') args.timeoutHours = Number(value);
    else if (flag === '--concurrency') args.concurrency = Number(value);
    else if (flag === '--free-daily-limit') args.freeDailyLimit = Number(value);
    else if (flag === '--fresh') args.fresh = true;
  }
  return args;
}

/**
 * 프로바이더에 맞는 키가 있는지 본다. **어느 경로로 나가는지도 함께 알린다** —
 * 무료로 돌린다고 생각하고 유료 키를 쓰는 것이 여기서 가장 비싼 실수다.
 */
function requireProviderKey(provider) {
  if (provider.hasKey()) return;

  const guide =
    provider.name === 'openrouter'
      ? [
          'OPENROUTER_API_KEY 가 설정되지 않았습니다. 이 생성기는 실제 OpenRouter API 를 호출합니다.',
          '',
          '  PowerShell : $env:OPENROUTER_API_KEY = "sk-or-v1-..."; node scripts/generate-variants.mjs --source quiz100 --ids 001',
          '  bash       : OPENROUTER_API_KEY=sk-or-v1-... node scripts/generate-variants.mjs --source quiz100 --ids 001',
          '',
          '키 발급: https://openrouter.ai/ → Keys',
        ]
      : [
          'ANTHROPIC_API_KEY 가 설정되지 않았습니다. 이 생성기는 실제 Anthropic Batch API 를 호출합니다.',
          '',
          '  PowerShell : $env:ANTHROPIC_API_KEY = "sk-ant-..."; node scripts/generate-variants.mjs --source quiz100 --ids 001',
          '  bash       : ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-variants.mjs --source quiz100 --ids 001',
          '',
          '키 발급: https://console.anthropic.com/ → API Keys',
        ];

  console.error(
    [
      '',
      `프로바이더: ${provider.name} (AI_PROVIDER 로 바꿉니다)`,
      '',
      ...guide,
      '',
      '(자동 테스트 `npm test` 는 프로바이더를 모킹하므로 키가 필요 없습니다.',
      ' 이미 만든 생성물의 계약 검증만 하려면 `node scripts/validate-generated.mjs` — 키가 필요 없습니다.)',
      '',
    ].join('\n')
  );
  process.exit(1);
}

const usd = (n) => `$${n.toFixed(4)}`;

/** 실행 전에 자릿수를 알려주고, `--yes` 가 없으면 사람에게 묻는다. */
async function confirmCost({ source, problems, variants, requests, out, yes }) {
  const estimate = estimateVariantCost(requests);

  console.log('');
  console.log('─'.repeat(78));
  console.log(`source          : ${source}`);
  console.log(`문항            : ${problems.length}개`);
  console.log(`변형            : 문항당 ${variants}개`);
  console.log(`요청            : ${estimate.requestCount}건`);
  console.log(
    `추정 토큰       : 입력 ${estimate.inputTokens.toLocaleString()} · ` +
      `출력 ${estimate.outputTokens.toLocaleString()} (thinking 포함)`
  );
  console.log(
    `추정 비용       : 약 ${usd(estimate.usd)} ` +
      `(Opus 5 정가 $${PRICE_INPUT_PER_MTOK}/$${PRICE_OUTPUT_PER_MTOK} per MTok, ` +
      `Batch ${BATCH_DISCOUNT * 100}% 할인 반영)`
  );
  console.log(`저장 위치       : ${out}`);
  console.log('─'.repeat(78));
  console.log(
    '토큰 수는 글자 수에서 어림한 값이라 ±50% 는 어긋날 수 있습니다. ' +
      '실제 사용량은 배치가 끝난 뒤 찍힙니다.'
  );

  if (yes) return;

  if (!process.stdin.isTTY) {
    console.error('\n대화형 터미널이 아닙니다. 비용을 확인했다면 --yes 를 붙여 다시 실행하세요.');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\n이대로 배치를 만들까요? [y/N] ');
  rl.close();

  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('취소했습니다. 아무것도 보내지 않았습니다.');
    process.exit(0);
  }
}

/** 폴링 진행 상황 한 줄 */
function reportPoll(batch, startedAt) {
  const counts = batch.request_counts;
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[${String(elapsed).padStart(5)}s] ${batch.processing_status.padEnd(12)} ` +
      `처리중 ${counts.processing} · 성공 ${counts.succeeded} · 오류 ${counts.errored} · ` +
      `만료 ${counts.expired} · 취소 ${counts.canceled}`
  );
}

function reportFailures(failures) {
  if (failures.length === 0) {
    console.log('\n실패한 요청은 없습니다.');
    return;
  }

  const byType = new Map();
  for (const failure of failures) {
    byType.set(failure.type, [...(byType.get(failure.type) ?? []), failure]);
  }

  console.log(`\n실패 ${failures.length}건`);
  for (const [type, rows] of [...byType.entries()].sort()) {
    console.log(`  ${type.padEnd(10)} ${rows.length}건 — ${rows.map((r) => r.customId).join(', ')}`);
    console.log(`             ${rows[0].message}`);
  }
  console.log(
    '\n  expired 는 다시 제출해야 하고, errored 는 같은 문항으로 다시 돌리면 됩니다.\n' +
      '  invalid/truncated 는 프롬프트나 max_tokens 를 손볼 자리입니다.'
  );
}

function reportUsage(usage) {
  const actual =
    ((usage.inputTokens * PRICE_INPUT_PER_MTOK + usage.outputTokens * PRICE_OUTPUT_PER_MTOK) /
      1_000_000) *
    BATCH_DISCOUNT;

  console.log(
    `\n실제 사용량: 입력 ${usage.inputTokens.toLocaleString()} · ` +
      `출력 ${usage.outputTokens.toLocaleString()} · ` +
      `캐시 읽기 ${usage.cacheReadInputTokens.toLocaleString()} → 약 ${usd(actual)}`
  );
  if (usage.cacheReadInputTokens === 0) {
    console.log(
      '  ⚠️ 캐시 읽기가 0 입니다. 같은 시스템 프리픽스를 쓰는 요청이 여러 건인데도 ' +
        '적중하지 않았다면 프리픽스에 가변 요소가 섞인 것입니다.'
    );
  }
}

/** 배치 결과를 수거해 파일로 굳힌다 (신규 실행과 --resume 이 공유하는 경로). */
async function collectAndSave({ batchId, source, out, startedAt, timeoutHours }) {
  console.log(`\n배치 ${batchId} 가 끝나기를 기다립니다. 최대 24시간까지 걸릴 수 있습니다.`);
  console.log(`중간에 끊기면 --resume ${batchId} 로 결과만 다시 수거할 수 있습니다.\n`);

  await waitForBatchEnd(batchId, {
    onPoll: (batch) => reportPoll(batch, startedAt),
    timeoutMs: timeoutHours * HOUR_MS,
  });

  const results = await streamBatchResults(batchId);
  const { items, failures, usage } = await collectVariantResults({
    results,
    source,
    originals: loadSource(source),
  });

  reportFailures(failures);
  reportUsage(usage);

  saveAndValidate({ source, items, out });
}

/**
 * 생성물을 파일로 굳히고 계약을 검증한다 (두 경로가 공유하는 마지막 단계).
 *
 * `model` 은 **실제로 부른 모델**이어야 한다 — 검수자가 무엇이 만든 문항인지
 * 알아야 하고, `nemotron` 이 만든 문항이 `claude-opus-5` 로 적히면 그 판단을 할 수 없다.
 * @param {{source: string, items: Array<object>, out: string, model?: string}} args
 */
function saveAndValidate({ source, items, out, model }) {
  if (items.length === 0) {
    console.error('\n저장할 항목이 없습니다. 파일을 건드리지 않았습니다.');
    process.exit(1);
  }

  const doc = buildGeneratedDoc(model ? { source, items, model } : { source, items });
  const validation = validateGeneratedDoc(doc, { originals: loadSource(source) });

  const path = saveGeneratedDoc(doc, { path: out });
  console.log(`\n생성 문항 ${items.length}건을 ${relative(process.cwd(), path)} 에 저장했습니다.`);

  if (!validation.ok) {
    console.error(`\n⚠️ 계약 위반 ${validation.issues.length}건 — 검수 전에 먼저 고쳐야 합니다.`);
    for (const issue of validation.issues.slice(0, 20)) {
      console.error(`  ${issue.path}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(
    '\n계약 검증 통과. 이 파일은 `reviewed: false` 입니다 — 앱은 아직 쓰지 않습니다.\n' +
      '사람 검수 절차는 claudedocs/GENERATED_REVIEW.md 를 보세요.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 무료 경로 (openrouter) — Batch 가 없다
// ─────────────────────────────────────────────────────────────────────────────

const pct = (n) => `${n.toFixed(1)}%`;

/**
 * 실행 전에 **호출 수와 한도 소진율**을 알린다.
 *
 * 무료 모델에서 달러 추정은 의미가 없다(토큰 요금이 0 이다). 제약은 호출 수다 —
 * 여기서 이 숫자를 보여 주지 않으면 사용자는 왜 중간에 막혔는지 알 수 없다.
 * 한도를 넘길 것 같으면 `--yes` 없이는 진행하지 않는다.
 */
async function confirmFreeQuota({ provider, source, problems, variants, calls, remaining, quota, out, progressPath, concurrency, yes }) {
  const skipped = calls.length - remaining.length;

  console.log('');
  console.log('─'.repeat(78));
  console.log(`프로바이더      : ${provider.name} (${provider.model})`);
  console.log(`source          : ${source}`);
  console.log(`문항            : ${problems.length}개`);
  console.log(`변형            : 문항당 ${variants}개`);
  console.log(
    `호출            : ${quota.requestCount}건` +
      (skipped > 0 ? `  (이미 만든 ${skipped}건은 건너뜁니다)` : '')
  );
  console.log(
    `일일 한도       : ${quota.requestCount}/${quota.dailyLimit}건 = ${pct(quota.sharePercent)} 소진`
  );
  console.log(
    `분당 한도       : ${quota.perMinuteLimit}건/분 → 최소 ${quota.minMinutes}분` +
      ` (동시 ${concurrency}건으로 나갑니다)`
  );
  console.log('비용            : $0 — 무료 모델입니다. 제약은 돈이 아니라 호출 수입니다.');
  console.log(`저장 위치       : ${out}`);
  console.log(`진행 기록       : ${relative(process.cwd(), progressPath)}`);
  console.log('─'.repeat(78));

  if (quota.exceedsDaily) {
    console.log(
      `\n⚠️ 하루 한도(${quota.dailyLimit}건)를 ${quota.overflow}건 넘깁니다.\n` +
        '   넘어가는 순간부터 429 가 나고, **429 도 한도를 깎습니다.**\n' +
        '   한도에 걸리면 거기서 멈추고, 만든 것까지는 진행 기록에 남습니다 —\n' +
        '   내일 같은 명령을 다시 돌리면 남은 것만 나갑니다.'
    );
  }

  if (yes) return;

  if (!process.stdin.isTTY) {
    console.error('\n대화형 터미널이 아닙니다. 위 소진율을 확인했다면 --yes 를 붙여 다시 실행하세요.');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\n이대로 호출을 시작할까요? [y/N] ');
  rl.close();

  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('취소했습니다. 아무것도 보내지 않았습니다.');
    process.exit(0);
  }
}

/** 무료 경로의 사용량 — 달러가 아니라 호출 수·한도 소진율로 적는다. */
function reportFreeUsage(usage, quota) {
  console.log(
    `\n실제 호출: ${usage.calls}건 (실패·재시도 포함 — 429 도 한도를 깎습니다) → ` +
      `하루 한도 ${quota.dailyLimit}건의 ${pct((usage.calls / quota.dailyLimit) * 100)}`
  );
  console.log(
    `  토큰: 입력 ${usage.inputTokens.toLocaleString()} · 출력 ${usage.outputTokens.toLocaleString()}` +
      (usage.unknownUsage > 0 ? `  (${usage.unknownUsage}건은 사용량을 알 수 없었습니다)` : '') +
      `  — 요금은 $0 입니다 (${usage.model})`
  );
}

/**
 * OpenRouter 경로. Batch 가 없으니 `completeJson` 을 제한 병렬로 반복 호출한다.
 *
 * 재개는 batch id 가 아니라 **진행 기록 파일**로 한다 — 성공한 문항을 그때그때
 * 파일에 쌓아, 하루 한도에 걸려 멈춰도 다음 날 같은 명령으로 남은 것만 돌린다.
 */
async function runFreePath(args, provider) {
  if (args.resume) {
    console.error(
      `${provider.name} 에는 Batch API 가 없어 --resume <batch_id> 를 쓸 수 없습니다.\n` +
        '이어서 하려면 **같은 명령을 그대로 다시** 돌리세요 — 진행 기록을 읽어 남은 것만 나갑니다.\n' +
        '처음부터 다시 만들려면 --fresh 를 붙입니다.'
    );
    process.exit(1);
  }

  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    console.error(`--concurrency 는 1 이상의 정수여야 합니다: ${args.concurrency}`);
    process.exit(1);
  }

  const source = args.source;
  const problems = selectForRun(args);
  const calls = buildVariantCalls({ source, problems, variantsPerItem: args.variants });
  const out = args.out ?? generatedPath(source);
  const dir = args.recordDir ?? undefined;
  const progressPath = variantProgressPath(source, dir ?? undefined);

  if (args.fresh) clearVariantProgress({ source, dir });

  let progress = loadVariantProgress({ source, model: provider.model, dir });
  if (progress) {
    console.log(
      `\n진행 기록을 찾았습니다 (${relative(process.cwd(), progressPath)}) — ` +
        `이미 만든 ${progress.entries.length}건은 건너뜁니다.\n` +
        '  처음부터 다시 만들려면 --fresh 를 붙이세요.'
    );
  }

  const remaining = remainingCalls(calls, progress);
  const quota = estimateFreeQuota({
    requestCount: remaining.length,
    dailyLimit: args.freeDailyLimit,
  });

  if (remaining.length === 0) {
    console.log('\n남은 호출이 없습니다. 기록에 있는 결과로 파일만 다시 씁니다.');
    saveAndValidate({
      source,
      items: sortVariantEntries(progress.entries, loadSource(source)),
      out,
      model: progress.model,
    });
    clearVariantProgress({ source, dir });
    return;
  }

  await confirmFreeQuota({
    provider,
    source,
    problems,
    variants: args.variants,
    calls,
    remaining,
    quota,
    out,
    progressPath,
    concurrency: args.concurrency,
    yes: args.yes,
  });

  progress ??= createVariantProgress({ source, model: provider.model, out });

  console.log(`\n호출 ${remaining.length}건을 시작합니다 (동시 ${args.concurrency}건, 분당 ${quota.perMinuteLimit}건 스로틀).`);
  console.log('중간에 끊겨도 만든 문항은 진행 기록에 남습니다 — 같은 명령을 다시 돌리면 이어집니다.\n');

  let done = 0;
  const { failures, usage, stopped } = await runVariantCalls({
    calls: remaining,
    provider,
    originals: problems,
    concurrency: args.concurrency,
    onEntry: (entry) => {
      progress.entries.push(entry);
      // 한 건 만들 때마다 굳힌다 — 여기서 죽어도 이미 만든 문항을 잃지 않는다.
      saveVariantProgress(progress, { dir });
      done += 1;
      console.log(`[${String(done).padStart(3)}/${remaining.length}] ${entry.customId}`);
    },
    onFailure: (failure) => {
      console.log(`[  실패 ] ${failure.customId} — ${failure.type}: ${failure.message}`);
    },
  });

  progress.failures = failures;
  saveVariantProgress(progress, { dir });

  reportFailures(failures);
  reportFreeUsage(usage, quota);

  const left = remainingCalls(calls, progress).length;

  saveAndValidate({
    source,
    items: sortVariantEntries(progress.entries, loadSource(source)),
    out,
    model: provider.model,
  });

  if (left === 0) {
    clearVariantProgress({ source, dir });
    console.log('\n요청한 변형을 모두 만들었습니다. 진행 기록을 지웠습니다.');
    return;
  }

  console.log(
    `\n남은 호출 ${left}건. 진행 기록: ${relative(process.cwd(), progressPath)}\n` +
      '  같은 명령을 다시 돌리면 남은 것만 나갑니다.'
  );

  if (stopped) {
    console.error(
      `\n⚠️ ${stopped.message}\n` +
        `   ${stopped.reason === 'daily-quota' ? '하루 한도' : '한도'}에 걸려 남은 ${stopped.remaining}건을 보내지 않았습니다.\n` +
        '   한도가 리셋된 뒤 같은 명령을 다시 돌리세요.'
    );
    process.exit(1);
  }
}

/** 어느 문항을 몇 개 만들지 — 두 경로가 같은 규칙으로 고른다. */
function selectForRun(args) {
  if (!VARIANT_SOURCES.includes(args.source)) {
    console.error(
      `--source 가 필요합니다 (${VARIANT_SOURCES.join('|')}). 받은 값: ${args.source}`
    );
    process.exit(1);
  }

  if (!args.all && !args.ids && !args.category) {
    console.error(
      '문항을 골라야 합니다: --ids <id,id,...> 또는 --category <이름> 또는 --all.\n' +
        'source 전체를 돌리면 비용(무료 경로에서는 하루 한도)이 큽니다 — --all 은 의도적으로 명시해야 합니다.'
    );
    process.exit(1);
  }

  return selectProblems({ source: args.source, ids: args.ids, category: args.category });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = getProvider();
  requireProviderKey(provider);

  if (provider.name === 'openrouter') {
    await runFreePath(args, provider);
    return;
  }

  const startedAt = Date.now();

  if (args.resume) {
    const record = loadBatchRecord(args.resume, { dir: args.recordDir ?? undefined });
    if (!record) {
      console.error(
        `배치 기록을 찾지 못했습니다: ${args.resume}\n` +
          '--source 와 --out 을 직접 주면 기록 없이도 수거할 수 있습니다.'
      );
      if (!args.source) process.exit(1);
    }

    const source = args.source ?? record.source;
    const out = args.out ?? record?.out ?? generatedPath(source);
    await collectAndSave({
      batchId: args.resume,
      source,
      out,
      startedAt,
      timeoutHours: args.timeoutHours,
    });
    return;
  }

  const problems = selectForRun(args);
  const requests = buildVariantRequests({
    source: args.source,
    problems,
    variantsPerItem: args.variants,
  });
  const out = args.out ?? generatedPath(args.source);

  await confirmCost({
    source: args.source,
    problems,
    variants: args.variants,
    requests,
    out,
    yes: args.yes,
  });

  const batch = await createVariantBatch(requests);

  // 배치를 만든 **직후** 기록을 남긴다 — 여기서 프로세스가 죽어도 batch id 를 잃지 않는다.
  const recordPath = saveBatchRecord(
    {
      batchId: batch.id,
      source: args.source,
      ids: problems.map((problem) => problem.id),
      variantsPerItem: args.variants,
      out,
      createdAt: new Date().toISOString(),
    },
    { dir: args.recordDir ?? undefined }
  );
  console.log(`\n배치 ${batch.id} 를 만들었습니다. 기록: ${relative(process.cwd(), recordPath)}`);

  await collectAndSave({
    batchId: batch.id,
    source: args.source,
    out,
    startedAt,
    timeoutHours: args.timeoutHours,
  });
}

main().catch((error) => {
  console.error('\n변형 생성이 실패했습니다:', error.message ?? error);
  if (error.code) console.error(`  분류: ${error.code} (retryable: ${error.retryable})`);
  process.exit(1);
});
