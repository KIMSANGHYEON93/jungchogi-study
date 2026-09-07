// 프로바이더 계약 모양의 **변형 호출 조립** — 무료 경로(OpenRouter)가 쓰는 입력.
//
// Batch 경로는 `buildVariantRequests` 가 `{custom_id, params}` 를 만든다 (Anthropic
// 전용 모양이다 — `output_config`·`cache_control` 이 들어간다). 무료 경로는 SDK 가
// 아니라 `provider.completeJson({system, messages, schema, ...})` 을 부르므로
// 모양이 다르다.
//
// **다르면 안 되는 것은 내용이다.** 프롬프트·스키마·custom_id 가 두 경로에서
// 같아야 한 경로에서 검증한 프롬프트가 다른 경로에서도 같은 문항을 낸다.

import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { loadSource, clearContentCache } from '../lib/ai/content.js';
import {
  buildVariantCalls,
  buildVariantPrompt,
  buildVariantRequests,
  buildVariantSystem,
  buildVariantSystemBlocks,
  formatCustomId,
  missingVariantFields,
  variantSchema,
  VARIANT_EFFORT,
  VARIANT_MAX_TOKENS,
} from '../lib/ai/variants.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/ai-data', import.meta.url));

beforeEach(() => {
  vi.stubEnv('JUNGCHOGI_DATA_DIR', FIXTURE_DIR);
  clearContentCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearContentCache();
});

const firstThree = (source) => loadSource(source).slice(0, 3);

describe('buildVariantSystemBlocks — 프로바이더 계약 모양의 system', () => {
  it('Anthropic 전용 필드를 싣지 않는다', () => {
    const blocks = buildVariantSystemBlocks('quiz100');

    expect(blocks).toHaveLength(1);
    expect(Object.keys(blocks[0]).sort()).toEqual(['cacheable', 'text']);
    expect(blocks[0].cacheable).toBe(true);
  });

  it('본문은 Batch 경로와 글자 그대로 같다', () => {
    for (const source of ['quiz100', 'bogang', 'codedrill']) {
      const blocks = buildVariantSystemBlocks(source);
      const batch = buildVariantSystem(source);
      expect(blocks[0].text).toBe(batch[0].text);
    }
  });

  it('알 수 없는 source 는 던진다', () => {
    expect(() => buildVariantSystemBlocks('nope')).toThrow(/알 수 없는 source/);
  });
});

describe('buildVariantCalls — 문항 N개 × 변형 M개', () => {
  it('호출 수가 N×M 이다', () => {
    const calls = buildVariantCalls({
      source: 'quiz100',
      problems: firstThree('quiz100'),
      variantsPerItem: 2,
    });

    expect(calls).toHaveLength(6);
  });

  it('customId 가 Batch 경로의 custom_id 와 같다', () => {
    const problems = firstThree('quiz100');
    const calls = buildVariantCalls({ source: 'quiz100', problems, variantsPerItem: 2 });
    const requests = buildVariantRequests({ source: 'quiz100', problems, variantsPerItem: 2 });

    expect(calls.map((call) => call.customId)).toEqual(requests.map((r) => r.custom_id));
    expect(calls[0].customId).toBe(
      formatCustomId({ source: 'quiz100', id: problems[0].id, variant: 1 })
    );
  });

  it('프롬프트가 Batch 경로와 글자 그대로 같다', () => {
    const problems = firstThree('codedrill');
    const calls = buildVariantCalls({ source: 'codedrill', problems, variantsPerItem: 2 });
    const requests = buildVariantRequests({ source: 'codedrill', problems, variantsPerItem: 2 });

    for (const [index, call] of calls.entries()) {
      expect(call.messages).toEqual([
        { role: 'user', content: requests[index].params.messages[0].content },
      ]);
    }
    expect(calls[0].messages[0].content).toBe(
      buildVariantPrompt({ source: 'codedrill', problem: problems[0], variant: 1, total: 2 })
    );
  });

  it('스키마·상한·effort 가 Batch 경로와 같다', () => {
    const calls = buildVariantCalls({
      source: 'bogang',
      problems: firstThree('bogang'),
      variantsPerItem: 1,
    });

    expect(calls[0].schema).toEqual(variantSchema('bogang'));
    expect(calls[0].maxTokens).toBe(VARIANT_MAX_TOKENS);
    expect(calls[0].effort).toBe(VARIANT_EFFORT);
  });

  it('스키마 이름은 프로바이더가 헤더에 실을 수 있게 ASCII 다', () => {
    const calls = buildVariantCalls({
      source: 'quiz100',
      problems: firstThree('quiz100'),
      variantsPerItem: 1,
    });

    expect(calls[0].schemaName).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('되맞추기에 필요한 원본 정보를 함께 들고 있다', () => {
    const problems = firstThree('quiz100');
    const calls = buildVariantCalls({ source: 'quiz100', problems, variantsPerItem: 2 });

    expect(calls[0]).toMatchObject({ source: 'quiz100', id: problems[0].id, variant: 1 });
    expect(calls[1]).toMatchObject({ source: 'quiz100', id: problems[0].id, variant: 2 });
    expect(calls[2]).toMatchObject({ source: 'quiz100', id: problems[1].id, variant: 1 });
  });

  it('변형 수가 1 이상의 정수가 아니면 던진다', () => {
    const problems = firstThree('quiz100');
    expect(() => buildVariantCalls({ source: 'quiz100', problems, variantsPerItem: 0 })).toThrow(
      /variantsPerItem/
    );
    expect(() => buildVariantCalls({ source: 'quiz100', problems, variantsPerItem: 1.5 })).toThrow(
      /variantsPerItem/
    );
  });

  it('알 수 없는 source 는 던진다', () => {
    expect(() => buildVariantCalls({ source: 'nope', problems: [] })).toThrow(/알 수 없는 source/);
  });
});

describe('missingVariantFields — 두 경로가 같은 규칙으로 판정한다', () => {
  it('필수 필드가 다 차 있으면 빈 배열', () => {
    expect(missingVariantFields('quiz100', { question: '지문', answer: '정답' })).toEqual([]);
  });

  it('빈 문자열·공백은 비어 있는 것으로 본다', () => {
    expect(missingVariantFields('quiz100', { question: '   ', answer: '정답' })).toEqual([
      'question',
    ]);
  });

  it('드릴의 context·expectedOutput·pitfall 은 비어도 된다 (원본에도 빈 문항이 있다)', () => {
    const output = {
      title: '제목',
      context: '',
      code: 'int a = 1;',
      answer: '풀이',
      expectedOutput: '',
      pitfall: '',
    };
    expect(missingVariantFields('codedrill', output)).toEqual([]);
  });

  it('출력이 없으면 필수 필드를 모두 비어 있다고 본다', () => {
    expect(missingVariantFields('quiz100', null)).toEqual(['question', 'answer']);
  });

  it('알 수 없는 source 는 던진다', () => {
    expect(() => missingVariantFields('nope', {})).toThrow(/알 수 없는 source/);
  });
});
