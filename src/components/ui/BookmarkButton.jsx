/** 북마크 토글 버튼. 상태는 부모가 가진다(제어 컴포넌트) — 저장은 useStudyState 가 맡는다. */
export default function BookmarkButton({ active, onToggle, label = '북마크' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`${label} ${active ? '해제' : '추가'}`}
      title={active ? '북마크 해제' : '북마크'}
      className={`tw:inline-flex tw:size-9 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg! tw:border! tw:p-0! tw:transition-colors ${
        active
          ? 'tw:border-warning tw:bg-warning/15 tw:text-warning'
          : 'tw:border-line tw:bg-card tw:text-dim tw:hover:bg-hover'
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      </svg>
    </button>
  );
}
