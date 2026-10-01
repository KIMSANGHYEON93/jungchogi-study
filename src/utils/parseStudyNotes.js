// 학습 노트(Day 문서·합격전략 등) 마크다운 → 검색용 섹션 목록.
//
// 문제 은행(parseQuiz 등)과 달리 노트는 문항 구조가 없어 제목(#~###)으로 쪼갠다.
// 코드 펜스 안의 `# 주석` 은 제목이 아니므로 펜스 안에서는 제목을 인식하지 않는다.

const HEADING = /^(#{1,3})\s+(.+?)\s*$/;

/**
 * @param {string} mdText
 * @param {number} fileIdx STUDY_FILES 인덱스 — 결과에서 노트 화면으로 되돌아갈 때 쓴다
 * @returns {{id: string, fileIdx: number, heading: string, text: string}[]}
 */
export function parseStudyNotes(mdText, fileIdx) {
  const sections = [];
  let heading = '';
  let body = [];
  let inFence = false;

  const flush = () => {
    const text = body.join('\n').trim();
    if (heading || text) {
      sections.push({ id: `${fileIdx}-${sections.length}`, fileIdx, heading: heading || '(서문)', text });
    }
    body = [];
  };

  for (const line of String(mdText ?? '').split(/\r?\n/)) {
    if (line.startsWith('```')) inFence = !inFence;
    const m = !inFence && HEADING.exec(line);
    if (m) {
      flush();
      heading = m[2].replace(/[*_`]/g, '');
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * 검색어 주변 발췌. 첫 키워드가 처음 나오는 곳을 가운데 두고 앞뒤를 자른다.
 * @param {string} text
 * @param {string[]} keywords 소문자 키워드
 * @param {number} [radius]
 */
export function makeSnippet(text, keywords, radius = 80) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const hit = keywords.map((k) => lower.indexOf(k)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (hit === undefined) return flat.slice(0, radius * 2) + (flat.length > radius * 2 ? '…' : '');
  const start = Math.max(0, hit - radius);
  const end = Math.min(flat.length, hit + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}
