// @vitest-environment jsdom
//
// 북마크: 종류별 경로 해석, 북마크 화면, 그리고 카드·문제·학습 노트 화면의 북마크 버튼.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BookmarksPage from '../src/pages/BookmarksPage.jsx';
import FlashcardPage from '../src/pages/FlashcardPage.jsx';
import QuizPage from '../src/pages/QuizPage.jsx';
import StudyPage from '../src/pages/StudyPage.jsx';
import { BOOKMARK_TYPE, bookmarkLink, docName } from '../src/domain/bookmarks.js';
import { resetStudyState } from '../src/utils/studyState.js';
import { clearMarkdownCache } from '../src/utils/mdCache.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fx = (name) => readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf-8');
const QUIZ_MD = fx('quiz-sample.md');
const BOGANG_MD = fx('bogang-sample.md');
const DRILL_MD = fx('code-drill-sample.md');
const DAY1 = '정처기_Day01_C언어.md';

const stored = () => JSON.parse(localStorage.getItem('jungchogi_bookmarks') ?? '{}');
const seed = (map) => localStorage.setItem('jungchogi_bookmarks', JSON.stringify(map));

let mounted = [];
function render(Page, url = '/') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, { initialEntries: [url] }, createElement(Page))));
  mounted.push({ root, container });
  return container;
}
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
const click = (el) => act(() => el.click());
const byLabel = (c, text) => [...c.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.includes(text));
const byText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.includes(text));

