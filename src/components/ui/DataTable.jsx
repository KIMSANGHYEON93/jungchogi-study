/** 샘플 표(SQL 레슨 등). null 은 NULL 로 표시하고, 좁은 화면에서는 가로로 스크롤한다. */
export default function DataTable({ name, columns, rows }) {
  return (
    <div className="tw:min-w-0">
      <p className="tw:mb-1 tw:font-mono tw:text-sm tw:font-semibold tw:text-ink">{name}</p>
      <div className="tw:overflow-x-auto tw:rounded-lg tw:border tw:border-line">
        <table className="tw:w-full tw:border-collapse tw:text-sm">
          <thead>
            <tr className="tw:bg-hover">
              {columns.map((c) => (
                <th key={c} scope="col" className="tw:px-3 tw:py-1.5 tw:text-left tw:font-semibold tw:text-ink">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="tw:border-t tw:border-line">
                {row.map((cell, j) => (
                  <td key={j} className="tw:px-3 tw:py-1.5 tw:font-mono tw:text-ink">
                    {cell === null ? <span className="tw:text-dim">NULL</span> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
