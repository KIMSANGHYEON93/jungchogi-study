/** 코드 + (선택) 실행 결과. 모바일에서는 가로 스크롤로 줄바꿈 없이 보여 들여쓰기를 지킨다. */
export default function CodeBlock({ code, lang, output }) {
  return (
    <figure className="tw:m-0 tw:overflow-hidden tw:rounded-lg tw:border tw:border-line">
      <pre
        tabIndex={0}
        aria-label={lang ? `${lang} 코드` : '코드'}
        className="tw:m-0 tw:overflow-x-auto tw:bg-code tw:p-3 tw:font-mono tw:text-[13px] tw:leading-relaxed tw:text-ink"
      >
        <code>{code}</code>
      </pre>
      {output ? (
        <figcaption className="tw:flex tw:flex-wrap tw:items-baseline tw:gap-2 tw:border-t tw:border-line tw:bg-card tw:px-3 tw:py-2 tw:text-sm">
          <span className="tw:font-semibold tw:text-success">실행 결과</span>
          <code className="tw:font-mono tw:whitespace-pre-wrap tw:text-ink">{output}</code>
        </figcaption>
      ) : null}
    </figure>
  );
}
