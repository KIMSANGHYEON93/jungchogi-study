// 단답·약술 키워드 채점의 도메인 계층.
//
// 서술형은 정답이 한 가지 문장이 아니므로 "빠뜨리면 안 되는 핵심 키워드가 들어 있는가"로 채점한다.
// 서버·AI 없이 문자열 포함 여부만 보므로 결과가 항상 같고 설명 가능하다.

/**
 * @typedef {{label: string, aliases?: string[]}} Keyword
 */

// 채점에서 무시할 문자: 공백류와 구두점. '연결 지향'·'연결지향'·'연결-지향' 을 같게 본다.
const IGNORED = /[\s.,;:·()/\-_]/;

/** 소문자화하고 모든 공백·구두점을 제거한다. */
export function normalizeAnswer(text) {
  if (typeof text !== 'string') return '';
  return [...text.toLowerCase()].filter((ch) => !IGNORED.test(ch)).join('');
}

/**
 * 원문을 정규화하면서, 정규화된 각 글자가 원문의 몇 번째 UTF-16 위치에서 왔는지 함께 돌려준다.
 * 하이라이트는 원문 위치로 그려야 하므로(공백이 낀 원문에서도 맞아야 한다) 이 매핑이 필요하다.
 */
function normalizeWithMap(text) {
  let norm = '';
  const map = [];
  let pos = 0;
  for (const ch of text) {
    // 소문자화로 글자 수가 늘어나는 드문 문자도 모두 같은 원문 위치에 매단다
    for (const lower of ch.toLowerCase()) {
      if (!IGNORED.test(lower)) {
        // norm 의 인덱스는 UTF-16 단위이므로 map 도 단위마다 하나씩 쌓는다 (이모지는 2칸)
        for (let i = 0; i < lower.length; i += 1) {
          norm += lower[i];
          map.push(pos);
        }
      }
    }
    pos += ch.length;
  }
  return { norm, map };
}

function termsOf(keyword) {
  const raw = [keyword?.label, ...(Array.isArray(keyword?.aliases) ? keyword.aliases : [])];
  return raw.map(normalizeAnswer).filter((t) => t !== '');
}

/**
 * 답안을 키워드 목록으로 채점한다. 어떤 입력에도 던지지 않는다.
 *
 * @param {string} answer
 * @param {Keyword[]} keywords
 * @returns {{matched: Keyword[], missed: Keyword[], ratio: number, segments: {text: string, hit: boolean}[]}}
 *   ratio 는 매칭 수 / 키워드 수(키워드가 없으면 0).
 *   segments 는 원문 답안을 매칭 구간 기준으로 쪼갠 것 — 이어 붙이면 원문과 같다.
 */
export function gradeAnswer(answer, keywords) {
  const text = typeof answer === 'string' ? answer : '';
  const list = Array.isArray(keywords) ? keywords.filter((k) => k && typeof k === 'object') : [];
  const { norm, map } = normalizeWithMap(text);

  const matched = [];
  const missed = [];
  // 원문 기준 [start, end) 구간들
  const ranges = [];

  for (const keyword of list) {
    let found = false;
    for (const term of termsOf(keyword)) {
      let from = 0;
      for (;;) {
        const at = norm.indexOf(term, from);
        if (at === -1) break;
        found = true;
        const last = at + term.length - 1;
        ranges.push([map[at], map[last] + 1]);
        from = at + 1;
      }
    }
    (found ? matched : missed).push(keyword);
  }

  // 겹치거나 맞닿은 구간은 하나로 합친다
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && s <= prev[1]) prev[1] = Math.max(prev[1], e);
    else merged.push([s, e]);
  }

  // 구간 끝이 서로게이트 쌍 한가운데가 되는 일은 없다(map 은 코드 포인트 시작 위치).
  // 단, 끝 위치는 마지막 글자의 길이를 더해야 하므로 보정한다.
  const segments = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    const end = endOfCodePoint(text, e);
    if (s > cursor) segments.push({ text: text.slice(cursor, s), hit: false });
    segments.push({ text: text.slice(s, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });

  return {
    matched,
    missed,
    ratio: list.length === 0 ? 0 : matched.length / list.length,
    segments,
  };
}

// e 는 마지막 매칭 글자의 시작+1 이다. 그 글자가 서로게이트 쌍이면 쌍의 끝까지 넓힌다.
function endOfCodePoint(text, e) {
  const code = text.charCodeAt(e - 1);
  const next = text.charCodeAt(e);
  const isHigh = code >= 0xd800 && code <= 0xdbff;
  const isLow = next >= 0xdc00 && next <= 0xdfff;
  return isHigh && isLow ? e + 1 : e;
}

/**
 * 연습 문항. 키워드는 `public/data/*.md` 학습 문서의 설명과 맞춰 교과서적으로 정확한 것만 둔다.
 * 문서마다 용어가 갈리는 것(독립성/격리성, 지속성/영속성, 동등분할/동치 분할 등)은 aliases 로 받는다.
 * model 은 자기 keywords 를 모두 만족해야 한다(테스트로 고정).
 */
