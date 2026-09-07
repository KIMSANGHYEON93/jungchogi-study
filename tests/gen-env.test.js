// `.env.example` 회귀 가드.
//
// 이 파일은 **키를 담지 않는 문서**다. 두 가지가 조용히 깨질 수 있어 테스트로 붙잡는다:
//
//   1. **실제 키가 섞여 들어오는 것.** `.env.local` 을 편집하다가 여기에 붙여 넣고
//      커밋하면 공개 리포에 키가 남는다. 되돌려도 히스토리에는 남는다.
//   2. **문서가 코드와 어긋나는 것.** 무료 경로의 한도(분당 20 · 하루 50)는
//      `lib/ai/usage.js` 의 상수이자 두 스크립트의 실제 동작이다. 문서만 옛 숫자를
//      들고 있으면 "왜 30건에서 막히지" 를 아무도 설명하지 못한다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { OPENROUTER_FREE_LIMITS } from '../lib/ai/usage.js';
import { estimateFreeQuota } from '../lib/ai/variants.js';
import { PROVIDER_NAMES } from '../lib/ai/provider.js';
import { DEFAULT_OPENROUTER_MODEL } from '../lib/ai/providers/openrouter.js';

const TEXT = readFileSync(fileURLToPath(new URL('../.env.example', import.meta.url)), 'utf8');

/** `KEY=value` 로 선언된 값 (주석 처리된 줄은 제외) */
function assignments(text) {
  const found = new Map();
  for (const line of text.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) found.set(match[1], match[2]);
  }
  return found;
}

const ASSIGNED = assignments(TEXT);

describe('.env.example — 무료 경로 환경변수 5개', () => {
  it.each([
    ['AI_PROVIDER', '어느 업스트림으로 나갈지'],
    ['OPENROUTER_API_KEY', 'OpenRouter 키'],
    ['OPENROUTER_MODEL', '쓸 모델 id'],
    ['OPENROUTER_SITE_URL', 'HTTP-Referer 헤더'],
    ['OPENROUTER_APP_NAME', 'X-Title 헤더'],
  ])('%s 가 설명과 함께 선언돼 있다 (%s)', (name) => {
    expect(ASSIGNED.has(name)).toBe(true);

    // 선언만 있고 설명이 없으면 무엇인지 알 수 없다 — 주석에서 이름이 언급돼야 한다.
    const explained = TEXT.split('\n').filter(
      (line) => line.trimStart().startsWith('#') && line.includes(name)
    );
    expect(explained.length, `${name} 을 설명하는 주석이 없습니다`).toBeGreaterThan(0);
  });

  it('AI_PROVIDER 미설정 시의 자동 선택 규칙을 적어 뒀다', () => {
    expect(TEXT).toMatch(/AI_PROVIDER[\s\S]{0,400}비워 두면/);
    // 규칙 자체: 키가 있으면 openrouter, 없으면 anthropic
    expect(TEXT).toMatch(/OPENROUTER_API_KEY[^\n]*있으면[\s\S]{0,60}openrouter/);
    expect(TEXT).toMatch(/없으면[\s\S]{0,60}anthropic/);
    for (const name of PROVIDER_NAMES) expect(TEXT).toContain(name);
  });

  it('X-Title 은 ASCII 만 된다는 사실을 적어 뒀다 (한글이면 헤더가 생략된다)', () => {
    expect(TEXT).toMatch(/OPENROUTER_APP_NAME[\s\S]{0,400}ASCII/);
    expect(TEXT).toMatch(/X-Title/);
    expect(TEXT).toMatch(/HTTP-Referer/);
  });

  it('기본 모델 id 를 코드와 같은 값으로 적어 뒀다', () => {
    expect(TEXT).toContain(DEFAULT_OPENROUTER_MODEL);
  });
});

