// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import StudyPage from '../src/pages/StudyPage.jsx';
import { saveProgress, setExamDate } from '../src/utils/storage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 9, 1, 12, 0, 0); // 2026-10-01

function render(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(StudyPage))));
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const active = (c) => c.querySelector('.sidebar-item.active')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  setExamDate('2026-10-25');
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('# 문서\n본문', { status: 200 }))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('학습 노트 예정일 배너', () => {
  it('Day 01 은 오늘(10/1) 배정으로 보인다', async () => {
    const { container, unmount } = render('/study');
    await flush();
    const note = container.querySelector('.study-planned').textContent;
    expect(note).toContain('예정일 10/1(목)');
    expect(note).toContain('D-24');
    expect(note).toContain('2026.10.25');
    unmount();
  });

  it('완료한 Day 는 완료로 표시한다', async () => {
    saveProgress('day_checks', { 1: true });
    const { container, unmount } = render('/study');
    await flush();
    expect(container.querySelector('.study-planned').textContent).toContain('완료한 Day');
    unmount();
  });

  it('Day 가 아닌 문서(보강·합격전략)에는 배너가 없다', async () => {
    const { container, unmount } = render('/study?doc=17');
    await flush();
    expect(container.querySelector('.study-planned')).toBeNull();
    unmount();
  });
});

describe('학습 노트 딥링크', () => {
  it('?doc=N 은 해당 문서를 연다', async () => {
    const { container, unmount } = render('/study?doc=17');
    await flush();
    expect(active(container)).toContain('합격 전략');
    unmount();
  });

  it('?day=N 은 그대로 Day N 을 연다 (doc 가 없을 때 첫 문서로 새지 않는다)', async () => {
    const { container, unmount } = render('/study?day=6');
    await flush();
    expect(active(container)).toContain('Day 06');
    unmount();
  });

  it('범위를 벗어난 doc 는 무시하고 day 규칙으로 떨어진다', async () => {
    const { container, unmount } = render('/study?doc=99&day=3');
    await flush();
    expect(active(container)).toContain('Day 03');
    unmount();
  });
});
