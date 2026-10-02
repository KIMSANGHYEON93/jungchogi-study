import { Link } from 'react-router-dom';
import BookmarkButton from './BookmarkButton';

const TRACK_STYLE = {
  C: 'tw:bg-primary/15 tw:text-primary-dim',
  Java: 'tw:bg-warning/15 tw:text-warning',
  Python: 'tw:bg-success/15 tw:text-success',
  SQL: 'tw:bg-accent/15 tw:text-accent',
  OS: 'tw:bg-danger/15 tw:text-danger',
  네트워크: 'tw:bg-primary/15 tw:text-primary-dim',
  테스트: 'tw:bg-accent/15 tw:text-accent',
};

/** 레슨 목록 카드 — 제목·트랙·소요 시간·완료 표시와 북마크. 상태는 모두 props 로 받는다. */
export default function LessonCard({ lesson, done, bookmarked, onToggleBookmark }) {
  return (
    <article
      className={`tw:flex tw:items-start tw:gap-3 tw:rounded-xl tw:border tw:bg-card tw:p-4 ${
        done ? 'tw:border-success/60' : 'tw:border-line'
      }`}
    >
      <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-2">
        <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-xs">
          <span className="tw:rounded-md tw:bg-hover tw:px-2 tw:py-0.5 tw:font-semibold tw:text-dim">D-{lesson.d}</span>
          <span className={`tw:rounded-md tw:px-2 tw:py-0.5 tw:font-semibold ${TRACK_STYLE[lesson.track] ?? ''}`}>
            {lesson.track}
          </span>
          <span className="tw:text-dim">약 {lesson.minutes}분 · 퀴즈 {lesson.questions.length}문항</span>
          {done ? <span className="tw:font-semibold tw:text-success">✓ 완료</span> : null}
        </div>
        <h3 className="tw:text-base tw:font-bold tw:text-ink">
          <Link
            to={`/lesson/${lesson.d}`}
            className="tw:text-ink tw:no-underline tw:hover:text-primary tw:hover:underline"
          >
            {lesson.title}
          </Link>
        </h3>
        <p className="tw:text-sm tw:text-dim">{lesson.summary}</p>
      </div>
      <BookmarkButton active={bookmarked} onToggle={onToggleBookmark} label={`${lesson.title} 북마크`} />
    </article>
  );
}
