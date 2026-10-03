import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseBogang } from '../src/utils/parseBogang.js';

const sample = readFileSync(
  fileURLToPath(new URL('./fixtures/bogang-sample.md', import.meta.url)),
  'utf8'
);

describe('parseBogang — 실제 콘텐츠 형식', () => {
  it('섹션의 빈 줄 덩어리마다 카드 한 장으로 쪼갠다', () => {
    const cards = parseBogang(sample);
    expect(cards.map((c) => c.id)).toEqual(['B01-1', 'B01-2', 'B01-3', 'B02-1', 'B02-2']);
    expect(cards.map((c) => c.section)).toEqual(['B01', 'B01', 'B01', 'B02', 'B02']);
  });

  it('id 는 `B섹션(두 자리)-순번` 이고 section 은 쪼개기 전 id 다', () => {
    const [first] = parseBogang('### 보강 7: 일곱\n### 보강 42: 마흔둘\n### 보강 119: 백열아홉\n');
    expect(first).toMatchObject({ id: 'B07-1', section: 'B07' });
    expect(parseBogang('### 보강 42: 마흔둘\n')[0].id).toBe('B42-1');
    expect(parseBogang('### 보강 119: 백열아홉\n')[0].id).toBe('B119-1');
  });

  it('question 은 `[암기 ...]` 대괄호 주석을 제거하고 `[보강]` 을 앞에 붙이며, 덩어리 제목을 잇는다', () => {
    const cards = parseBogang(sample);
    expect(cards[0].question).toBe('[보강] C언어 서식문자열 & 제어문자 — 서식문자열');
    expect(cards[1].question).toBe('[보강] C언어 서식문자열 & 제어문자 — 제어문자');
    expect(cards[2].question).toBe('[보강] C언어 서식문자열 & 제어문자 — 자주 나오는 함정');
    expect(cards[3].question).toBe('[보강] 연산자 우선순위'); // 제목 없는 덩어리는 섹션 제목만
    expect(cards[4].question).toBe('[보강] 연산자 우선순위 — 암기');
  });

  it('카드 한 장짜리 섹션은 질문이 섹션 제목 그대로다', () => {
    const [card] = parseBogang('### 보강 3: 단일 [암기 001]\n```\n한 줄\n```\n');
    expect(card.question).toBe('[보강] 단일');
    expect(card.answer).toBe('```\n한 줄\n```');
  });

  it('answer 는 그 덩어리만 담고 본문은 고치지 않는다 (코드블록으로 다시 감싼다)', () => {
    const cards = parseBogang(sample);
    expect(cards[0].answer.startsWith('```\n서식문자열:')).toBe(true);
    expect(cards[0].answer).toContain('%d  정수 10진수');
    expect(cards[0].answer).not.toContain('제어문자:');
    expect(cards[1].answer).toContain('\\n  줄바꿈(new line)');
    expect(cards[2].answer).toContain('**자주 나오는 함정**');
    expect(cards[2].answer).toContain('printf("ABC\\rDE")');
    expect(cards.map((c) => c.answer).join('\n')).not.toContain('### 보강');
  });

  it('덩어리 앞의 공통 들여쓰기는 걷는다', () => {
    const [card] = parseBogang('### 보강 1: 제목\n```\n  A:\n    a\n```\n');
    expect(card.answer).toBe('```\nA:\n  a\n```');
  });

  it('같은 층에 항목이 여럿인 덩어리는 맨 윗줄을 제목으로 쓰지 않고, 둘 이상이면 용어 나열로 가른다', () => {
    const cards = parseBogang(
      '### 보강 1: 제목\n```\n절차적: C\n객체지향: Java\n\n스미싱: SMS\n웜: 복제\n\n에이징: 기다림\n```\n'
    );
    expect(cards.map((c) => c.question)).toEqual([
      '[보강] 제목 — 절차적 · 객체지향',
      '[보강] 제목 — 스미싱 · 웜',
      '[보강] 제목 — 에이징',
    ]);
  });

  it('제목 없는 덩어리가 하나뿐이면 섹션 제목만 쓴다', () => {
    const cards = parseBogang('### 보강 1: 제목\n```\n절차적: C\n객체지향: Java\n\n에이징: 기다림\n```\n');
    expect(cards[0].question).toBe('[보강] 제목');
    expect(cards[1].question).toBe('[보강] 제목 — 에이징');
  });

  it('한 줄에 항목 둘(`A: … / B: …`)이면 두 용어를 잇는다', () => {
    const cards = parseBogang('### 보강 1: 제목\n```\nARP: IP → MAC  /  RARP: MAC → IP\n\n프로토콜 3요소: 구문\n```\n');
    expect(cards[0].question).toBe('[보강] 제목 — ARP · RARP');
  });

  it('answer 는 `## Part` 헤딩에서도 멈춘다', () => {
    const [card] = parseBogang(
      ['### 보강 1: 첫 카드', '본문 A', '', '## Part 3. 다음 파트', '다른 파트 본문'].join('\n')
    );
    expect(card.answer).toBe('본문 A');
  });

  it('question 키워드로 카테고리를 매핑한다', () => {
    const [first] = parseBogang(sample);
    expect(first.category).toBe('OS/기타'); // 'C언어' → OS/기타
    expect(new Set(parseBogang(sample).slice(0, 3).map((c) => c.category))).toEqual(new Set(['OS/기타'])); // 섹션의 모든 카드가 같다

    const map = (title) => parseBogang(`### 보강 1: ${title}\n내용\n`)[0].category;
    expect(map('UML 다이어그램 상세')).toBe('디자인패턴/UML');
    expect(map('인덱스 & 뷰 & 트랜잭션')).toBe('데이터베이스');
    expect(map('화이트박스 / 블랙박스 테스트 상세')).toBe('테스트');
    expect(map('DoS 공격 유형 상세')).toBe('보안/네트워크');
    expect(map('DFD 구성요소')).toBe('소프트웨어공학');
  });

  it('매핑되는 키워드가 없으면 기본 카테고리는 OS/기타 다', () => {
    const [card] = parseBogang('### 보강 1: 아무 키워드도 없는 제목\n내용\n');
    expect(card.category).toBe('OS/기타');
  });

  it('키워드가 여러 개 걸리면 categoryMap 선언 순서상 먼저 오는 것을 쓴다', () => {
    // 'C언어'(OS/기타) 가 '테스트'(테스트) 보다 먼저 선언되어 있다
    const [card] = parseBogang('### 보강 1: C언어 테스트\n내용\n');
    expect(card.category).toBe('OS/기타');
  });
});

