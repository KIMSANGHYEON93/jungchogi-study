// 보강_기출분석_암기119선.md → [{id, section, question, answer, category}]
//
// 원본은 `### 보강 N: 제목 [암기 …]` 섹션 24개이고, 섹션마다 설명이 여러 덩어리(빈 줄로 나뉜 코드블록 묶음)로 들어 있다.
// 한 섹션을 통째로 카드 한 장으로 두면 "서식문자열"과 "제어문자"처럼 따로 외울 것이 한 장에 섞이므로
// **빈 줄로 나뉜 덩어리마다 카드 한 장**으로 쪼갠다. 본문은 한 글자도 고치지 않는다.
//
//  - 코드블록 안의 덩어리 → 카드 한 장 (덩어리가 `제목:` + 들여쓴 하위 줄이면 그 제목을 질문에 쓴다)
//  - 코드블록 밖의 설명(자주 나오는 함정 · 기출 포인트) → 카드 한 장
//  - 섹션이 카드 한 장으로 끝나면 질문은 섹션 제목 그대로
//
// id 는 `B07-2` (섹션 7 의 둘째 카드). 쪼개기 전 id `B07` 은 `section` 으로 남겨 옛 링크·기록을 이을 수 있게 한다.

const CATEGORY_MAP = {
  'C언어': 'OS/기타',
  '연산자': 'OS/기타',
  '프로그래밍': 'OS/기타',
  '객체지향': '디자인패턴/UML',
  'DFD': '소프트웨어공학',
  'UML': '디자인패턴/UML',
  '데이터 모델': '데이터베이스',
  '함수적 종속': '데이터베이스',
  '인덱스': '데이터베이스',
  '연계': '소프트웨어공학',
  '서버': '소프트웨어공학',
  'UI': '소프트웨어공학',
  '테스트': '테스트',
  '화이트박스': '테스트',
  '소스코드': '소프트웨어공학',
  '비용': '소프트웨어공학',
  'DoS': '보안/네트워크',
  '보안': '보안/네트워크',
  '암호화': '보안/네트워크',
  'OS': 'OS/기타',
  '관계 DB': '데이터베이스',
  '네트워크': '보안/네트워크',
  '패키징': '소프트웨어공학',
  '기출': 'OS/기타',
};

const TITLE_MAX = 40;

/** 코드블록 안 덩어리 앞의 공통 들여쓰기를 걷는다 */
function dedent(text) {
  const lines = text.split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n');
}

const strip = (line) => line.replace(/^[★□\s]+/, '').trim();

/**
 * 덩어리의 제목.
 *  - 맨 윗줄이 `제목:` 로 끝나면 그 줄이 제목이다 (아래 줄은 그 제목의 내용).
 *  - 같은 층 줄이 하나뿐이고 `제목: 설명` 꼴이면 콜론 앞이 제목이다. 설명 안에 콜론이 또 있으면(한 줄에 항목 둘)
 *    어느 한쪽이 전체를 대표할 수 없으니 제목이 없는 덩어리로 본다.
 *  - 그 밖에 같은 층에 줄이 여럿(항목 나열)이면 제목이 없다 — 맨 윗줄 항목 하나가 전체를 대표하면 안 된다.
 */
function groupTitle(block) {
  const lines = block.split('\n').filter((l) => l.trim());
  const first = strip(lines[0]);
  if (first.endsWith(':') && first.length - 1 <= TITLE_MAX) return first.slice(0, -1).trim();
  const top = lines.filter((l) => !/^\s/.test(l));
  if (top.length !== 1) return null;
  const colon = first.indexOf(':');
  if (colon <= 0 || first.indexOf(':', colon + 1) >= 0) return null;
  const title = first.slice(0, colon).trim();
  return title.length <= TITLE_MAX ? title : null;
}

