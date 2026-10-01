const cache = new Map();

/** 테스트에서 캐시를 비운다 — 앞선 테스트가 받아 둔 문서가 요청 자체를 없애지 않도록 */
export function clearMarkdownCache() {
  cache.clear();
}

export function fetchMarkdown(file) {
  if (cache.has(file)) {
    return Promise.resolve(cache.get(file));
  }
  return fetch(`/data/${file}`)
    .then((r) => r.text())
    .then((text) => {
      cache.set(file, text);
      return text;
    });
}
