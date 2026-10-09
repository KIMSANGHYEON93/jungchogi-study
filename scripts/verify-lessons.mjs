#!/usr/bin/env node
// 레슨(src/domain/lessons.js)의 예제 출력과 확인 퀴즈 정답을 실제로 실행해 대조한다.
//
//   node scripts/verify-lessons.mjs
//
// 필요: gcc, javac/java, python3, sqlite3(Python 내장). 실행할 수 없는 조각(main 없는 C/Java 조각, 문장형 문제)은 건너뛰고 수를 알린다.
// 예제 출력(output)은 줄바꿈까지 그대로 비교한다 — 여러 줄 출력을 ' / ' 로 이어 적으면 실패한다.
// 퀴즈 정답은 앱과 같은 규칙(matchesLessonAnswer: 공백·줄바꿈 차이 무시)으로 비교한다.
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 앱 소스는 확장자 없이 import 한다(Vite 규칙). Node 에서 읽도록 상대 경로에 .js 를 붙인다.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[a-z]+$/.test(spec)) return next(spec + '.js', ctx);
  return next(spec, ctx);
}`),
  import.meta.url,
);
const { LESSONS, matchesLessonAnswer } = await import('../src/domain/lessons.js');

const ENV = { ...process.env };
delete ENV.JAVA_TOOL_OPTIONS;

function run(lang, code, tables, mode = 'rows') {
  const dir = mkdtempSync(join(tmpdir(), 'lesson-'));
  const opts = { encoding: 'utf8', env: ENV, cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] };
  if (lang === 'python') return execFileSync('python3', ['-c', code], opts);
  if (lang === 'c') {
    if (!/\bmain\s*\(/.test(code)) return null;
    writeFileSync(join(dir, 'm.c'), code);
    execFileSync('gcc', ['-o', 'm', 'm.c'], opts);
    return execFileSync(join(dir, 'm'), [], opts);
  }
  if (lang === 'java') {
    if (!/\bmain\s*\(/.test(code)) return null;
    const cls = /public\s+class\s+(\w+)/.exec(code)?.[1] ?? 'Main';
    writeFileSync(join(dir, `${cls}.java`), code);
    execFileSync('javac', [`${cls}.java`], opts);
    return execFileSync('java', [cls], opts);
  }
  if (lang === 'sql' && tables) {
    const py = `
import json, sqlite3, sys
tables, sql, mode = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3]
con = sqlite3.connect(':memory:')
for t in tables:
    con.execute('CREATE TABLE %s (%s)' % (t['name'], ', '.join(t['columns'])))
    con.executemany('INSERT INTO %s VALUES (%s)' % (t['name'], ','.join('?' * len(t['columns']))), [[None if v == 'NULL' else v for v in r] for r in t['rows']])
import re
sql = re.sub(r'--[^\\n]*', '', sql)
stmts = [s for s in (x.strip() for x in sql.split(';')) if s]
for s in stmts:
    cur = con.execute(s)
    if cur.description:
        rows = cur.fetchall()
        if mode == 'count':
            print(len(rows))
        else:
            for r in rows: print(' '.join('NULL' if v is None else str(v) for v in r))
`;
    return execFileSync('python3', ['-c', py, JSON.stringify(tables), code, mode], opts);
  }
  return null;
}

let checked = 0;
let skipped = 0;
const bad = [];
for (const lesson of LESSONS) {
  for (const s of lesson.sections) {
    if (!s.code || s.output === undefined) continue;
    let got;
    try {
      got = run(s.lang, s.code, lesson.tables);
    } catch (e) {
      bad.push([lesson.id, s.heading, '실행 실패', String(e.stderr || e.message).slice(0, 200)]);
      continue;
    }
    if (got === null) { skipped += 1; continue; }
    checked += 1;
    // SQL 은 행을 공백으로 이어 비교하고, 나머지는 줄바꿈까지 그대로 비교한다
    const norm = (t) => (s.lang === 'sql' ? t.trim().split(/\s+/).join(' ') : t.replace(/\s+$/, ''));
    if (norm(got) !== norm(s.output)) bad.push([lesson.id, s.heading, JSON.stringify(s.output), JSON.stringify(got.replace(/\s+$/, ''))]);
  }
  for (const q of lesson.questions) {
    // 실행 결과를 묻는 문항만 돌린다. 코드가 예시로만 붙은 용어 문제(예: SQL 인젝션)는 건너뛴다.
    if (!q.code || !/출력|값은|행 수/.test(q.prompt)) { skipped += 1; continue; }
    let got;
    try {
      got = run(q.lang, q.code, lesson.tables, /행 수/.test(q.prompt) ? 'count' : 'rows');
    } catch (e) {
      bad.push([lesson.id, q.id, '실행 실패', String(e.stderr || e.message).slice(0, 200)]);
      continue;
    }
    if (got === null) { skipped += 1; continue; }
    checked += 1;
    if (!matchesLessonAnswer(q, got.trim())) bad.push([lesson.id, q.id, JSON.stringify(q.answer), JSON.stringify(got.trim())]);
  }
}
for (const b of bad) console.log('불일치', b.join(' | '));
console.log(`${checked}개 확인, 건너뜀 ${skipped}개(실행할 수 없는 조각·문장형), 불일치 ${bad.length}`);
process.exit(bad.length ? 1 : 0);
