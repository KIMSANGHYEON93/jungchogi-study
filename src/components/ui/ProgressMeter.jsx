/** 가로 진행 막대 — percent 는 0~100 으로 잘라서 쓴다. */
export default function ProgressMeter({ percent, label, children }) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return (
    <div className="tw:flex tw:flex-col tw:gap-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p}
        className="tw:h-2 tw:w-full tw:overflow-hidden tw:rounded-full tw:bg-hover"
      >
        <div className="tw:h-full tw:rounded-full tw:bg-primary tw:transition-[width]" style={{ width: `${p}%` }} />
      </div>
      {children ? <p className="tw:text-xs tw:text-dim">{children}</p> : null}
    </div>
  );
}
