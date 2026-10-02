import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BOOKMARK_TYPE,
  BOOKMARK_TYPE_LABEL,
  BOOKMARK_TYPE_ORDER,
  bookmarkLink,
  docName,
} from '../domain/bookmarks';
import { lessonById } from '../domain/lessons';
import useStudyState from '../hooks/useStudyState';
import { fetchMarkdown } from '../utils/mdCache';
import { parseBogang } from '../utils/parseBogang';
import { parseCodeDrill } from '../utils/parseCodeDrill';
import { parseQuiz } from '../utils/parseQuiz';

const card = 'tw:rounded-xl tw:border tw:border-line tw:bg-card';

// 문제 제목은 원본 md 에서 읽는다 — 북마크에는 id 만 저장하므로 원문이 바뀌어도 어긋나지 않는다.
const SOURCES = {
  [BOOKMARK_TYPE.QUIZ100]: { file: '정처기_단답형_100선.md', pick: (md) => parseQuiz(md).map((q) => [q.id, q.question]) },
  [BOOKMARK_TYPE.BOGANG]: {
    file: '정처기_보강_기출분석_암기119선.md',
    // 쪼개기 전 섹션 id(`B07`)로 한 북마크도 첫 카드의 제목으로 보여 준다
    pick: (md) => {
      const cards = parseBogang(md);
      return [...cards.map((q) => [q.id, q.question]), ...cards.filter((q) => q.id.endsWith('-1')).map((q) => [q.section, q.question])];
    },
  },
  [BOOKMARK_TYPE.CODE_DRILL]: { file: '정처기_코드트레이싱_드릴.md', pick: (md) => parseCodeDrill(md).map((q) => [q.id, q.title]) },
};

/** 종류별 {id: 제목}. 불러오는 중이면 키가 없고(undefined), 받기에 실패했으면 null. */
function useTitles(types) {
  const [titles, setTitles] = useState({});
  const needed = [...types].filter((t) => SOURCES[t]).sort().join(',');
  useEffect(() => {
    let cancelled = false;
    for (const type of needed ? needed.split(',') : []) {
      fetchMarkdown(SOURCES[type].file)
        .then((md) => {
          if (!cancelled) setTitles((prev) => ({ ...prev, [type]: Object.fromEntries(SOURCES[type].pick(md)) }));
        })
        .catch(() => {
          if (!cancelled) setTitles((prev) => ({ ...prev, [type]: null })); // 못 읽어도 id 로는 보여 준다
        });
    }
    return () => {
      cancelled = true;
    };
  }, [needed]);
  return titles;
}

function titleOf(entry, titles) {
  if (entry.type === BOOKMARK_TYPE.LESSON) return lessonById(entry.id)?.title ?? null;
  if (entry.type === BOOKMARK_TYPE.DOC) return docName(entry.id);
  const loaded = titles[entry.type];
  if (loaded === undefined) return undefined; // 아직 불러오는 중
  if (loaded === null) return entry.id; // 자료를 못 받았다 — 링크는 살리고 id 만 보여 준다
  const t = loaded[entry.id];
  return t ? `${entry.id}. ${t}` : null;
}

export default function BookmarksPage() {
  const study = useStudyState();
  const [filter, setFilter] = useState('all');
  const entries = study.bookmarkEntries;
  const titles = useTitles(useMemo(() => new Set(entries.map((e) => e.type)), [entries]));

  const counts = useMemo(() => {
    const c = {};
    for (const e of entries) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  }, [entries]);
  const shown = filter === 'all' ? entries : entries.filter((e) => e.type === filter);
  const types = BOOKMARK_TYPE_ORDER.filter((t) => counts[t]);

  return (
    <div className="page">
      <div className="tw:mx-auto tw:flex tw:max-w-3xl tw:flex-col tw:gap-4">
        <header>
          <h1>북마크</h1>
          <p className="subtitle">레슨 · 플래시카드 · 코드 퀴즈 · 학습 노트에서 북마크한 항목을 모아 봅니다. 총 {entries.length}개</p>
        </header>

        {study.saveFailed ? (
          <p role="alert" className="tw:rounded-lg tw:border tw:border-warning tw:bg-warning/10 tw:p-3 tw:text-sm tw:text-ink">
            브라우저 저장소에 기록하지 못했습니다. 새로고침하면 사라질 수 있어요.
          </p>
        ) : null}

        {entries.length === 0 ? (
          <p className={`${card} tw:border-dashed tw:p-6 tw:text-center tw:text-sm tw:text-dim`}>
            아직 북마크가 없습니다. 레슨 · 카드 · 문제 · 학습 노트의 북마크 버튼으로 추가해 보세요.
          </p>
        ) : (
          <>
            <div className="filter-bar" role="group" aria-label="종류 필터">
              <button className={`btn-outline ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                전체 {entries.length}
              </button>
              {types.map((t) => (
                <button key={t} className={`btn-outline ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>
                  {BOOKMARK_TYPE_LABEL[t]} {counts[t]}
                </button>
              ))}
            </div>

            <ul className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0">
              {shown.map((e) => {
                const title = titleOf(e, titles);
                const to = bookmarkLink(e);
                return (
                  <li key={`${e.type}:${e.id}`} className={`${card} tw:flex tw:items-center tw:gap-3 tw:p-3`}>
                    <span className="tw:shrink-0 tw:rounded-md tw:bg-hover tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-dim">
                      {BOOKMARK_TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    <div className="tw:min-w-0 tw:flex-1">
                      {to && title !== null ? (
                        <Link to={to} className="tw:break-words tw:font-medium">
                          {title ?? '불러오는 중…'}
                        </Link>
                      ) : (
                        <span className="tw:break-words tw:text-dim">
                          {e.id} <span className="tw:text-xs">(자료를 찾을 수 없습니다)</span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-outline tw:shrink-0"
                      onClick={() => study.toggleBookmark(e.type, e.id)}
                      aria-label={`${BOOKMARK_TYPE_LABEL[e.type] ?? e.type} ${title ?? e.id} 북마크 해제`}
                    >
                      해제
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
