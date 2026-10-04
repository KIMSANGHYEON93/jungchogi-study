// @vitest-environment jsdom
// 학습 노트의 정답 블록(<details>)이 글자로 찍혀 정답이 처음부터 보이던 문제 — 접는 상자로 그리는지 확인한다.
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { splitDetails } from '../src/utils/splitDetails.js';
import MarkdownViewer from '../src/components/MarkdownViewer.jsx';
import { ThemeProvider } from '../src/hooks/useTheme.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MD = `### 문제 1

\`\`\`c
int x = 1;
\`\`\`

답:

<details><summary>정답 확인</summary>

**정답: \`7\`**

| a | b |
|---|---|
| 1 | 2 |

</details>

---

<details>

### 문제 2 정답
해설

</details>
`;

describe('splitDetails', () => {
  it('정답 블록을 따로 떼고, summary 가 없으면 기본 문구를 쓴다', () => {
    const parts = splitDetails(MD);
    expect(parts.map((p) => p.kind)).toEqual(['md', 'details', 'md', 'details', 'md']);
    expect(parts[1].summary).toBe('정답 확인');
    expect(parts[1].text).toContain('**정답: `7`**');
    expect(parts[3].summary).toBe('정답 · 해설 보기');
  });

  it('정답 블록이 없으면 본문 하나 그대로', () => {
    expect(splitDetails('# 제목\n본문')).toEqual([{ kind: 'md', text: '# 제목\n본문' }]);
    expect(splitDetails('')).toEqual([]);
  });
});

describe('MarkdownViewer', () => {
  let root, container;
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('정답은 접힌 상자 안에 있고, 태그가 글자로 찍히지 않으며, 안의 표 · 강조도 그려진다', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(createElement(ThemeProvider, { value: { theme: 'light', toggle: () => {} } }, createElement(MarkdownViewer, { content: MD }))));

    const boxes = container.querySelectorAll('details.md-answer');
    expect(boxes).toHaveLength(2);
    expect([...boxes].every((d) => !d.open)).toBe(true);
    expect(boxes[0].querySelector('summary').textContent).toBe('정답 확인');
    expect(boxes[0].querySelector('table')).not.toBeNull();
    expect(boxes[0].querySelector('strong').textContent).toContain('정답');
    expect(container.textContent).not.toContain('<details>');
    expect(container.textContent).not.toContain('<summary>');
  });
});
