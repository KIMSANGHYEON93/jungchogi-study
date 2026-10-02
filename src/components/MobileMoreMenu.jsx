import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { useThemeContext } from '../hooks/useTheme';

/**
 * 모바일 하단 탭에 다 못 담은 화면들. `match` 는 그 화면에 속한 경로 접두사(레슨은 로드맵에 속한다)라
 * 해당 화면에 있으면 "더보기" 탭이 활성 표시된다.
 */
const MORE_ITEMS = [
  { to: '/roadmap', label: '로드맵', icon: 'calendar', match: ['/roadmap', '/lesson'] },
  { to: '/bookmarks', label: '북마크', icon: 'bookmark', match: ['/bookmarks'] },
  { to: '/practice', label: '실기연습', icon: 'terminal', match: ['/practice'] },
  { to: '/guide', label: '영역안내', icon: 'target', match: ['/guide'] },
  { to: '/search', label: '검색', icon: 'search', match: ['/search'] },
];

const inScope = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * 하단 탭의 "더보기" — 눌러서 열고, 바깥을 누르거나 Esc 를 누르거나 화면을 고르면 닫힌다.
 * 열려 있는 동안만 키 입력을 듣고, 닫을 때 포커스를 "더보기" 버튼으로 돌려준다.
 */
export default function MobileMoreMenu({ onOpenCheatSheet }) {
  const { theme, toggle } = useThemeContext();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const active = MORE_ITEMS.some((item) => item.match.some((m) => inScope(pathname, m)));

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`mobile-more-button${active ? ' active' : ''}${open ? ' open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-more-sheet"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tab-icon"><Icon name="more" size={20} /></span>
        <span className="tab-label">더보기</span>
      </button>

      {open ? (
        <>
          <div className="mobile-more-overlay" onClick={close} aria-hidden="true" />
          <div id="mobile-more-sheet" className="mobile-more-sheet" role="dialog" aria-label="더보기">
            <ul className="mobile-more-list">
              {MORE_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={() => (item.match.some((m) => inScope(pathname, m)) ? 'active' : '')} onClick={close}>
                    <Icon name={item.icon} size={20} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mobile-more-actions">
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  close();
                  onOpenCheatSheet?.();
                }}
              >
                공식 치트시트
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={toggle}
                aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              >
                {theme === 'dark' ? '라이트 모드' : '다크 모드'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
