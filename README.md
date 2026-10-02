# jungchogi — 정보처리기사 실기 학습 앱

Vite + React 19 기반 순수 클라이언트 SPA. 14일 학습 문서, 플래시카드, 코드트레이싱 드릴, 모의고사, 오답노트(간격 반복), 학습 대시보드를 제공한다. 서버 없이 `localStorage`에 진행 상태를 저장하고 Vercel에 정적 배포한다. **AI 기능은 없다.**

## 기능
| 경로 | 기능 |
|---|---|
| `/` | 대시보드 — D-Day, 오늘의 로드맵, 종합 진도, 주간 학습 시간, 오답 유형 분석, 간격 반복 대기, 로드맵 진도, 데이터 관리 |
| `/study` | Day01~14 학습 문서 뷰어 (인라인 정답 확인, 로드맵 일차 표시) |
| `/flashcard` | 단답형 100선(100장) · 암기 119선 보강(80장) 플래시카드 (셔플, 아는 카드 표시, 북마크만 보기) |
| `/quiz` | 코드 트레이싱 퀴즈 (출력 자동 일치 판정, 직접 채점 → 오답노트 연동) |
| `/exam` | 모의고사 (타이머, 코드/단답 혼합, 제출 후 직접 채점) |
| `/wrong` | 오답노트 (복습 횟수, 1/3/7일 간격 반복) |
| `/search` | 전체 학습 자료 검색 (문제 은행 + 학습 노트 본문) |
| `/roadmap` | 25일 D-Day 로드맵 — 기사·산업기사 공통 계획(공통 모듈 먼저, 기사 특화는 3단계에서 뒤), 4단계 일정, 일자별 완료 체크와 진도 게이지 |
| `/lesson/:d` | 일차별 레슨 13개 — 1단계 D-24~D-17(C·Java·Python·SQL)과 2단계 D-15~D-11(스케줄링·페이지 교체·서브넷·프로토콜·테스트) — 개념·예제·출력 퀴즈, 완료·북마크 저장 |
| `/bookmarks` | 북마크 — 레슨 · 플래시카드 · 코드 퀴즈 · 학습 노트 북마크 모아 보기 (종류별 필터, 해제). 각 화면의 북마크 버튼으로 추가한다. 플래시카드는 "북마크만" 필터도 있다 |
| `/practice` | 실기 연습 — 변수 추적표(C·Java·Python), SQL 빈칸 채우기, 단답·약술 키워드 채점 |
| `/guide` | 시험 영역 안내 — 개요, 출제기준 12개 영역, 출제 비중 |
| (상단 내비게이션) | 학습 · 실전 · 계획 드롭다운 3개로 묶여 있다 (학습: 학습노트·플래시카드·검색·북마크 / 실전: 코드퀴즈·실기연습·모의고사·오답노트 / 계획: 로드맵·영역안내) |
| (모든 화면) | 공식 치트시트 모달 — 헤더의 "공식" 버튼 또는 오른쪽 아래 플로팅 버튼 (서브넷·순환 복잡도·HRN·페이지 교체) |

## 구조
```
public/data/*.md      학습 콘텐츠 18개 (런타임 fetch)
src/pages/            페이지 (lazy 로딩)
src/domain/           순수 도메인 로직 — roadmap(학습 계획), dailyPlan(날짜 유틸), calendarBusy, grading, examAreas,
                      lessons, bookmarks, bogangDeck, traces(변수 추적표 데이터), sqlBlanks, shortAnswer, formulas, studyFiles
src/services/         외부 연동 — googleCalendar (Google 캘린더 조회)
src/components/ui/    Tailwind 로 만든 재사용 UI (BookmarkButton · CompleteToggle · LessonCard · QuizItem · CodeBlock · DataTable · ProgressMeter)
src/utils/            studyState.js(완료·북마크 공유 저장소), parse*.js(md → 문항 파서), storage.js(localStorage 계층), icsExport.js
src/hooks/            useTheme, useStudyTimer, useSwipe, useDeepLink
design-system/vivara/ 디자인 토큰·규칙
```

## 학습 데이터 구성
저장소 구성·위험·개선 계획(P0~P3)은 [`docs/data-architecture-review.md`](docs/data-architecture-review.md) 에 정리했다. 북마크는 `bookmarks` 키 하나에 `{ "<종류>:<id>": 시각 }` 로 모은다.

## 스타일링
기존 화면은 `src/styles/global.css`(디자인 토큰), 새 컴포넌트는 Tailwind CSS v4 를 쓴다. 충돌을 피하려고 리셋(preflight)을 가져오지 않고 모든 유틸리티에 `tw:` 접두사를 붙인다(`tw:flex`, `tw:md:grid-cols-2`). 색은 토큰에 연결돼 다크 모드를 그대로 따른다(`tw:bg-card`, `tw:text-dim`). `global.css` 의 비레이어 규칙(`button` 의 padding/border 등)은 유틸리티보다 우선하므로 필요하면 `tw:p-0!` 처럼 `!` 를 붙인다.

