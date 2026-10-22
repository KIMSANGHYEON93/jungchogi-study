import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAST_EXAMS, codeLangOf, pastExamByKey, pastExamLabel, pastExamSourceUrl } from '../src/domain/pastExams.js';
import { buildPastExam, usageCounts } from '../src/domain/examPick.js';
import { parseQuiz } from '../src/utils/parseQuiz.js';
import { parseCodeDrill } from '../src/utils/parseCodeDrill.js';

const read = (f) => readFileSync(resolve(process.cwd(), 'public/data', f), 'utf8');
const quizPool = ['정처기_단답형_100선.md', '정처기_출제범위_확장문항.md', '정처기_기출주제_보강문항.md']
  .flatMap((f) => parseQuiz(read(f)))
  .map((q) => ({ ...q, type: 'quiz' }));
const codePool = parseCodeDrill(read('정처기_코드트레이싱_드릴.md')).map((q) => ({ ...q, type: 'code' }));

describe('회차별 기출 주제 지도', () => {
  it('2020년 1회 ~ 2026년 2회 21회차, 회차마다 20개 주제', () => {
    expect(PAST_EXAMS.map((e) => e.key)).toEqual([
      '2020-1', '2020-2', '2020-3', '2020-4', '2021-1', '2021-2', '2021-3', '2022-1', '2022-2', '2022-3',
      '2023-1', '2023-2', '2023-3', '2024-1', '2024-2', '2024-3', '2025-1', '2025-2', '2025-3', '2026-1', '2026-2',
    ]);
    for (const e of PAST_EXAMS) expect(e.topics, e.key).toHaveLength(20);
    expect(pastExamLabel(pastExamByKey('2024-1'))).toBe('2024년 1회');
    expect(pastExamSourceUrl('2024-1')).toBe('https://www.sqldpass.com/blog/past-exam/engineer-2024-1');
  });

  it('420개 주제가 모두 앱 문항이나 코드 언어에 이어져 있다 (빈 주제 없음)', () => {
    expect(PAST_EXAMS.flatMap((e) => e.topics).filter((t) => t.ref === null)).toEqual([]);
  });

  it('주제에 이어 둔 문항 id 가 모두 앱 문항에 있고, 코드 주제의 언어가 드릴에 있다', () => {
    const quizIds = new Set(quizPool.map((q) => String(q.id)));
    const langs = new Set(codePool.map((q) => q.lang));
    for (const e of PAST_EXAMS) {
      for (const t of e.topics) {
        if (t.ref === null) continue;
        const lang = codeLangOf(t.ref);
        if (lang) expect(langs.has(lang), `${e.key} ${t.label}`).toBe(true);
        else expect(quizIds.has(t.ref), `${e.key} ${t.label} → ${t.ref}`).toBe(true);
      }
    }
  });

  it('보강 문항(Y)은 모두 어느 회차의 주제에 쓰인다', () => {
    const used = new Set(PAST_EXAMS.flatMap((e) => e.topics.map((t) => t.ref)));
    const ys = parseQuiz(read('정처기_기출주제_보강문항.md')).map((q) => q.id);
    expect(ys).toHaveLength(65);
    expect(ys.filter((id) => !used.has(id))).toEqual([]);
  });
});

describe('회차별 모의고사 구성', () => {
  it.each(PAST_EXAMS.map((e) => [e.key]))('%s — 20문항, 중복 없음, 코드 주제는 같은 언어', (key) => {
    const exam = pastExamByKey(key);
    const picked = buildPastExam(exam, quizPool, codePool, usageCounts([]));
    expect(picked).toHaveLength(20);
    expect(new Set(picked.map((p) => `${p.question.type}:${p.question.id}`)).size).toBe(20);
    picked.forEach((p, i) => {
      const t = exam.topics[i];
      expect(p.topic).toBe(t.label);
      const lang = codeLangOf(t.ref);
      if (lang && codePool.filter((c) => c.lang === lang).length >= exam.topics.filter((x) => x.ref === t.ref).length) {
        expect(p.question.type).toBe('code');
        expect(p.question.lang).toBe(lang);
      }
      if (t.ref && !lang && exam.topics.findIndex((x) => x.ref === t.ref) === i) {
        expect(String(p.question.id)).toBe(t.ref);
      }
    });
  });

  it('같은 회차를 다시 풀면 코드 문항은 덜 나온 것으로 바뀐다', () => {
    const exam = pastExamByKey('2024-2');
    const first = buildPastExam(exam, quizPool, codePool, usageCounts([]));
    const session = { items: first.map((p) => ({ qid: String(p.question.id) })) };
    const second = buildPastExam(exam, quizPool, codePool, usageCounts([session]));
    const codeIds = (xs) => xs.filter((p) => p.question.type === 'code').map((p) => p.question.id);
    const overlap = codeIds(second).filter((id) => codeIds(first).includes(id));
    expect(overlap).toEqual([]);
  });
});
