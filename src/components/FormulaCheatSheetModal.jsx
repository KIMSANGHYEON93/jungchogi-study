import { useEffect, useRef } from 'react';
import {
  CIDR_TABLE,
  CLASSIC_REFS,
  simulatePageReplacement,
} from '../domain/formulas';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
const EXAMPLE_FRAMES = 3;

// 예시 폴트 수는 시뮬레이터로 계산한다 — 문서에 숫자를 따로 적어 두면 코드와 어긋날 수 있다.
const PAGE_EXAMPLE = ['FIFO', 'LRU', 'LFU'].map((algorithm) => ({
  algorithm,
  faults: simulatePageReplacement(algorithm, CLASSIC_REFS, EXAMPLE_FRAMES).faults,
}));

/**
 * 필답형 공식 치트시트 모달 (서브넷·순환 복잡도·스케줄링·페이지 교체).
 *
 * @param {{open: boolean, onClose: () => void}} props
 */
export default function FormulaCheatSheetModal({ open, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  // 키 핸들러가 매 렌더의 onClose 를 쓰도록 ref 에 둔다 — 부모가 인라인 함수를 넘겨도 효과가 다시 돌지 않는다
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      // 간단한 포커스 트랩: 처음/끝에서 반대편으로 돌리고, 밖에 나가 있으면 안으로 데려온다
      const items = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="cheat-backdrop"
      onClick={(e) => {
        // 모달 안쪽 클릭이 버블링돼 올라온 경우는 무시한다
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="cheat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cheat-title"
      >
        <header className="cheat-head">
          <h2 className="cheat-title" id="cheat-title">공식 치트시트</h2>
          <button ref={closeRef} type="button" className="btn-outline cheat-close" onClick={() => onClose?.()}>
            닫기
          </button>
        </header>

        <section className="cheat-section" aria-labelledby="cheat-subnet">
          <h3 id="cheat-subnet">1. 서브넷 마스크</h3>
          <p>
            CIDR 표기 <code>/n</code> 은 IP 주소 32비트 중 앞의 n비트가 네트워크 부분이라는 뜻이다.
            예) <code>/24</code> = 255.255.255.0
          </p>
          <p className="cheat-formula">가용 호스트 수 = 2<sup>32−n</sup> − 2</p>
          <p className="cheat-note">네트워크 주소와 브로드캐스트 주소 2개를 뺀다.</p>
          <table className="cheat-table">
            <thead>
              <tr>
                <th scope="col">접두사</th>
                <th scope="col">서브넷 마스크</th>
                <th scope="col">가용 호스트 수</th>
              </tr>
            </thead>
            <tbody>
              {CIDR_TABLE.map((row) => (
                <tr key={row.prefix}>
                  <td>/{row.prefix}</td>
                  <td>{row.mask}</td>
                  <td>{row.hosts.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cheat-section" aria-labelledby="cheat-cyclomatic">
          <h3 id="cheat-cyclomatic">2. 순환 복잡도</h3>
          <p className="cheat-formula">V(G) = E − N + 2</p>
          <p className="cheat-note">E = 간선(edge) 수, N = 노드(node) 수</p>
          <p>판단(분기) 노드 수 + 1 과 같다.</p>
        </section>

        <section className="cheat-section" aria-labelledby="cheat-sched">
          <h3 id="cheat-sched">3. 스케줄링</h3>
          <div className="cheat-formula cheat-hrn">
            <span>HRN 우선순위 =</span>
            <span
              className="cheat-frac"
              role="img"
              aria-label="대기시간 더하기 서비스시간, 나누기 서비스시간"
            >
              <span className="cheat-frac-num">대기시간 + 서비스시간</span>
              <span className="cheat-frac-den">서비스시간</span>
            </span>
          </div>
          <p className="cheat-note">값이 클수록 먼저 실행한다. 오래 기다릴수록 우선순위가 올라가 SJF 의 기아 현상을 줄인다.</p>
          <ul className="cheat-list">
            <li><strong>FCFS</strong> 도착 순서대로 처리 (비선점)</li>
            <li><strong>SJF</strong> 실행 시간이 짧은 작업 먼저 (비선점)</li>
            <li><strong>RR</strong> 시간 할당량만큼씩 돌아가며 실행 (선점)</li>
          </ul>
        </section>

        <section className="cheat-section" aria-labelledby="cheat-page">
          <h3 id="cheat-page">4. 페이지 교체</h3>
          <ul className="cheat-list">
            <li><strong>FIFO</strong> 가장 먼저 들어온 페이지를 교체</li>
            <li><strong>LRU</strong> 가장 오래 사용하지 않은 페이지를 교체</li>
            <li><strong>LFU</strong> 참조 횟수가 가장 적은 페이지를 교체 (동률이면 가장 오래 적재된 것)</li>
          </ul>
          <p className="cheat-note">
            예시: 참조열 {CLASSIC_REFS.join(' ')}, 프레임 {EXAMPLE_FRAMES}개
          </p>
          <ul className="cheat-faults">
            {PAGE_EXAMPLE.map((row) => (
              <li key={row.algorithm}>
                <strong>{row.algorithm}</strong> 페이지 폴트 {row.faults}회
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