## 실행
```bash
npm install
npm run dev         # 개발 서버
npm run lint        # ESLint (0 errors 유지)
npm test            # Vitest 1회 실행
npm run test:watch  # Vitest watch 모드
npm run build       # dist/ 생성
```

배포: Vercel. `vercel.json`이 `/data/`를 제외한 모든 경로를 `index.html`로 rewrite한다.

## 학습 계획 — 25일 로드맵 하나

앱의 계획은 로드맵(`/roadmap`) 하나다. 예전의 "일일 플랜"(Day01~14 문서를 남은 날에 균등 분배)은 로드맵으로 합쳤다.

- 시험일은 대시보드 D-Day 카드에서 저장한 값을 쓰고, 없으면 10/25 를 기본값으로 쓴다(지났으면 내년).
- 일차는 시험일에서 거꾸로 센 **날짜에 고정**돼 있다(D-24 = 10/1). 매일 계획이 바뀌지 않고, 지났는데 못 끝낸 일차는 "밀린 일차"로 보인다.
- 대시보드 "오늘의 로드맵" 카드: 오늘 일차의 주제 · 학습 노트/검색/연습 링크 · 레슨 · 완료 체크 · 밀린 일차 · 다가오는 6일.
  완료 체크는 로드맵·레슨 화면과 같은 기록(`roadmap_checks`)이라 어느 화면에서 눌러도 같이 바뀐다.
- 학습 노트의 Day 문서에는 그 문서를 다루는 로드맵 일차가 배너로 표시된다.
- `.ics` 내보내기: 오늘부터의 남은 일차(완료한 일차 제외)와 시험 당일을 캘린더 파일로 내려받는다(날짜별 고정 UID — 다시 가져와도 중복되지 않는다).
  `.ics` 는 삭제를 전달하지 못하므로 전용 캘린더로 가져오는 것을 권한다.
- Google 캘린더 가져오기: 일정이 많은 날(하루 6시간 이상)을 로드맵에 "일정 많음"으로 표시한다(일차를 옮기지는 않는다).
  `VITE_GOOGLE_CLIENT_ID` 설정이 필요하다 — 절차는 [`.env.example`](.env.example) 참조.
- 옛 `day_checks`(Day 문서 완료 기록)는 더 이상 읽지 않는다. 로드맵 일차와 1:1 이 아니라 옮기지 않았다.
- 코드 퀴즈는 입력한 출력이 정답과 일치하면 자동으로 정답 처리한다(불일치는 직접 채점에 맡긴다).

## 테스트
`tests/`에 Vitest 테스트를 둔다. 파서·도메인은 node 환경, `localStorage`·DOM 이 필요한 파일만 상단 `// @vitest-environment jsdom` 주석으로 jsdom을 쓴다. 테스트 시간대는 `vite.config.js` 가 Asia/Seoul 로 고정한다(날짜 키가 로컬 기준이라 CI(UTC)에서 회귀를 놓치지 않기 위해서다).

| 대상 | 파일 |
|---|---|
| 문항 파서 | `parseQuiz` · `parseBogang` · `bogangDeck` · `parseCodeDrill` · `parseStudyNotes` |
| 저장 계층 | `storage` · `edge-storage` · `edge-time` · `exam-results` · `quizResultsCompat` |
| 로드맵·캘린더 | `dailyPlan`(날짜 유틸) · `roadmap` · `RoadmapPage` · `TodayRoadmapCard*` · `DashboardPage.roadmap` · `calendarBusy` · `icsExport` · `googleCalendar` |
| 레슨·학습 상태·북마크 | `lessons` · `LessonPage` · `studyState` · `bookmarks` |
| 실기 연습 | `traces` · `CodeTracingTable` · `sqlBlanks` · `SqlQuizCard` · `shortAnswer` · `ShortAnswerGrader` · `PracticePage` |
| 공식 치트시트 | `formulas` · `FormulaCheatSheetModal` · `App.cheatsheet` |
| 채점 | `grading` · `QuizPage.grade` · `QuizPage.autoMatch` · `ExamPage.grade` |
| 화면·딥링크 | `StudyPage.planned` · `SearchPage.notes` · `deepLink-*` |

픽스처(`tests/fixtures/*.md`)는 `public/data`의 실제 콘텐츠에서 발췌했다.

CI: `.github/workflows/ci.yml` — main push와 main 대상 PR에서 Node 22로 lint → test → build를 순차 실행한다.
