import { useEffect, useState } from 'react';
import Icon from './Icon';

/** 화면 높이의 몇 배만큼 내려가면 버튼을 띄울지 — 짧은 화면에서는 보이지 않게 한다 */
const SHOW_AFTER_SCREENS = 1.5;

/**
 * 맨 위로 — 학습 노트(약 1만 px) · 로드맵처럼 긴 화면에서 손가락으로 한참 올려야 하던 것을 한 번에.
 * 휴대폰에서는 하단 탭바 바로 위, 데스크톱에서는 '공식' 버튼 위에 뜬다.
 */
export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight * SHOW_AFTER_SCREENS);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  if (!visible) return null;
  return (
    <button type="button" className="scroll-top-button" aria-label="맨 위로" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <Icon name="chevron-up" size={20} />
    </button>
  );
}
