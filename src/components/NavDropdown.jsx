import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * 상단 내비게이션의 드롭다운 메뉴 하나.
 *
 * 메뉴 패턴(role="menu") 대신 **공개/숨김 패턴**(버튼 + aria-expanded + 링크 목록)을 쓴다.
 * 안에 든 것이 링크라 Tab 으로 그대로 오갈 수 있고, 화살표 키 관리를 따로 만들 필요가 없다.
 *
 * 열림 상태는 `Navbar` 가 갖는다 — 한 번에 하나만 열려야 하기 때문이다.
 *
 * @param {{
 *   id: string, label: string, items: {to: string, label: string}[],
 *   open: boolean, onToggle: (id: string) => void, onClose: () => void
 * }} props
 */
export default function NavDropdown({ id, label, items, open, onToggle, onClose }) {
  const { pathname } = useLocation();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const active = items.some((item) => item.to === pathname);

  // 열려 있는 동안에만 바깥 클릭·Esc 를 듣는다
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      onClose();
      // 닫은 뒤에는 키보드 사용자가 있던 자리(토글 버튼)로 돌려보낸다
      buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="nav-dropdown" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`nav-dropdown-toggle${active ? ' active' : ''}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={`nav-menu-${id}`}
        onClick={() => onToggle(id)}
      >
        {label} <span className="nav-dropdown-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul id={`nav-menu-${id}`} className="nav-dropdown-menu">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} onClick={onClose}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
