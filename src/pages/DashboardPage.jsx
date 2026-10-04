import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadProgress, getWrongNotes, getExamDate, setExamDate, getWeeklyStudyTime, addStudyTime, getSpacedRepetitionDue, getStorageUsage, formatBytes, toLocalDateKey } from '../utils/storage';
import Icon from '../components/Icon';
import TodayRoadmapCard from '../components/TodayRoadmapCard';
import useStudyState from '../hooks/useStudyState';
import { buildRoadmap, ROADMAP_DAYS } from '../domain/roadmap';
import { lessonByDay } from '../domain/lessons';
import { loadStoredBusy } from '../utils/busyStore';
import { applyBackup, buildBackup, failureMessage, parseBackup, successMessage } from '../utils/backup';
import { summarizeQuizResults } from '../domain/grading';

import { CORE_CARD_COUNT, CORE_DECK_KEY } from '../domain/coreDeck';

// ─── 오답 유형 분류 ───
function categorizeWrongNotes(notes) {
  const categories = {};
  notes.forEach((n) => {
    let cat = '기타';
    if (n.category) {
      cat = n.category;
    } else if (n.lang) {
      const langMap = { c: 'C언어', java: 'Java', python: 'Python', sql: 'SQL' };
      cat = langMap[n.lang] || n.lang.toUpperCase();
    } else if (n.type === 'quiz') {
      cat = '이론/용어';
    }
    categories[cat] = (categories[cat] || 0) + 1;
  });
  return Object.entries(categories)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [flashcardKnown] = useState(() => loadProgress('flashcard_known_quiz100', {}));
  const [quizResults] = useState(() => loadProgress('quiz_results', {}));
  const [wrongNotes] = useState(getWrongNotes);
  const study = useStudyState();
  const [examDate, setExamDateState] = useState(() => getExamDate() || '');
  const [showDateInput, setShowDateInput] = useState(false);
  const [spacedDue] = useState(getSpacedRepetitionDue);

  // 학습 시간 추적: 페이지 떠날 때 기록
  useEffect(() => {
    const start = Date.now();
    return () => {
      const elapsed = Math.round((Date.now() - start) / 60000);
      if (elapsed >= 1) addStudyTime(elapsed);
    };
  }, []);

  // 학습 데이터 백업 — 형식 검증·합치기·실패 시 되돌리기는 utils/backup.js
  const exportData = () => {
    const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jungchogi_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 'merge': 이 기기의 기록과 합친다(폰·PC 를 함께 쓸 때) · 'replace': 백업에 있는 항목을 백업 값으로 덮어쓴다
  const importData = (mode) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) {
        window.alert(failureMessage(parsed.reason));
        return;
      }
      if (mode === 'replace' && !window.confirm(`이 기기의 학습 기록 ${Object.keys(parsed.items).length}개 항목을 백업 값으로 덮어씁니다.\n(백업에 없는 항목은 그대로입니다) 계속할까요?`)) return;
      const result = applyBackup(parsed, mode);
      if (!result.ok) {
        window.alert(failureMessage(result.reason));
        return;
      }
      window.alert(successMessage(result, mode));
      window.location.reload();
    };
    input.click();
  };

  const handleExamDateSave = (val) => {
    setExamDateState(val);
    setExamDate(val);
    setShowDateInput(false);
  };

  const flashcardTotal = 100;
  const flashcardDone = Object.values(flashcardKnown).filter(Boolean).length;
  const coreTotal = CORE_CARD_COUNT;
  const coreDone = Object.values(loadProgress(`flashcard_known_${CORE_DECK_KEY}`, {})).filter(Boolean).length;
  // quiz_results 에는 세 값이 섞여 있다: 'correct' | 'incorrect' | 레거시 'answered'.
  // 진도(= 시도한 문항 수)는 셋을 다 세고, 정답률은 채점된 것만으로 낸다 —
  // 레거시에는 정오 정보가 없어 정답으로도 오답으로도 셀 수 없다.
  const quizSummary = summarizeQuizResults(quizResults);
  const quizDone = quizSummary.attempted;
  const quizTotal = 40;
  const wrongTotal = wrongNotes.length;
  const wrongReviewed = wrongNotes.filter((n) => n.reviewCount > 0).length;
  // 계획은 25일 로드맵 하나다 — 진도는 로드맵 완료 일차(D-24~D-1)로 센다
  const [todayKey] = useState(() => toLocalDateKey());
  const [busy] = useState(loadStoredBusy);
  const roadmap = buildRoadmap({ examDate: examDate || null, today: todayKey, checks: study.checks, busyDates: busy.busyDates });
  const daysCompleted = roadmap.progress.done;
  const daysTotal = ROADMAP_DAYS.length;

  const overallPercent = Math.round(
    ((flashcardDone / flashcardTotal) * 25 +
      (coreDone / coreTotal) * 15 +
      (quizDone / quizTotal) * 30 +
      (daysCompleted / daysTotal) * 30)
  );

  // D-Day 계산
  const dDay = examDate
    ? Math.ceil((new Date(examDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24))
    : null;

  // 주간 학습 시간
  const weeklyData = getWeeklyStudyTime();
  const maxMinutes = Math.max(...weeklyData.map((d) => d.minutes), 1);
  const totalWeekMinutes = weeklyData.reduce((s, d) => s + d.minutes, 0);

  // 오답 분석
  const wrongCategories = categorizeWrongNotes(wrongNotes);
  const maxWrongCount = wrongCategories.length > 0 ? wrongCategories[0].count : 1;

  // 추천 학습 결정
  const getRecommendation = () => {
    if (spacedDue.length > 0) return { text: `간격 반복 복습할 오답이 ${spacedDue.length}개 있어요!`, action: () => navigate('/wrong'), btn: '복습하기' };
    // 오늘의 로드맵 일차가 있고 아직 안 끝났으면 그것부터
    const todayDay = roadmap.today;
    if (todayDay && todayDay.d > 0 && !todayDay.done) {
      const lesson = lessonByDay(todayDay.d);
      return {
        text: `오늘의 로드맵 — ${todayDay.label} ${todayDay.title}`,
        action: () => navigate(lesson ? `/lesson/${lesson.d}` : '/roadmap'),
        btn: lesson ? '레슨 시작' : '로드맵 보기',
      };
    }
    if (roadmap.late.length > 0) return { text: `밀린 로드맵 일차가 ${roadmap.late.length}개 있어요`, action: () => navigate('/roadmap'), btn: '이어하기' };
    if (flashcardDone < 30) return { text: '플래시카드로 기본 용어를 익히세요', action: () => navigate('/flashcard'), btn: '카드 학습' };
    if (wrongTotal > 0 && wrongReviewed < wrongTotal) return { text: `오답노트에 복습할 문제가 ${wrongTotal - wrongReviewed}개 있어요`, action: () => navigate('/wrong'), btn: '오답 복습' };
    if (quizDone < 20) return { text: '코드 트레이싱 퀴즈를 풀어보세요', action: () => navigate('/quiz'), btn: '퀴즈 풀기' };
    return { text: '모의고사로 실력을 점검하세요!', action: () => navigate('/exam'), btn: '모의고사' };
  };

  const recommendation = getRecommendation();

  return (
    <div className="page">
      <h1>학습 대시보드</h1>
      <p className="subtitle">
        정보처리기사 실기 학습 현황 · <Link to="/roadmap">25일 로드맵</Link> ·{' '}
        <Link to="/guide">시험 영역 안내</Link>
      </p>

      {/* D-Day + 추천 학습 영역 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* D-Day 카운터 */}
        <div className="card dday-card" style={{ flex: '0 0 auto', minWidth: 140, textAlign: 'center', padding: '20px 24px' }}>
          <div style={{ marginBottom: 8 }}><Icon name="calendar" size={24} /></div>
          {examDate && dDay !== null ? (
            <>
              <div className={`dday-value ${dDay <= 7 ? 'danger' : dDay <= 14 ? 'warning' : ''}`}>
                {dDay === 0 ? 'D-Day' : dDay > 0 ? `D-${dDay}` : `D+${Math.abs(dDay)}`}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 4 }}>
                {examDate.replace(/-/g, '.')}
              </div>
              <button
                className="btn-outline"
                style={{ marginTop: 8, fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => setShowDateInput(true)}
              >
                변경
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: 8 }}>시험일 설정</div>
              <button
                className="btn-primary"
                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                onClick={() => setShowDateInput(true)}
              >
                날짜 선택
              </button>
            </>
          )}
          {showDateInput && (
            <div style={{ marginTop: 8 }}>
              <input
                type="date"
                className="quiz-input"
                defaultValue={examDate}
                style={{ fontSize: '0.85rem', padding: '6px 8px' }}
                onChange={(e) => handleExamDateSave(e.target.value)}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* 추천 학습 */}
        <div className="card recommend-card" onClick={recommendation.action} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); recommendation.action(); } }} role="button" tabIndex={0} style={{ cursor: 'pointer', flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>
                {spacedDue.length > 0 ? '간격 반복 알림' : '오늘의 추천'}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 500 }}>{recommendation.text}</div>
            </div>
            <button className="btn-primary" style={{ flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); recommendation.action(); }}>
              {recommendation.btn}
            </button>
          </div>
        </div>
      </div>

      {/* 오늘의 로드맵 (25일 로드맵의 오늘 일차) */}
      <TodayRoadmapCard examDate={examDate} />

      {/* 간격 반복 알림 상세 */}
      {spacedDue.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="repeat" size={18} />
            <h3 style={{ fontSize: '1rem', margin: 0 }}>간격 반복 복습 대기 ({spacedDue.length}개)</h3>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {spacedDue.slice(0, 8).map((n) => (
              <span key={`${n.source}-${n.id}`} className="badge badge-warning" style={{ fontSize: '0.8rem' }}>
                {n.type === 'quiz' ? n.question?.slice(0, 20) : n.title?.slice(0, 20)}...
              </span>
            ))}
            {spacedDue.length > 8 && (
              <span className="badge badge-primary" style={{ fontSize: '0.8rem' }}>+{spacedDue.length - 8}개 더</span>
            )}
          </div>
          <button className="btn-outline" style={{ marginTop: 12, fontSize: '0.85rem' }} onClick={() => navigate('/wrong')}>
            오답노트에서 복습하기
          </button>
        </div>
      )}

      {/* 종합 진도 */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.1rem' }}>종합 학습 진도</h2>
          <span style={{ fontSize: '1.8rem', fontWeight: 700, color: overallPercent >= 60 ? 'var(--success)' : 'var(--primary)' }}>
            {overallPercent}%
          </span>
        </div>
        <div className="progress-bar" role="progressbar" aria-valuenow={overallPercent} aria-valuemin={0} aria-valuemax={100} aria-label="학습 진도" style={{ height: 10, marginBottom: 0 }}>
          <div className="fill" style={{ width: `${overallPercent}%`, background: overallPercent >= 60 ? 'var(--success)' : 'var(--primary)' }} />
        </div>
      </div>

      {/* 주간 학습 시간 + 오답 분석 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* 주간 학습 시간 차트 */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Icon name="clock" size={18} />
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>주간 학습 시간</h2>
            <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
              총 {totalWeekMinutes >= 60 ? `${Math.floor(totalWeekMinutes / 60)}시간 ${totalWeekMinutes % 60}분` : `${totalWeekMinutes}분`}
            </span>
          </div>
          <div className="weekly-chart">
            {weeklyData.map((d) => (
              <div key={d.date} className="weekly-chart-bar-wrap">
                <div className="weekly-chart-value">{d.minutes > 0 ? `${d.minutes}분` : ''}</div>
                <div className="weekly-chart-bar-bg">
                  <div
                    className="weekly-chart-bar"
                    style={{ height: `${Math.max((d.minutes / maxMinutes) * 100, d.minutes > 0 ? 8 : 0)}%` }}
                  />
                </div>
                <div className="weekly-chart-label">{d.day}</div>
              </div>
            ))}
          </div>
          {totalWeekMinutes === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 8 }}>
              학습을 시작하면 시간이 자동으로 기록됩니다
            </p>
          )}
        </div>

        {/* 오답 유형별 분석 */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Icon name="bar-chart" size={18} />
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>오답 유형 분석</h2>
            <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--danger)', fontWeight: 600 }}>
              총 {wrongTotal}개
            </span>
          </div>
          {wrongCategories.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', padding: '20px 0' }}>
              오답 데이터가 없습니다. 퀴즈나 모의고사를 풀어보세요!
            </p>
          ) : (
            <div className="wrong-analysis">
              {wrongCategories.map((cat) => (
                <div key={cat.name} className="wrong-analysis-row">
                  <div className="wrong-analysis-label">{cat.name}</div>
                  <div className="wrong-analysis-bar-bg">
                    <div
                      className="wrong-analysis-bar"
                      style={{ width: `${(cat.count / maxWrongCount) * 100}%` }}
                    />
                  </div>
                  <div className="wrong-analysis-count">{cat.count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 영역별 통계 카드 */}
      <div className="dashboard-grid">
        <div className="card dash-stat-card" onClick={() => navigate('/flashcard')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/flashcard'); } }} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
          <div className="dash-stat-icon"><Icon name="cards" size={28}/></div>
          <div className="dash-stat-title">플래시카드</div>
          <div className="dash-stat-value">{flashcardDone}<span>/{flashcardTotal}</span></div>
          <div className="progress-bar" role="progressbar" aria-valuenow={Math.round((flashcardDone / flashcardTotal) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="학습 진도" style={{ marginTop: 8 }}>
            <div className="fill" style={{ width: `${(flashcardDone / flashcardTotal) * 100}%` }} />
          </div>
          <div className="dash-stat-sub">{Math.round((flashcardDone / flashcardTotal) * 100)}% 완료</div>
        </div>

        <div className="card dash-stat-card" onClick={() => navigate('/flashcard')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/flashcard'); } }} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
          <div className="dash-stat-icon"><Icon name="book-open" size={28}/></div>
          <div className="dash-stat-title">핵심 암기 카드</div>
          <div className="dash-stat-value">{coreDone}<span>/{coreTotal}</span></div>
          <div className="progress-bar" role="progressbar" aria-valuenow={Math.round((coreDone / coreTotal) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="학습 진도" style={{ marginTop: 8 }}>
            <div className="fill" style={{ width: `${(coreDone / coreTotal) * 100}%`, background: 'var(--accent)' }} />
          </div>
          <div className="dash-stat-sub">{Math.round((coreDone / coreTotal) * 100)}% 완료</div>
        </div>

        <div className="card dash-stat-card" onClick={() => navigate('/quiz')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/quiz'); } }} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
          <div className="dash-stat-icon"><Icon name="terminal" size={28}/></div>
          <div className="dash-stat-title">코드 퀴즈</div>
          <div className="dash-stat-value">{quizDone}<span>/{quizTotal}</span></div>
          <div className="progress-bar" role="progressbar" aria-valuenow={Math.round((quizDone / quizTotal) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="학습 진도" style={{ marginTop: 8 }}>
            <div className="fill" style={{ width: `${(quizDone / quizTotal) * 100}%` }} />
          </div>
          <div className="dash-stat-sub">{Math.round((quizDone / quizTotal) * 100)}% 완료</div>
          {/* 채점분이 하나도 없으면 정답률을 만들지 않는다 — 0% 로 보이면 실제와 다르다 */}
          {quizSummary.accuracy !== null && (
            <div className="dash-stat-sub">
              정답률 {quizSummary.accuracy}% ({quizSummary.graded}문항 채점)
            </div>
          )}
        </div>

        <div className="card dash-stat-card" onClick={() => navigate('/wrong')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/wrong'); } }} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
          <div className="dash-stat-icon"><Icon name="x-circle" size={28}/></div>
          <div className="dash-stat-title">오답노트</div>
          <div className="dash-stat-value" style={{ color: wrongTotal > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {wrongTotal}<span>개</span>
          </div>
          <div className="progress-bar" style={{ marginTop: 8 }}>
            <div className="fill" style={{ width: `${wrongTotal ? (wrongReviewed / wrongTotal) * 100 : 100}%`, background: 'var(--success)' }} />
          </div>
          <div className="dash-stat-sub">{wrongTotal > 0 ? `${wrongReviewed}개 복습완료` : '오답 없음'}</div>
        </div>

        <div className="card dash-stat-card" onClick={() => navigate('/exam')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/exam'); } }} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
          <div className="dash-stat-icon"><Icon name="file-text" size={28}/></div>
          <div className="dash-stat-title">모의고사</div>
          <div className="dash-stat-value">20<span>문제</span></div>
          <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-dim)' }}>
            단답형 12 + 코드 8
          </div>
          <div className="dash-stat-sub">150분 제한</div>
        </div>
      </div>

      {/* 로드맵 진도 — 완료 체크는 로드맵·레슨 화면과 같은 기록이다 */}
      <div className="card" style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>25일 로드맵 진도</h2>
          <div className="progress-bar" role="progressbar" aria-label="로드맵 진도" aria-valuemin={0} aria-valuemax={100} aria-valuenow={roadmap.progress.percent}>
            <div className="fill" style={{ width: `${roadmap.progress.percent}%` }} />
          </div>
          <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            {daysCompleted}/{daysTotal}일 완료{roadmap.late.length > 0 ? ` · 밀린 일차 ${roadmap.late.length}개` : ''}
          </div>
        </div>
        <Link className="btn-outline" to="/roadmap" style={{ textDecoration: 'none' }}>로드맵 열기</Link>
      </div>

      {/* 데이터 관리 */}
      <div className="card" style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>데이터 관리</h2>
          {(() => {
            const usage = getStorageUsage();
            const limit = 5 * 1024 * 1024;
            const pct = Math.round((usage / limit) * 100);
            return (
              <span style={{ fontSize: '0.82rem', color: pct > 80 ? 'var(--danger)' : 'var(--text-dim)' }}>
                {pct > 80 && <Icon name="alert-circle" size={14} />} {formatBytes(usage)} / 5 MB ({pct}%)
              </span>
            );
          })()}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={exportData}>
            학습 데이터 내보내기
          </button>
          <button className="btn-outline" onClick={() => importData('merge')}>
            가져오기 (합치기)
          </button>
          <button className="btn-outline" onClick={() => importData('replace')}>
            가져오기 (덮어쓰기)
          </button>
          <button
            className="btn-outline"
            style={{ color: 'var(--danger)' }}
            onClick={() => {
              if (!window.confirm('모든 학습 진도를 초기화하시겠습니까?\n(플래시카드, 퀴즈, 오답노트, Day 체크 등 모든 데이터가 삭제됩니다)')) return;
              const keysToRemove = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('jungchogi_')) keysToRemove.push(key);
              }
              keysToRemove.forEach((k) => localStorage.removeItem(k));
              window.location.reload();
            }}
          >
            전체 초기화
          </button>
        </div>
      </div>
    </div>
  );
}
