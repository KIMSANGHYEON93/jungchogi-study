// 학습 자료의 정답은 `<details><summary>정답</summary> … </details>` 로 감싸 두었다.
// ReactMarkdown 은 안전을 위해 HTML 을 그리지 않으므로 이 태그가 글자로 찍히고 정답이 처음부터 다 보였다.
// HTML 을 통째로 허용(rehype-raw)하지 않고, 이 한 가지 형식만 골라 접는 상자로 바꾼다.
const DETAILS = /<details>\s*(?:<summary>([\s\S]*?)<\/summary>)?([\s\S]*?)<\/details>/g;
const DEFAULT_SUMMARY = '정답 · 해설 보기';

/**
 * 본문을 일반 마크다운 조각과 접는 정답 조각으로 나눈다.
 * @param {string} text
 * @returns {({kind: 'md', text: string} | {kind: 'details', summary: string, text: string})[]}
 */
export function splitDetails(text) {
  const parts = [];
  let last = 0;
  for (const m of String(text ?? '').matchAll(DETAILS)) {
    if (m.index > last) parts.push({ kind: 'md', text: text.slice(last, m.index) });
    parts.push({ kind: 'details', summary: (m[1] ?? '').trim() || DEFAULT_SUMMARY, text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < String(text ?? '').length) parts.push({ kind: 'md', text: text.slice(last) });
  return parts;
}
