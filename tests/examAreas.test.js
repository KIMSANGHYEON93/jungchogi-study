// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GuidePage from '../src/pages/GuidePage.jsx';
import { EXAM_AREAS, EXAM_OVERVIEW, WEIGHT_NOTES } from '../src/domain/examAreas.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted = [];

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(MemoryRouter, null, createElement(GuidePage))));
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
});

describe('시험 영역 데이터', () => {
  it('출제기준 주요 항목은 1~12번 12개다', () => {
    expect(EXAM_AREAS.map((a) => a.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const a of EXAM_AREAS) {
      expect(a.name).toBeTruthy();
      expect(a.detail).toBeTruthy();
    }
  });

  it('고배점은 SQL 응용(8)·프로그래밍 언어 활용(10), 계산·이론은 응용 SW 기초(11)다', () => {
    const by = (w) => EXAM_AREAS.filter((a) => a.weight === w).map((a) => a.no);
    expect(by('core')).toEqual([8, 10]);
    expect(by('calc')).toEqual([11]);
    expect(WEIGHT_NOTES.map((n) => n.key)).toEqual(['core', 'calc']);
  });

  it('개요에 시험시간·합격기준이 있다', () => {
    const map = Object.fromEntries(EXAM_OVERVIEW.map((r) => [r.label, r.value]));
    expect(map['시험시간']).toBe('2시간 30분');
    expect(map['합격기준']).toContain('60점');
  });

  it('모든 영역의 검색어가 실제 학습 자료에서 결과를 낸다', () => {
    const dir = resolve(process.cwd(), 'public/data');
    const corpus = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => readFileSync(resolve(dir, f), 'utf-8').toLowerCase())
      .join('\n');
    for (const a of EXAM_AREAS) {
      expect(corpus.includes(a.query.toLowerCase()), `${a.no}번 "${a.query}"`).toBe(true);
    }
  });
});

describe('영역 안내 화면', () => {
  it('세 섹션과 12개 영역을 보여준다', () => {
    const c = render();
    expect(c.textContent).toContain('1. 실기시험 기본 개요');
    expect(c.textContent).toContain('2. 실기 출제기준 주요 항목 (총 12개)');
    expect(c.textContent).toContain('3. 출제 비중 및 핵심 출제 영역 안내');
    expect(c.querySelectorAll('.guide-area')).toHaveLength(12);
  });

  it('고배점·계산 영역에 비중 표시가 붙는다', () => {
    const c = render();
    expect(c.querySelectorAll('.guide-area.is-core')).toHaveLength(2);
    expect(c.querySelectorAll('.guide-area.is-calc')).toHaveLength(1);
    expect(c.textContent).toContain('약 40~50% 이상');
  });

  it('영역마다 인코딩된 검색 링크를 준다', () => {
    const c = render();
    const hrefs = [...c.querySelectorAll('a.note-link')].map((a) => a.getAttribute('href'));
    expect(hrefs).toHaveLength(12);
    expect(hrefs[7]).toBe(`/search?q=${encodeURIComponent('트리거')}`);
  });
});