describe('.env.example — 무료 경로의 한도가 코드와 같다', () => {
  it('분당·하루 한도를 상수 그대로 적어 뒀다', () => {
    expect(TEXT).toContain(`분당 ${OPENROUTER_FREE_LIMITS.requestsPerMinute}회`);
    expect(TEXT).toContain(`하루 ${OPENROUTER_FREE_LIMITS.requestsPerDay}회`);
    expect(TEXT).toMatch(
      new RegExp(`${OPENROUTER_FREE_LIMITS.requestsPerDayWithCredits.toLocaleString('en-US')}회`)
    );
  });

  it('평가셋 30건이 하루치의 60% 라는 경고가 있다', () => {
    const quota = estimateFreeQuota({ requestCount: 30 });
    expect(quota.sharePercent).toBeCloseTo(60, 6);

    expect(TEXT).toContain(
      `${quota.requestCount}/${quota.dailyLimit}건 = ${quota.sharePercent.toFixed(1)}% 소진`
    );
    expect(TEXT).toMatch(/평가셋 30건/);
  });

  it('실패한 호출도 한도를 깎는다는 사실을 적어 뒀다', () => {
    expect(TEXT).toMatch(/429 도 한도를 깎/);
  });

  it('변형 생성 전체가 하루에 안 끝난다는 사실을 적어 뒀다', () => {
    // quiz100 --all --variants 2 = 200건
    const quota = estimateFreeQuota({ requestCount: 200 });
    expect(quota.exceedsDaily).toBe(true);
    expect(TEXT).toContain(`하루치 ${quota.sharePercent.toFixed(0)}%`);
  });
});

describe('.env.example — 경로별로 갈라 뒀고 기존 Anthropic 절차가 남아 있다', () => {
  it.each(['경로 A — anthropic', '경로 B — openrouter'])('"%s" 절이 있다', (heading) => {
    expect(TEXT).toContain(heading);
  });

  it.each(['14-A', '14-B', '17-A', '17-B', '18-A', '18-B'])(
    '절차 %s 가 경로별로 갈려 있다',
    (step) => {
      expect(TEXT).toContain(step);
    }
  );

  it('기존 Anthropic 절차를 지우지 않았다', () => {
    for (const kept of [
      'ANTHROPIC_API_KEY',
      '--resume msgbatch_01ABC...',
      'cache_read_input_tokens',
      'Batch 50% 할인',
      'scripts/validate-generated.mjs',
    ]) {
      expect(TEXT).toContain(kept);
    }
  });

  it('openrouter 경로에는 Batch 가 없다는 사실을 명시했다', () => {
    expect(TEXT).toMatch(/Batch API 가 없다/);
    expect(TEXT).toMatch(/--resume 에 해당하는 것이 없다/);
  });
});

describe('.env.example — 비밀값은 자리표시자만', () => {
  /** `sk-…` 로 시작하는 토큰 전부 (점도 포함해 `sk-ant-...` 를 통째로 잡는다) */
  const TOKENS = TEXT.match(/sk-[A-Za-z0-9_.-]{2,}/g) ?? [];

  /** 자리표시자로 인정하는 모양: `sk-<vendor>-...` 또는 `sk-<vendor>-xxxx…` */
  const isPlaceholder = (token) => /^sk-[a-z0-9-]+?-(\.{3}|x{4,})$/i.test(token);

  it('키 자리표시자가 실제로 있다 (탐지기 자체가 죽지 않았는지)', () => {
    expect(TOKENS.length).toBeGreaterThan(0);
  });

  it.each(['sk-ant-', 'sk-or-v1-'])('%s 로 시작하는 토큰이 전부 자리표시자다', (prefix) => {
    const matching = TOKENS.filter((token) => token.startsWith(prefix));
    expect(matching.length).toBeGreaterThan(0);
    for (const token of matching) {
      expect(isPlaceholder(token), `실제 키로 보이는 문자열: ${token}`).toBe(true);
    }
  });

  it('sk- 로 시작하는 토큰에 자리표시자가 아닌 것이 하나도 없다', () => {
    expect(TOKENS.filter((token) => !isPlaceholder(token))).toEqual([]);
  });

  it('선언된 값 중 긴 것은 전부 자리표시자다 (긴 값 = 진짜 키)', () => {
    for (const [name, value] of ASSIGNED) {
      if (value.length <= 12) continue; // 빈 값·`10` 같은 짧은 기본값
      expect(isPlaceholder(value), `${name} 의 값이 자리표시자가 아닙니다`).toBe(true);
    }
  });
});