beforeEach(() => {
  localStorage.clear();
  resetStudyState();
  clearMarkdownCache();
  vi.stubGlobal(
    'fetch',
    vi.fn((url) => {
      const u = decodeURIComponent(String(url));
      const body = u.includes('드릴') ? DRILL_MD : u.includes('보강') ? BOGANG_MD : u.includes('단답형') ? QUIZ_MD : '# 문서\n본문';
      return Promise.resolve(new Response(body, { status: 200 }));
    })
  );
});
afterEach(() => {
  for (const { root, container } of mounted) { act(() => root.unmount()); container.remove(); }
  mounted = [];
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('bookmarkLink', () => {
  it('종류마다 그 화면의 딥링크로 간다', () => {
    expect(bookmarkLink({ type: 'lesson', id: 'c-operators' })).toBe('/lesson/24');
    expect(bookmarkLink({ type: 'quiz100', id: '001' })).toBe('/flashcard?id=001');
    expect(bookmarkLink({ type: 'bogang', id: 'B01-2' })).toBe('/flashcard?id=B01-2');
    expect(bookmarkLink({ type: 'codeDrill', id: 'C-01' })).toBe('/quiz?id=C-01');
    expect(bookmarkLink({ type: 'doc', id: DAY1 })).toBe('/study?doc=0');
  });

  it('사라진 레슨·문서나 모르는 종류는 null', () => {
    expect(bookmarkLink({ type: 'lesson', id: 'gone' })).toBeNull();
    expect(bookmarkLink({ type: 'doc', id: 'gone.md' })).toBeNull();
    expect(bookmarkLink({ type: 'weird', id: 'x' })).toBeNull();
    expect(docName(DAY1)).toBe('Day 01 — C언어');
    expect(Object.values(BOOKMARK_TYPE)).toHaveLength(5);
  });
});

describe('북마크 화면', () => {
  it('비어 있으면 안내를 보여준다', () => {
    const c = render(BookmarksPage);
    expect(c.textContent).toContain('아직 북마크가 없습니다');
    expect(c.querySelector('ul')).toBeNull();
  });

  it('종류별 제목과 이동 링크, 개수를 보여주고 찾을 수 없는 항목은 링크 없이 표시한다', async () => {
    seed({
      'lesson:c-operators': 50, 'quiz100:001': 40, 'codeDrill:C-01': 30, 'doc:정처기_Day01_C언어.md': 20,
      'lesson:gone': 10, 'quiz100:999': 5,
    });
    const c = render(BookmarksPage);
    await flush();
    const links = [...c.querySelectorAll('li a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['C언어 연산자', '/lesson/24'],
      ['001. 트랜잭션의 4가지 특성(ACID)을 쓰시오.', '/flashcard?id=001'],
      ['C-01. 포인터 기본', '/quiz?id=C-01'],
      ['Day 01 — C언어', '/study?doc=0'],
    ]);
    const lis = [...c.querySelectorAll('li')];
    expect(lis).toHaveLength(6);
    expect(lis[4].textContent).toContain('자료를 찾을 수 없습니다'); // lesson:gone
    expect(lis[4].querySelector('a')).toBeNull();
    expect(lis[5].textContent).toContain('자료를 찾을 수 없습니다'); // quiz100:999
    expect(c.textContent).toContain('총 6개');
  });

  it('종류 필터와 해제 버튼이 동작하고 저장에 반영된다', async () => {
    seed({ 'lesson:c-operators': 50, 'quiz100:001': 40, 'quiz100:002': 30 });
    const c = render(BookmarksPage);
    await flush();
    click(byText(c, '단답형 100선'));
    expect([...c.querySelectorAll('li')]).toHaveLength(2);
    click(byLabel(c, '001. 트랜잭션'));
    expect(stored()).toEqual({ 'lesson:c-operators': 50, 'quiz100:002': 30 });
    expect([...c.querySelectorAll('li')]).toHaveLength(1);
    click(byText(c, '전체'));
    expect([...c.querySelectorAll('li')]).toHaveLength(2);
  });

  it('자료를 못 받아도 id 로는 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    seed({ 'quiz100:001': 40 });
    const c = render(BookmarksPage);
    await flush();
    const a = c.querySelector('li a');
    expect(a.textContent).toBe('001');
    expect(a.getAttribute('href')).toBe('/flashcard?id=001');
  });
});

describe('각 화면의 북마크 버튼', () => {
  it('플래시카드: 카드를 북마크하고 "북마크만"으로 걸러 본다', async () => {
    const c = render(FlashcardPage, '/flashcard');
    await flush();
    const btn = byLabel(c, '001번 카드 북마크');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    click(btn);
    expect(Object.keys(stored())).toEqual(['quiz100:001']);

    click(byText(c, '북마크만'));
    expect(c.querySelector('.flashcard-counter').textContent).toBe('1 / 1');
    expect(c.querySelector('.flashcard-face h2').textContent).toContain('001.');

    click(byLabel(c, '001번 카드 북마크')); // 해제하면 목록이 비고 안내가 나온다
    expect(c.textContent).toContain('북마크한 카드가 없습니다');
    expect(stored()).toEqual({});
  });

  it('플래시카드: 덱마다 종류가 다르다 (암기 119선은 bogang)', async () => {
    const c = render(FlashcardPage, '/flashcard?id=B01-2');
    await flush();
    click(byLabel(c, 'B01-2번 카드 북마크'));
    expect(Object.keys(stored())).toEqual(['bogang:B01-2']);
  });

  it('코드 퀴즈: 문제를 북마크한다', async () => {
    const c = render(QuizPage, '/quiz?id=J-01');
    await flush();
    click(byLabel(c, 'J-01 문제 북마크'));
    expect(Object.keys(stored())).toEqual(['codeDrill:J-01']);
    expect(byLabel(c, 'J-01 문제 북마크').getAttribute('aria-pressed')).toBe('true');
  });

  it('학습 노트: 문서를 북마크한다', async () => {
    const c = render(StudyPage, '/study?doc=1');
    await flush();
    click(byLabel(c, 'Day 02 — Java 북마크'));
    expect(Object.keys(stored())).toEqual(['doc:정처기_Day02_Java.md']);
  });

  it('북마크 화면에서 해제하면 원래 화면의 버튼도 해제 상태다 (같은 저장소)', async () => {
    seed({ 'quiz100:001': 1 });
    const page = render(BookmarksPage);
    const card = render(FlashcardPage, '/flashcard');
    await flush();
    expect(byLabel(card, '001번 카드 북마크').getAttribute('aria-pressed')).toBe('true');
    click(byLabel(page, '해제'));
    expect(byLabel(card, '001번 카드 북마크').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('북마크 화면 — 암기 119선 카드', () => {
  it('카드 단위 id 는 카드 제목으로, 쪼개기 전 섹션 id(B02)는 첫 카드 제목으로 보여준다', async () => {
    seed({ 'bogang:B01-2': 20, 'bogang:B02': 10 });
    const c = render(BookmarksPage);
    await flush();
    expect([...c.querySelectorAll('li a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['B01-2. [보강] C언어 서식문자열 & 제어문자 — 제어문자', '/flashcard?id=B01-2'],
      ['B02. [보강] 연산자 우선순위', '/flashcard?id=B02'],
    ]);
  });
});
