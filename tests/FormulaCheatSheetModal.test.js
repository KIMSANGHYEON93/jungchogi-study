// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import FormulaCheatSheetModal from '../src/components/FormulaCheatSheetModal.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted = [];

function render(props, host) {
  const container = host ?? document.createElement('div');
  if (!host) document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(FormulaCheatSheetModal, props)));
  mounted.push({ root, container });
  return { container, root };
}

const key = (k, extra = {}) =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
  });

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  document.body.style.overflow = '';
  document.body.innerHTML = '';
});

describe('FormulaCheatSheetModal', () => {
  it('open 이 false 면 아무것도 렌더하지 않는다', () => {
    const { container } = render({ open: false, onClose: () => {} });
    expect(container.innerHTML).toBe('');
    expect(document.body.style.overflow).toBe('');
  });

  it('열리면 dialog 역할·aria 속성과 4개 섹션을 보여준다', () => {
    const { container } = render({ open: true, onClose: () => {} });
    const dlg = container.querySelector('[role="dialog"]');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    const title = container.querySelector(`#${dlg.getAttribute('aria-labelledby')}`);
    expect(title.textContent).toBe('공식 치트시트');
    expect(container.querySelectorAll('section.cheat-section')).toHaveLength(4);
    expect(container.querySelectorAll('.cheat-table tbody tr')).toHaveLength(15);
    expect(container.textContent).toContain('V(G) = E − N + 2');
    expect(container.querySelector('.cheat-frac-num').textContent).toBe('대기시간 + 서비스시간');
    // 시뮬레이터로 계산한 고전 예시 폴트 수
    expect(container.querySelector('.cheat-faults').textContent).toContain('FIFO 페이지 폴트 15회');
    expect(container.querySelector('.cheat-faults').textContent).toContain('LRU 페이지 폴트 12회');
  });

  it('열릴 때 닫기 버튼에 포커스하고 body 스크롤을 잠근다', () => {
    const { container } = render({ open: true, onClose: () => {} });
    expect(document.activeElement).toBe(container.querySelector('.cheat-close'));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('Esc 로 onClose 를 부른다', () => {
    let closed = 0;
    render({ open: true, onClose: () => { closed += 1; } });
    key('Escape');
    expect(closed).toBe(1);
  });

  it('배경 클릭은 닫고 모달 안쪽 클릭은 닫지 않는다', () => {
    let closed = 0;
    const { container } = render({ open: true, onClose: () => { closed += 1; } });
    act(() => container.querySelector('.cheat-modal').click());
    expect(closed).toBe(0);
    act(() => container.querySelector('.cheat-backdrop').click());
    expect(closed).toBe(1);
  });

  it('닫기 버튼으로 onClose 를 부른다', () => {
    let closed = 0;
    const { container } = render({ open: true, onClose: () => { closed += 1; } });
    act(() => container.querySelector('.cheat-close').click());
    expect(closed).toBe(1);
  });

  it('Tab 이 모달 밖으로 새지 않는다', () => {
    const { container } = render({ open: true, onClose: () => {} });
    const close = container.querySelector('.cheat-close');
    // 포커스 가능한 요소가 닫기 버튼 하나뿐 — Tab/Shift+Tab 모두 제자리로 돌아온다
    key('Tab');
    expect(document.activeElement).toBe(close);
    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(close);
    // 밖으로 나가 있어도 Tab 은 안으로 데려온다
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    key('Tab');
    expect(document.activeElement).toBe(close);
  });

  it('닫히면 body overflow 와 이전 포커스를 복원한다', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    document.body.style.overflow = 'scroll';

    const host = document.createElement('div');
    document.body.appendChild(host);
    const { root } = render({ open: true, onClose: () => {} }, host);
    expect(document.body.style.overflow).toBe('hidden');

    act(() => root.render(createElement(FormulaCheatSheetModal, { open: false, onClose: () => {} })));
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.activeElement).toBe(trigger);
  });

  it('열린 채 언마운트돼도 overflow 를 복원한다', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { root } = render({ open: true, onClose: () => {} }, host);
    act(() => root.unmount());
    mounted = [];
    host.remove();
    expect(document.body.style.overflow).toBe('');
  });
});
