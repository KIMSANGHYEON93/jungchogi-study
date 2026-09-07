// 두 스크립트의 **실행 전 관문** — 여기서 잘못 알리면 사용자가 하루 한도를 태운다.
//
// 스크립트를 자식 프로세스로 띄워 확인한다. 관문은 첫 업스트림 호출보다 **앞**에 있어서
// (`--yes` 없이 비대화형이면 거기서 멈춘다) 네트워크를 쓰지 않고도 볼 수 있다.
// 키는 자리표시자를 준다 — 어차피 호출까지 가지 않는다.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function run(script, argv, env) {
  const result = spawnSync(process.execPath, [`scripts/${script}`, ...argv], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      AI_PROVIDER: '',
      ANTHROPIC_API_KEY: '',
      OPENROUTER_API_KEY: '',
      OPENROUTER_MODEL: '',
      ...env,
    },
  });
  return { ...result, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const FREE = { AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'sk-or-v1-xxxxxxxxxxxx' };
const PAID = { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-xxxxxxxxxxxx' };

describe('generate-variants — 무료 경로의 실행 전 관문', () => {
  it('호출 수와 하루 한도 소진율을 알리고, --yes 없이는 진행하지 않는다', () => {
    const { output, status } = run(
      'generate-variants.mjs',
      ['--source', 'quiz100', '--ids', '001,002,042', '--variants', '2'],
      FREE
    );

    expect(output).toContain('프로바이더      : openrouter');
    expect(output).toContain('호출            : 6건');
    expect(output).toContain('일일 한도       : 6/50건 = 12.0% 소진');
    expect(output).toContain('분당 한도       : 20건/분');
    expect(output).toContain('$0');
    expect(output).toMatch(/--yes 를 붙여 다시 실행하세요/);
    expect(status).toBe(1);
  });

  it('하루 한도를 넘기면 넘긴 건수까지 경고한다', () => {
    const { output } = run(
      'generate-variants.mjs',
      ['--source', 'quiz100', '--all', '--variants', '2'],
      FREE
    );

    expect(output).toContain('일일 한도       : 200/50건 = 400.0% 소진');
    expect(output).toContain('하루 한도(50건)를 150건 넘깁니다');
    expect(output).toMatch(/429 도 한도를 깎습니다/);
  });

  it('--free-daily-limit 로 결제 이력이 있는 계정의 한도를 준다', () => {
    const { output } = run(
      'generate-variants.mjs',
      ['--source', 'quiz100', '--all', '--variants', '2', '--free-daily-limit', '1000'],
      FREE
    );

    expect(output).toContain('일일 한도       : 200/1000건 = 20.0% 소진');
    expect(output).not.toContain('넘깁니다');
  });

  it('진행 기록 파일 위치를 미리 알려 준다 (중간에 끊겨도 어디를 봐야 하는지)', () => {
    const { output } = run(
      'generate-variants.mjs',
      ['--source', 'codedrill', '--all'],
      FREE
    );

    expect(output).toMatch(/진행 기록 {7}: .*codedrill-progress\.json/);
  });

  it('--resume <batch_id> 는 거절하고 대신 무엇을 해야 하는지 말한다', () => {
    const { output, status } = run(
      'generate-variants.mjs',
      ['--resume', 'msgbatch_01ABC', '--source', 'quiz100'],
      FREE
    );

    expect(output).toMatch(/Batch API 가 없어 --resume/);
    expect(output).toMatch(/같은 명령을 그대로 다시/);
    expect(status).toBe(1);
  });

  it('키가 없으면 OPENROUTER_API_KEY 를 안내한다', () => {
    const { output, status } = run(
      'generate-variants.mjs',
      ['--source', 'quiz100', '--ids', '001'],
      { AI_PROVIDER: 'openrouter' }
    );

    expect(output).toContain('OPENROUTER_API_KEY 가 설정되지 않았습니다');
    expect(output).toContain('프로바이더: openrouter');
    expect(status).toBe(1);
  });
});

describe('generate-variants — Anthropic Batch 경로의 관문은 그대로다', () => {
  it('달러 추정과 Batch 할인을 그대로 찍는다', () => {
    const { output, status } = run(
      'generate-variants.mjs',
      ['--source', 'quiz100', '--ids', '001,002,042', '--variants', '2'],
      PAID
    );

    expect(output).toContain('요청            : 6건');
    expect(output).toMatch(/추정 비용 {7}: 약 \$\d+\.\d{4}/);
    expect(output).toContain('Batch 50% 할인 반영');
    // 무료 경로의 어휘가 새어 들어오면 안 된다
    expect(output).not.toContain('일일 한도');
    expect(output).not.toContain('진행 기록');
    expect(status).toBe(1);
  });

  it('키가 없으면 ANTHROPIC_API_KEY 를 안내한다', () => {
    const { output, status } = run('generate-variants.mjs', ['--source', 'quiz100', '--ids', '001'], {
      AI_PROVIDER: 'anthropic',
    });

    expect(output).toContain('ANTHROPIC_API_KEY 가 설정되지 않았습니다');
    expect(status).toBe(1);
  });
});

describe('generate-variants — 프로바이더 이름을 잘못 쓰면 멈춘다', () => {
  it('오타를 조용히 넘기지 않는다 (무료로 돌리려던 것이 유료로 나가는 사고)', () => {
    const { output, status } = run('generate-variants.mjs', ['--source', 'quiz100', '--ids', '001'], {
      AI_PROVIDER: 'opnerouter',
      OPENROUTER_API_KEY: 'sk-or-v1-xxxxxxxxxxxx',
    });

    expect(output).toMatch(/opnerouter/);
    expect(status).not.toBe(0);
  });
});

describe('eval-grading — 무료 경로의 실행 전 관문', () => {
  it('평가셋 30건이 하루치의 60% 임을 알린다', () => {
    const { output, status } = run('eval-grading.mjs', [], FREE);

    expect(output).toContain('프로바이더      : openrouter');
    expect(output).toContain('호출            : 30건');
    expect(output).toContain('일일 한도       : 30/50건 = 60.0% 소진');
    expect(output).toContain('분당 한도       : 20건/분 → 최소 1분');
    expect(output).toContain('하루치의 60% 를 씁니다');
    expect(status).toBe(1);
  });

  it('--limit 로 좁히면 소진율도 줄어든다', () => {
    const { output } = run('eval-grading.mjs', ['--limit', '5'], FREE);

    expect(output).toContain('일일 한도       : 5/50건 = 10.0% 소진');
    expect(output).not.toContain('하루치의');
  });

  it('키가 없으면 OPENROUTER_API_KEY 를 안내한다', () => {
    const { output, status } = run('eval-grading.mjs', [], { AI_PROVIDER: 'openrouter' });

    expect(output).toContain('OPENROUTER_API_KEY 가 설정되지 않았습니다');
    expect(status).toBe(1);
  });

  it('anthropic 경로에서 키가 없으면 ANTHROPIC_API_KEY 를 안내한다', () => {
    const { output, status } = run('eval-grading.mjs', [], { AI_PROVIDER: 'anthropic' });

    expect(output).toContain('ANTHROPIC_API_KEY 가 설정되지 않았습니다');
    expect(status).toBe(1);
  });
});
