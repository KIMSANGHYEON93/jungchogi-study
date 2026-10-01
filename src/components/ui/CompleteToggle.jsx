/** 학습 완료 토글. 체크박스 의미(role=checkbox 가 아닌 실제 input)를 유지해 키보드·스크린리더에 그대로 동작한다. */
export default function CompleteToggle({ done, onToggle, label = '학습 완료' }) {
  return (
    <label
      className={`tw:inline-flex tw:min-h-9 tw:cursor-pointer tw:select-none tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:px-3 tw:text-sm tw:font-medium tw:transition-colors ${
        done
          ? 'tw:border-success tw:bg-success/15 tw:text-success'
          : 'tw:border-line tw:bg-card tw:text-dim tw:hover:bg-hover'
      }`}
    >
      <input type="checkbox" checked={done} onChange={onToggle} aria-label={label} className="tw:size-4 tw:cursor-pointer tw:accent-success" />
      <span>{done ? '완료함' : '완료'}</span>
    </label>
  );
}
