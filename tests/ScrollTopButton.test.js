// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ScrollTopButton from '../src/components/ScrollTopButton.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let container;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(ScrollTopButton)));
}

function scrollTo(y) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  act(() => window.dispatchEvent(new Event('scroll')));
}

describe('ScrollTopButton', () => {
  it('화면 1.5배 넘게 내려가야 보이고, 누르면 맨 위로 간다', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    scrollTo(0);
    mount();
    expect(container.querySelector('button')).toBeNull();
    scrollTo(1300);
    const btn = container.querySelector('button[aria-label="맨 위로"]');
    expect(btn).not.toBeNull();
    act(() => btn.click());
    expect(spy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    scrollTo(100);
    expect(container.querySelector('button')).toBeNull();
  });
});
