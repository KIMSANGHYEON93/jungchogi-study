import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import FormulaCheatSheetModal from './components/FormulaCheatSheetModal';
import { useTheme, ThemeProvider } from './hooks/useTheme';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const FlashcardPage = lazy(() => import('./pages/FlashcardPage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const StudyPage = lazy(() => import('./pages/StudyPage'));
const ExamPage = lazy(() => import('./pages/ExamPage'));
const WrongNotePage = lazy(() => import('./pages/WrongNotePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'));
const PracticePage = lazy(() => import('./pages/PracticePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageLoader() {
  return (
    <div className="page" style={{ textAlign: 'center', padding: '80px 0' }}>
      <div className="loading-spinner" />
      <p style={{ color: 'var(--text-dim)', marginTop: 16 }}>로딩 중...</p>
    </div>
  );
}

function AppLayout() {
  const location = useLocation();
  const isLanding = location.pathname === '/landing';
  // 공식 치트시트는 어느 화면에서나 열 수 있어야 해서 최상위가 상태를 갖는다
  const [cheatOpen, setCheatOpen] = useState(false);

  return (
    <>
      {!isLanding && <Navbar onOpenCheatSheet={() => setCheatOpen(true)} />}
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/flashcard" element={<FlashcardPage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/study" element={<StudyPage />} />
          <Route path="/exam" element={<ExamPage />} />
          <Route path="/wrong" element={<WrongNotePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      {!isLanding && (
        <button type="button" className="cheat-fab" onClick={() => setCheatOpen(true)} aria-label="공식 치트시트 열기">
          공식
        </button>
      )}
      <FormulaCheatSheetModal open={cheatOpen} onClose={() => setCheatOpen(false)} />
    </>
  );
}

export default function App() {
  const themeValue = useTheme();

  return (
    <ThemeProvider value={themeValue}>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </ThemeProvider>
  );
}
