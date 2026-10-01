import { describe, it, expect } from 'vitest';
import { parseStudyNotes, makeSnippet } from '../src/utils/parseStudyNotes.js';
import { STUDY_FILES } from '../src/domain/studyFiles.js';

describe('parseStudyNotes', () => {
  const md = ['# 제목', '서문 내용', '## 1. 첫 절', '본문 A', '```python', '# 주석은 제목이 아님', 'print(1)', '```', '### 1-1. 세부', '본문 B'].join('\n');

  it('제목(#~###)별로 섹션을 나눈다', () => {
    const s = parseStudyNotes(md, 3);
    expect(s.map((x) => x.heading)).toEqual(['제목', '1. 첫 절', '1-1. 세부']);
    expect(s.every((x) => x.fileIdx === 3)).toBe(true);
    expect(s[2].text).toBe('본문 B');
  });

  it('코드 펜스 안의 # 는 제목으로 보지 않는다', () => {
    const s = parseStudyNotes(md, 0);
    expect(s[1].text).toContain('# 주석은 제목이 아님');
  });

  it('섹션 id 는 파일 안에서 유일하다', () => {
    const ids = parseStudyNotes(md, 5).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('제목 앞의 글은 서문 섹션으로 남기고, 빈 입력은 빈 목록', () => {
    expect(parseStudyNotes('앞글\n# 제목\n내용', 0)[0].heading).toBe('(서문)');
    expect(parseStudyNotes('', 0)).toEqual([]);
    expect(parseStudyNotes(null, 0)).toEqual([]);
  });

  it('제목의 마크다운 강조 기호는 지운다', () => {
    expect(parseStudyNotes('## **굵게** `코드`\nx', 0)[0].heading).toBe('굵게 코드');
  });
});

describe('makeSnippet', () => {
  it('검색어 주변을 잘라 앞뒤에 말줄임표를 붙인다', () => {
    const text = `${'가'.repeat(200)}찾는말${'나'.repeat(200)}`;
    const snip = makeSnippet(text, ['찾는말'], 20);
    expect(snip.startsWith('…')).toBe(true);
    expect(snip.endsWith('…')).toBe(true);
    expect(snip).toContain('찾는말');
  });

  it('검색어가 없으면 앞부분을 보여준다', () => {
    expect(makeSnippet('짧은 글', ['없는말'])).toBe('짧은 글');
  });
});

describe('STUDY_FILES', () => {
  it('Day 1~14 가 앞 14칸이고 문서가 모두 18개다', () => {
    expect(STUDY_FILES).toHaveLength(18);
    expect(STUDY_FILES[0].name).toContain('Day 01');
    expect(STUDY_FILES[13].name).toContain('Day 14');
  });
});