/** 한 줄에 항목 둘 (`ARP: … / RARP: …`) 이면 두 용어를 잇는다. 아니면 null. */
function pairLabel(block) {
  const lines = block.split('\n').filter((l) => l.trim());
  if (lines.length !== 1) return null;
  const entries = strip(lines[0]).split(/\s+\/\s+/);
  const terms = entries.map((e) => (e.indexOf(':') > 0 ? e.slice(0, e.indexOf(':')).trim() : null));
  return entries.length >= 2 && terms.every(Boolean) ? terms.join(' · ') : null;
}

/** 제목 없는 덩어리를 가르는 말: 같은 층 줄마다 콜론 앞 용어를 모은 것. 모든 줄이 `용어: 설명` 꼴이 아니면 null. */
function termLabel(block) {
  const top = block.split('\n').filter((l) => l.trim() && !/^\s/.test(l));
  const terms = top.map((l) => {
    const colon = l.indexOf(':');
    return colon > 0 && colon <= TITLE_MAX ? strip(l.slice(0, colon)) : null;
  });
  if (terms.length < 2 || terms.some((t) => !t)) return null;
  return terms.slice(0, 3).join(' · ') + (terms.length > 3 ? ' …' : '');
}

export function parseBogang(mdText) {
  const cards = [];
  const lines = mdText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    // "### 보강 N: 제목" 패턴 감지
    const match = lines[i].match(/^### 보강 (\d+):\s*(.+)/);
    if (!match) continue;

    const section = `B${match[1].padStart(2, '0')}`;
    const sectionTitle = match[2].replace(/\[.*?\]/g, '').trim();

    // 내용 수집: 다음 "### 보강" 또는 "## Part" 전까지
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^### 보강 \d+/.test(lines[j]) || /^## Part/.test(lines[j])) break;
      body.push(lines[j]);
    }
    const text = body.join('\n').replace(/^---\s*$/gm, '');

    // 코드블록 안은 빈 줄 기준 덩어리, 밖은 설명 한 덩어리
    const parts = [];
    const fence = /```[^\n]*\n([\s\S]*?)```/g;
    for (let m = fence.exec(text); m; m = fence.exec(text)) {
      for (const block of m[1].replace(/\s+$/, '').split(/\n[ \t]*\n/)) {
        if (!block.trim()) continue;
        const text2 = dedent(block.replace(/^\n+/, ''));
        parts.push({ title: groupTitle(text2), pair: pairLabel(text2), terms: termLabel(text2), body: '```\n' + text2 + '\n```' });
      }
    }
    const notes = text.replace(/```[^\n]*\n[\s\S]*?```/g, '').trim();
    if (notes) {
      const heading = notes.match(/^\*\*(.+?)\*\*/)?.[1].replace(/[:：]\s*$/, '').trim();
      parts.push({ title: heading ?? '보충 설명', body: notes });
    }
    if (parts.length === 0) parts.push({ title: null, body: '' });

    // 카테고리 결정
    let category = 'OS/기타';
    for (const [keyword, cat] of Object.entries(CATEGORY_MAP)) {
      if (sectionTitle.includes(keyword)) {
        category = cat;
        break;
      }
    }

    // 제목 없는 덩어리는 용어 나열(`A · B`)로 가르고, 그것도 안 되는 덩어리가 둘 이상일 때만 (1) (2) 를 붙인다
    const untitled = parts.filter((p) => !p.title && !p.pair).length;
    const labelOf = (p) => (p.title ? p.title : p.pair ? p.pair : untitled > 1 ? p.terms : null);
    const ordinal = parts.filter((p) => !labelOf(p)).length > 1;
    let ordinalSeen = 0;
    parts.forEach((part, k) => {
      let label = '';
      if (parts.length > 1) {
        const named = labelOf(part);
        if (named) label = ` — ${named}`;
        else if (ordinal) label = ` (${++ordinalSeen})`;
      }
      cards.push({
        id: `${section}-${k + 1}`,
        section,
        question: `[보강] ${sectionTitle}${label}`,
        answer: part.body.trim(),
        category,
      });
    });
  }

  return cards;
}
