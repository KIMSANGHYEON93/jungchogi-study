// @vitest-environment jsdom
//
// 플래시카드의 문항 딥링크 (`/flashcard?id=002`).
//
// 이 화면만의 문제: **덱이 둘이다**(단답형 100선 · 암기 119선 보강).
// 계약은 `/flashcard?id=<문항 id>` 하나뿐이라 어느 덱인지는 화면이 판단해야 한다.
// 교재 id 형식이 덱마다 달라(`001` vs `B01`) 그 모양으로 가른다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FlashcardPage from '../src/pages/FlashcardPage.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const QUIZ_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/quiz-sample.md'), 'utf-8');
const BOGANG_MD = readFileSync(resolve(process.cwd(), 'tests/fixtures/bogang-sample.md'), 'utf-8');

// 픽스처: 단답형 001 · 002 · 026 (3장), 보강 B01-1~3 · B02-1~2 (5장)
function renderAt(url) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(MemoryRouter, { initialEntries: [url] }, createElement(FlashcardPage)));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

const counter = (container) => container.querySelector('.flashcard-counter')?.textContent ?? '';
const face = (container) => container.querySelector('.flashcard-face h2')?.textContent ?? '';
const notice = (container) => container.querySelector('.deep-link-notice')?.textContent ?? '';
const activeDeck = (container) => container.querySelector('.deck-btn.active')?.textContent ?? '';

function buttonByName(container, name) {
  return [...container.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label')?.includes(name) || b.textContent.includes(name)
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn((url) =>
      Promise.resolve(new Response(String(url).includes('보강') ? BOGANG_MD : QUIZ_MD, { status: 200 }))
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('지목한 카드에서 시작한다', () => {
  it('`?id=002` 는 단답형 덱의 두 번째 카드를 연다', async () => {
    const { container, unmount } = renderAt('/flashcard?id=002');
    await flush();

    expect(activeDeck(container)).toContain('단답형');
    expect(face(container)).toContain('002.');
    expect(counter(container)).toBe('2 / 3');
    expect(notice(container)).toBe('');
    unmount();
  });

  it('보강 카드 id(`B02-2`) 는 덱까지 바꿔서 연다', async () => {
    const { container, unmount } = renderAt('/flashcard?id=B02-2');
    await flush();

    expect(activeDeck(container)).toContain('보강');
    expect(face(container)).toContain('B02-2.');
    expect(counter(container)).toBe('5 / 5');
    expect(notice(container)).toBe('');
    unmount();
  });

  it('쪼개기 전 섹션 id(`B02`)는 그 섹션의 첫 카드로 열린다', async () => {
    const { container, unmount } = renderAt('/flashcard?id=B02');
    await flush();

    expect(activeDeck(container)).toContain('보강');
    expect(face(container)).toContain('B02-1.');
    expect(counter(container)).toBe('4 / 5');
    expect(notice(container)).toBe(''); // 못 찾은 것이 아니다
    unmount();
  });
});

describe('`?id=` 가 없으면 기존 동작 그대로', () => {
  it('단답형 덱 첫 카드에서 시작하고 안내도 없다', async () => {
    const { container, unmount } = renderAt('/flashcard');
    await flush();

    expect(activeDeck(container)).toContain('단답형');
    expect(counter(container)).toBe('1 / 3');
    expect(container.querySelector('.deep-link-notice')).toBeNull();
    unmount();
  });
});

describe('못 찾는 id', () => {
  it('덱 형식은 맞지만 없는 id 면 첫 카드 + 안내', async () => {
    const { container, unmount } = renderAt('/flashcard?id=999');
    await flush();

    expect(counter(container)).toBe('1 / 3');
    expect(notice(container)).toContain('999');
    expect(notice(container)).toContain('찾지 못해');
    unmount();
  });

  it('어느 덱 형식도 아닌 id 면 기본 덱 첫 카드 + 안내', async () => {
    const { container, unmount } = renderAt('/flashcard?id=C-01');
    await flush();

    expect(activeDeck(container)).toContain('단답형');
    expect(counter(container)).toBe('1 / 3');
    expect(notice(container)).toContain('C-01');
    unmount();
  });

  it('특수문자가 섞인 id 도 안내로 끝난다', async () => {
    const { container, unmount } = renderAt(`/flashcard?id=${encodeURIComponent('<script>')}`);
    await flush();

    expect(counter(container)).toBe('1 / 3');
    expect(notice(container)).toContain('찾지 못해');
    unmount();
  });
});

describe('기존 기능과의 얽힘', () => {
  it('섞기를 누르면 딥링크를 놓고 첫 카드로 간다', async () => {
    const { container, unmount } = renderAt('/flashcard?id=026');
    await flush();
    expect(counter(container)).toBe('3 / 3');

    await act(async () => { buttonByName(container, '섞기').click(); });
    expect(counter(container)).toBe('1 / 3');
    unmount();
  });

  it('카테고리를 바꾸면 딥링크를 놓고 첫 카드로 간다', async () => {
    const { container, unmount } = renderAt('/flashcard?id=026');
    await flush();
    expect(counter(container)).toBe('3 / 3');

    await act(async () => { buttonByName(container, '소프트웨어공학').click(); });
    expect(counter(container)).toBe('1 / 1');
    unmount();
  });

  it('덱을 손으로 바꾸면 그 덱 첫 카드로 간다', async () => {
    const { container, unmount } = renderAt('/flashcard?id=002');
    await flush();
    expect(counter(container)).toBe('2 / 3');

    await act(async () => { buttonByName(container, '암기 119선 보강').click(); });
    await flush();

    expect(activeDeck(container)).toContain('보강');
    expect(counter(container)).toBe('1 / 5');
    unmount();
  });

  it('딥링크는 진도를 건드리지 않는다', async () => {
    const { container, unmount } = renderAt('/flashcard?id=026');
    await flush();

    // "전체 3 · 외운 0 · 남은 3"
    const values = [...container.querySelectorAll('.stat-box .value')].map((n) => n.textContent);
    expect(values).toEqual(['3', '0', '3']);
    unmount();
  });

  it('이전/다음이 딥링크 위치에서 이어진다', async () => {
    const { container, unmount } = renderAt('/flashcard?id=002');
    await flush();

    await act(async () => { buttonByName(container, '다음 카드').click(); });
    expect(counter(container)).toBe('3 / 3');

    await act(async () => { buttonByName(container, '이전 카드').click(); });
    expect(counter(container)).toBe('2 / 3');
    unmount();
  });
});