describe('parseBogang — 엣지 케이스', () => {
  it('빈 문자열은 빈 배열을 반환한다', () => {
    expect(parseBogang('')).toEqual([]);
  });

  it('`### 보강` 헤딩이 없으면 빈 배열을 반환한다', () => {
    expect(parseBogang('# 제목\n\n## Part 1. 표만 있는 파트\n| a | b |\n')).toEqual([]);
  });

  it('제목 없이 `### 보강 N:` 만 있으면 카드로 보지 않는다', () => {
    expect(parseBogang('### 보강 1:\n내용\n')).toEqual([]);
  });

  it('본문이 없는 카드는 answer 가 빈 문자열이다', () => {
    const cards = parseBogang('### 보강 1: 본문 없음\n### 보강 2: 본문 있음\n내용\n');
    expect(cards[0].answer).toBe('');
    expect(cards[1].answer).toBe('내용');
  });

  it('본문 안의 `---` 구분선을 제거한다 (빈 줄은 남는다)', () => {
    const [card] = parseBogang('### 보강 1: 제목\n첫 줄\n\n---\n\n둘째 줄\n');
    expect(card.answer).not.toContain('---');
    expect(card.answer).toBe('첫 줄\n\n\n둘째 줄');
  });

  it('제목 전체가 대괄호면 question 이 `[보강]` 만 남는다', () => {
    const [card] = parseBogang('### 보강 1: [암기 001]\n내용\n');
    expect(card.question).toBe('[보강] ');
  });

  it('CRLF 개행 문서에서도 LF 문서와 완전히 같은 결과를 낸다', () => {
    expect(parseBogang(sample.replace(/\n/g, '\r\n'))).toEqual(parseBogang(sample));
  });
});