export const SHORT_ANSWER_ITEMS = [
  {
    id: 'sa-tcp',
    topic: '네트워크',
    question: 'TCP 프로토콜의 특징을 쓰시오.',
    keywords: [
      { label: '연결형', aliases: ['연결 지향', '연결지향'] },
      { label: '신뢰성', aliases: ['신뢰할 수 있는'] },
      { label: '흐름 제어' },
      { label: '혼잡 제어' },
      { label: '순서 보장', aliases: ['순서 제어', '순서대로'] },
    ],
    model:
      'TCP 는 연결형 프로토콜로 3-way handshake 로 연결을 맺고, 재전송으로 신뢰성을 높이며 순서 보장을 제공한다. 또한 흐름 제어와 혼잡 제어를 수행한다.',
  },
  {
    id: 'sa-normalization',
    topic: '데이터베이스',
    question: '정규화(Normalization)의 목적을 쓰시오.',
    keywords: [
      { label: '이상 현상 제거', aliases: ['이상 현상', '이상현상', '이상(anomaly)', '삽입 이상', '갱신 이상', '삭제 이상'] },
      { label: '중복 최소화', aliases: ['중복 제거', '중복을 최소', '중복 감소', '중복을 줄', '데이터 중복'] },
      { label: '무결성', aliases: ['일관성 유지', '일관성 확보'] },
    ],
    model:
      '정규화는 테이블을 분해해 데이터 중복을 최소화하고, 삽입·삭제·갱신 이상 현상을 제거하여 데이터 무결성을 유지하기 위한 과정이다.',
  },
  {
    id: 'sa-acid',
    topic: '데이터베이스',
    question: '트랜잭션의 4가지 특성(ACID)을 쓰시오.',
    keywords: [
      { label: '원자성', aliases: ['atomicity'] },
      { label: '일관성', aliases: ['consistency'] },
      { label: '격리성', aliases: ['독립성', '고립성', 'isolation'] },
      { label: '영속성', aliases: ['지속성', 'durability'] },
    ],
    model:
      '원자성(전부 실행 또는 전부 취소), 일관성(실행 후에도 일관된 상태 유지), 격리성(동시 실행 시 상호 간섭 불가), 영속성(완료된 결과는 영구 반영)이다.',
  },
  {
    id: 'sa-deadlock',
    topic: '운영체제',
    question: '교착상태(Deadlock) 발생의 4가지 필요 조건을 쓰시오.',
    keywords: [
      { label: '상호 배제', aliases: ['mutual exclusion'] },
      { label: '점유와 대기', aliases: ['점유 대기', '점유하고 대기', 'hold and wait', 'hold & wait'] },
      { label: '비선점', aliases: ['선점 불가', 'non-preemption', 'no preemption'] },
      { label: '환형 대기', aliases: ['순환 대기', 'circular wait'] },
    ],
    model:
      '상호 배제, 점유와 대기, 비선점, 환형 대기의 네 조건이 모두 충족될 때 교착상태가 발생한다.',
  },
  {
    id: 'sa-blackbox',
    topic: '소프트웨어 공학',
    question: '블랙박스 테스트의 특징과 대표 기법을 쓰시오.',
    keywords: [
      { label: '명세 기반', aliases: ['명세를 기반', '명세 기준', '기능 기반', '기능 테스트', '기능을 검증', '기능 검증', '요구사항 기반'] },
      { label: '내부 구조 미확인', aliases: ['내부 구조를 보지', '내부 구조를 알 필요', '내부 구조를 몰', '내부 구조를 고려하지', '내부 코드를 보지', '내부 구조 확인하지', '내부 구조 알지'] },
      { label: '동치 분할', aliases: ['동등 분할', '동등분할', '동치 분할 기법', 'equivalence partitioning'] },
      { label: '경계값 분석', aliases: ['경계값 테스트', 'boundary value'] },
    ],
    model:
      '블랙박스 테스트는 명세 기반으로 기능 동작을 검증하며 내부 구조 미확인 상태에서 입출력만 본다. 대표 기법으로 동치 분할과 경계값 분석이 있다.',
  },
  {
    id: 'sa-singleton',
    topic: '디자인 패턴',
    question: '싱글톤(Singleton) 패턴의 의도와 구현 특징을 쓰시오.',
    keywords: [
      { label: '인스턴스 하나', aliases: ['인스턴스를 하나', '인스턴스 한 개', '하나의 인스턴스', '단 하나', '유일한 인스턴스', '유일 인스턴스', '1개의 인스턴스', '인스턴스가 하나'] },
      { label: '전역 접근', aliases: ['전역적인 접근', '전역 접근점', '전역으로 접근', '전역 지점', '어디서든 접근', '전역에서 접근'] },
    ],
    model:
      '싱글톤은 클래스의 인스턴스를 하나만 만들도록 제한하고, private 생성자와 static getInstance() 로 어디서든 접근하는 전역 접근 지점을 제공하는 생성 패턴이다.',
  },
  {
    id: 'sa-process-thread',
    topic: '운영체제',
    question: '프로세스와 스레드의 차이를 쓰시오.',
    keywords: [
      { label: '독립된 메모리', aliases: ['독립적인 메모리', '독립된 주소 공간', '독립적인 주소 공간', '독립된 자원'] },
      { label: '자원 공유', aliases: ['자원을 공유', '메모리 공유', '메모리를 공유', '코드와 데이터를 공유', '힙을 공유'] },
      { label: '실행 단위', aliases: ['실행 흐름', '작업 단위', '스케줄링 단위'] },
    ],
    model:
      '프로세스는 실행 중인 프로그램으로 독립된 메모리 공간을 가진다. 스레드는 프로세스 내의 실행 단위로, 같은 프로세스의 코드·데이터·힙 등을 공유하는 자원 공유 방식이라 생성·전환 비용이 작다.',
  },
  {
    id: 'sa-index',
    topic: '데이터베이스',
    question: '데이터베이스 인덱스(Index)가 무엇이며 왜 사용하는지 쓰시오.',
    keywords: [
      { label: '검색 속도', aliases: ['검색 성능', '조회 속도', '조회 성능', '탐색 속도', '검색 시간', '검색을 빠르게', '빠르게 검색', '빠른 검색'] },
      { label: '키 값과 포인터', aliases: ['키값과 포인터', '키 값, 포인터', '포인터 쌍', '키와 포인터', '<키값, 포인터>', '키 값 포인터'] },
      { label: '추가 저장 공간', aliases: ['저장 공간이 필요', '공간이 더 필요'] },
    ],
    model:
      '인덱스는 <키 값과 포인터> 쌍으로 이루어진 자료구조로 테이블의 검색 속도를 높인다. 대신 추가 저장 공간이 필요하고 삽입·갱신·삭제 시 인덱스 갱신 비용이 든다.',
  },
  {
    id: 'sa-view',
    topic: '데이터베이스',
    question: '뷰(View)란 무엇인지 쓰시오.',
    keywords: [
      { label: '가상 테이블', aliases: ['가상의 테이블', '논리적 테이블', '가상 릴레이션'] },
      { label: '기본 테이블에서 유도', aliases: ['기본 테이블로부터 유도', '기본 테이블로부터 만들', '기본 테이블에서 파생', '하나 이상의 테이블', '하나 이상의 기본 테이블', '기본 테이블을 기반', '기본 테이블 기반', '실제 테이블로부터'] },
      { label: '논리적 독립성', aliases: ['논리적 데이터 독립성', '데이터 독립성'] },
    ],
    model:
      '뷰는 하나 이상의 기본 테이블에서 유도된 가상 테이블로 물리적으로 존재하지 않는다. 논리적 독립성을 제공하며 CREATE VIEW 로 만든다.',
  },
  {
    id: 'sa-agile',
    topic: '소프트웨어 공학',
    question: '애자일(Agile) 방법론의 특징을 쓰시오.',
    keywords: [
      { label: '반복', aliases: ['반복적', '이터레이션'] },
      { label: '점진적', aliases: ['점진', '증분'] },
      { label: '고객 피드백', aliases: ['고객 참여', '고객과의 협력', '고객과 협업', '고객의 피드백'] },
      { label: '변화 대응', aliases: ['변화에 대응', '변화에 적응', '변경에 대응', '변경 수용', '적응적', '변화를 수용', '변화에 유연'] },
    ],
    model:
      '애자일은 짧은 주기로 반복하며 점진적으로 개발하고, 고객 피드백을 지속적으로 반영해 요구 변화 대응에 유연한 경량 개발 방법론이다.',
  },
  {
    id: 'sa-whitebox',
    topic: '소프트웨어 공학',
    question: '화이트박스 테스트의 특징과 대표 기법을 쓰시오.',
    keywords: [
      { label: '내부 구조 기반', aliases: ['내부 구조를 기반', '코드 구조 기반', '구조 기반', '구조 테스트', '내부 코드 기반', '내부 로직', '프로그램 구조 기반'] },
      { label: '논리 경로', aliases: ['논리적 경로', '논리적인 경로', '실행 경로', '경로 테스트'] },
      { label: '기초 경로', aliases: ['기본 경로', '기초 경로 테스트', 'basis path'] },
      { label: '조건 커버리지', aliases: ['조건/분기 커버리지', '분기 커버리지', '결정 커버리지', '구문 커버리지', '문장 커버리지'] },
    ],
    model:
      '화이트박스 테스트는 내부 구조 기반으로 프로그램의 논리 경로를 검사한다. 대표 기법으로 기초 경로 테스트, 조건 커버리지, 루프 테스트가 있다.',
  },
];
