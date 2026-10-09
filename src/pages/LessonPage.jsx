import { Link, useParams } from 'react-router-dom';
import BookmarkButton from '../components/ui/BookmarkButton';
import CodeBlock from '../components/ui/CodeBlock';
import CompleteToggle from '../components/ui/CompleteToggle';
import DataTable from '../components/ui/DataTable';
import QuizItem from '../components/ui/QuizItem';
import { BOOKMARK_TYPE } from '../domain/bookmarks';
import { LESSONS, lessonByDay } from '../domain/lessons';
import useStudyState from '../hooks/useStudyState';
import { TOPIC_MINUTES } from '../domain/studyTime';

const card = 'tw:rounded-xl tw:border tw:border-line tw:bg-card tw:p-4 tw:sm:p-5';
const h2 = 'tw:mb-3 tw:text-lg tw:font-bold tw:text-ink';

export default function LessonPage() {
  const { d } = useParams();
  const lesson = lessonByDay(d);
  const study = useStudyState();

  if (!lesson) {
    return (
      <div className="page">
        <h1>레슨을 찾을 수 없습니다</h1>
        <p className="subtitle">
          아직 준비된 레슨은 D-{LESSONS.map((l) => l.d).join(' · D-')} 입니다. <Link to="/roadmap">로드맵으로 돌아가기</Link>
        </p>
      </div>
    );
  }

  const idx = LESSONS.findIndex((l) => l.id === lesson.id);
  const prev = LESSONS[idx - 1];
  const next = LESSONS[idx + 1];
  const done = study.isDone(lesson.d);

  return (
    <div className="page">
      <div className="tw:mx-auto tw:flex tw:max-w-3xl tw:flex-col tw:gap-4">
        <Link to="/roadmap" className="note-link">
          ← 25일 로드맵
        </Link>

        <header className="tw:flex tw:flex-col tw:gap-3 tw:sm:flex-row tw:sm:items-start tw:sm:justify-between">
          <div className="tw:min-w-0">
            <p className="tw:mb-1 tw:text-sm tw:font-semibold tw:text-primary">
              D-{lesson.d} · {lesson.track} · 주제 블록 {TOPIC_MINUTES}분 (필수: 학습 목표 · 확인 퀴즈)
              {lesson.minutes > TOPIC_MINUTES ? ` · 본문 정독은 추가 약 ${lesson.minutes - TOPIC_MINUTES}분` : ''}
            </p>
            <h1 className="tw:text-2xl tw:font-bold tw:text-ink">{lesson.title}</h1>
            <p className="tw:mt-1 tw:text-dim">{lesson.summary}</p>
          </div>
          <div className="tw:flex tw:shrink-0 tw:items-center tw:gap-2">
            <BookmarkButton
              active={study.isBookmarked(BOOKMARK_TYPE.LESSON, lesson.id)}
              onToggle={() => study.toggleBookmark(BOOKMARK_TYPE.LESSON, lesson.id)}
              label={`${lesson.title} 북마크`}
            />
            <CompleteToggle done={done} onToggle={() => study.toggleDone(lesson.d)} label={`D-${lesson.d} 학습 완료`} />
          </div>
        </header>

        {study.saveFailed ? (
          <p role="alert" className="tw:rounded-lg tw:border tw:border-warning tw:bg-warning/10 tw:p-3 tw:text-sm tw:text-ink">
            브라우저 저장소에 기록하지 못했습니다. 이번 화면에서만 반영되고 새로고침하면 사라질 수 있어요.
          </p>
        ) : null}

        <section className={card} aria-labelledby="lesson-goals">
          <h2 id="lesson-goals" className={h2}>학습 목표</h2>
          <ul className="tw:m-0 tw:flex tw:list-disc tw:flex-col tw:gap-1 tw:pl-5 tw:text-ink">
            {lesson.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>

        {lesson.tables ? (
          <section className={card} aria-labelledby="lesson-tables">
            <h2 id="lesson-tables" className={h2}>{lesson.tablesTitle ?? '샘플 데이터'}</h2>
            <div className="tw:grid tw:gap-4 tw:md:grid-cols-2">
              {lesson.tables.map((t) => (
                <DataTable key={t.name} {...t} />
              ))}
            </div>
          </section>
        ) : null}

        {lesson.sections.map((s, i) => (
          <section key={s.heading} className={card} aria-labelledby={`lesson-s-${i}`}>
            <h2 id={`lesson-s-${i}`} className={h2}>{s.heading}</h2>
            <p className="tw:mb-3 tw:text-ink">{s.body}</p>
            {s.code ? <CodeBlock code={s.code} lang={s.lang} output={s.output} /> : null}
          </section>
        ))}

        <section className={card} aria-labelledby="lesson-pitfalls">
          <h2 id="lesson-pitfalls" className={h2}>자주 틀리는 포인트</h2>
          <ul className="tw:m-0 tw:flex tw:list-disc tw:flex-col tw:gap-1 tw:pl-5 tw:text-ink">
            {lesson.pitfalls.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="lesson-quiz">
          <h2 id="lesson-quiz" className={h2}>확인 퀴즈</h2>
          <ol className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-3 tw:p-0">
            {lesson.questions.map((q, i) => (
              <QuizItem key={`${lesson.id}-${q.id}`} index={i} question={q} lesson={lesson} />
            ))}
          </ol>
        </section>

        <footer className="tw:flex tw:flex-col tw:gap-3 tw:border-t tw:border-line tw:pt-4 tw:sm:flex-row tw:sm:items-center tw:sm:justify-between">
          <CompleteToggle done={done} onToggle={() => study.toggleDone(lesson.d)} label={`D-${lesson.d} 학습 완료 (하단)`} />
          <nav aria-label="레슨 이동" className="tw:flex tw:flex-wrap tw:gap-3 tw:text-sm">
            {prev ? <Link to={`/lesson/${prev.d}`} className="note-link">← D-{prev.d} {prev.title}</Link> : null}
            {next ? <Link to={`/lesson/${next.d}`} className="note-link">D-{next.d} {next.title} →</Link> : null}
          </nav>
        </footer>
      </div>
    </div>
  );
}
