import { describe, it, expect } from 'vitest';
import { normalizeSql, checkBlank, SQL_BLANK_ITEMS } from '../src/domain/sqlBlanks.js';

describe('normalizeSql', () => {
  it('대소문자를 무시한다', () => {
    expect(normalizeSql('SeLeCt')).toBe('select');
  });
  it('연속 공백·줄바꿈을 한 칸으로, 앞뒤 공백을 제거한다', () => {
    expect(normalizeSql('  group \n  by\t x  ')).toBe('group by x');
  });
  it('끝의 세미콜론을 제거한다', () => {
    expect(normalizeSql('select 1 ;')).toBe('select 1');
    expect(normalizeSql('select 1;;')).toBe('select 1');
  });
  it('구분 기호와 비교 연산자 둘레 공백을 지운다', () => {
    expect(normalizeSql('a , b')).toBe('a,b');
    expect(normalizeSql('count ( * ) >= 2')).toBe('count(*)>=2');
    expect(normalizeSql('a = b')).toBe('a=b');
    expect(normalizeSql('a <> b')).toBe('a<>b');
    expect(normalizeSql('a != b')).toBe('a!=b');
    expect(normalizeSql('a <= b')).toBe('a<=b');
    expect(normalizeSql('a < b')).toBe('a<b');
    expect(normalizeSql('a > b')).toBe('a>b');
  });
  it('문자열이 아니면 빈 문자열', () => {
    expect(normalizeSql(null)).toBe('');
    expect(normalizeSql(undefined)).toBe('');
    expect(normalizeSql(3)).toBe('');
  });
});

describe('checkBlank', () => {
  it('대소문자·공백·세미콜론 차이를 허용한다', () => {
    expect(checkBlank('group   BY', ['GROUP BY'])).toBe(true);
    expect(checkBlank(' select; ', ['SELECT'])).toBe(true);
  });
  it('연산자 둘레 공백 차이를 허용한다', () => {
    expect(checkBlank('count(*)>=2', ['COUNT(*) >= 2'])).toBe(true);
  });
  it('대안 정답 중 하나면 맞다', () => {
    expect(checkBlank('join', ['INNER JOIN', 'JOIN'])).toBe(true);
    expect(checkBlank('inner join', ['INNER JOIN', 'JOIN'])).toBe(true);
    expect(checkBlank('left join', ['INNER JOIN', 'JOIN'])).toBe(false);
  });
  it('빈 입력·null 은 오답이다', () => {
    expect(checkBlank('', ['SELECT'])).toBe(false);
    expect(checkBlank('   ', ['SELECT'])).toBe(false);
    expect(checkBlank(null, ['SELECT'])).toBe(false);
    expect(checkBlank(undefined, ['SELECT'])).toBe(false);
    expect(checkBlank('', [''])).toBe(false);
  });
  it('정답 목록이 없으면 오답이다', () => {
    expect(checkBlank('x', [])).toBe(false);
    expect(checkBlank('x', null)).toBe(false);
  });
});

describe('SQL_BLANK_ITEMS', () => {
  it('8문항 이상이고 id 가 유일하다', () => {
    expect(SQL_BLANK_ITEMS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(SQL_BLANK_ITEMS.map((i) => i.id)).size).toBe(SQL_BLANK_ITEMS.length);
  });

  it('핵심 절이 각각 빈칸으로 한 번 이상 나온다', () => {
    const answers = new Set(SQL_BLANK_ITEMS.flatMap((i) => i.blanks.flatMap((b) => b.answers.map((a) => a.toUpperCase()))));
    for (const kw of ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ON', 'ORDER BY', 'DISTINCT']) {
      expect(answers.has(kw), kw).toBe(true);
    }
    expect([...answers].some((a) => a === 'JOIN' || a === 'INNER JOIN')).toBe(true);
  });

  describe.each(SQL_BLANK_ITEMS)('$id', (item) => {
    it('템플릿의 빈칸 번호와 blanks 가 일치하고 정답이 비어 있지 않다', () => {
      const inTemplate = [...item.template.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]));
      expect(inTemplate.sort()).toEqual(item.blanks.map((b) => b.id).sort());
      for (const b of item.blanks) expect(b.answers.length).toBeGreaterThan(0);
      expect(item.tables.length).toBeGreaterThan(0);
    });

    it('각 칸의 첫 정답을 채우면 solution 과 정규화 후 같다', () => {
      const filled = item.template.replace(/\[\[(\d+)\]\]/g, (_, n) => item.blanks.find((x) => x.id === Number(n)).answers[0]);
      expect(normalizeSql(filled)).toBe(normalizeSql(item.solution));
    });

    it('모든 대안 정답이 checkBlank 를 통과한다', () => {
      for (const b of item.blanks) for (const a of b.answers) expect(checkBlank(a, b.answers)).toBe(true);
    });
  });
});
