// @vitest-environment jsdom
//
// 학습 노트 하단 "학습 완료 체크리스트" — 조작 · 저장 · 새로고침 복원 · 로드맵 완료와 분리.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import StudyPage from '../src/pages/StudyPage.jsx';
import { ThemeProvider } from '../src/hooks/useTheme.js';
import { checklistItemsOf, normalizeItemText, setChecklistItem, getChecklist } from '../src/utils/studyChecklist.js';
import { isValidValue, mergeValue } from '../src/utils/backup.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DAY3 = readFileSync(resolve(process.cwd(), 'public/data/정처기_Day03_Python_SQL.md'), 'utf-8');
const FILE = '정처기_Day03_Python_SQL.md';

function render(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    createElement(ThemeProvider, { value: { theme: 'light', toggle: () => {} } },
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(StudyPage))),
  ));
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const boxes = (c) => [...c.querySelectorAll('li.md-check-item input[type="checkbox"]')];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(DAY3, { status: 200 }))));
  window.scrollTo = () => {};
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('학습 노트 체크리스트', () => {
  it('체크박스가 비활성이 아니고, 누르면 저장되며 새로고침 뒤 복원된다', async () => {
    let r = render('/study?day=3');
    await flush();
    const list = boxes(r.container);
    const items = [...new Set(checklistItemsOf(DAY3))];
    expect(list.length).toBe(items.length);
    expect(list.every((b) => !b.disabled)).toBe(true);
    expect(r.container.textContent).toContain(`0/${items.length}`);

    await act(async () => { list[0].click(); });
    expect(boxes(r.container)[0].checked).toBe(true);
    expect(r.container.textContent).toContain(`1/${items.length}`);
    expect(Object.keys(getChecklist(FILE))).toEqual([items[0]]);
    r.unmount();

    r = render('/study?day=3');
    await flush();
    expect(boxes(r.container)[0].checked).toBe(true);
    expect(boxes(r.container)[1].checked).toBe(false);

    // 다시 누르면 꺼지고 저장값에서 빠진다
    await act(async () => { boxes(r.container)[0].click(); });
    expect(getChecklist(FILE)).toEqual({});
    r.unmount();
  });

  it('체크리스트를 다 채워도 로드맵 일차 완료는 바뀌지 않는다', async () => {
    const r = render('/study?day=3');
    await flush();
    for (const b of boxes(r.container)) await act(async () => { b.click(); });
    expect(localStorage.getItem('jungchogi_roadmap_checks')).toBeNull();
    expect(r.container.textContent).toContain('정답률·이해도로 세지 않고');
    r.unmount();
  });

  it('원문의 마크다운 기호를 걷어 화면 문구와 같은 키를 만든다', () => {
    expect(normalizeItemText('핵심 암기: 슬라이싱 `[start:end]` end 미포함')).toBe('핵심 암기: 슬라이싱 [start:end] end 미포함');
    expect(normalizeItemText('**굵게**  두칸')).toBe('굵게 두칸');
  });

  it('백업: 모양 검증과 문서별 합집합', () => {
    setChecklistItem('a.md', 'x', true);
    expect(isValidValue('study_checklist', { 'a.md': { x: true } })).toBe(true);
    expect(isValidValue('study_checklist', { 'a.md': { x: 'yes' } })).toBe(false);
    expect(isValidValue('study_checklist', ['a.md'])).toBe(false);
    expect(mergeValue('study_checklist', { 'a.md': { x: true } }, { 'a.md': { y: true }, 'b.md': { z: true } }))
      .toEqual({ 'a.md': { x: true, y: true }, 'b.md': { z: true } });
  });
});
