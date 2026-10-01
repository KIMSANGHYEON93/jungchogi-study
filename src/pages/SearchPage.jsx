import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import { parseQuiz } from '../utils/parseQuiz';
import { parseCodeDrill } from '../utils/parseCodeDrill';
import { parseBogang } from '../utils/parseBogang';
import { parseStudyNotes, makeSnippet } from '../utils/parseStudyNotes';
import { STUDY_FILES } from '../domain/studyFiles';
import { fetchMarkdown } from '../utils/mdCache';
import Icon from '../components/Icon';
import ProblemContext from '../components/ProblemContext';
import { useThemeContext } from '../hooks/useTheme';

const SOURCE_CONFIG = {
  quiz100: { label: '단답형 100선', badge: 'badge-primary', file: '정처기_단답형_100선.md', parser: 'quiz' },
  codeDrill: { label: '코드 트레이싱', badge: 'badge-warning', file: '정처기_코드트레이싱_드릴.md', parser: 'code' },
  bogang: { label: '암기 119선', badge: 'badge-danger', file: '정처기_보강_기출분석_암기119선.md', parser: 'bogang' },
  // 문제 은행이 아니라 Day 문서 등 학습 노트 본문 — 제목(#~###) 단위 섹션으로 색인한다
  notes: { label: '학습 노트', badge: 'badge-success' },
};

export default function SearchPage() {
  const { theme } = useThemeContext();
  const syntaxTheme = theme === 'dark' ? oneDark : oneLight;
  const [searchParams] = useSearchParams();
  const [allItems, setAllItems] = useState([]);
  const [noteItems, setNoteItems] = useState([]);
  // `/search?q=...` 로 들어오면 그 검색어로 연다.
  // 첫 렌더에만 읽는다 — 이후 입력은 사용자가 소유한다.
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [results, setResults] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('전체');
  const [showCount, setShowCount] = useState(20);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef(null);

  // 전체 데이터 로드
  useEffect(() => {
    let cancelled = false;
    const load = (key, parse) => fetchMarkdown(SOURCE_CONFIG[key].file).then(parse);

    Promise.all([
      load('quiz100', parseQuiz),
      load('codeDrill', parseCodeDrill),
      load('bogang', parseBogang),
    ]).then(([quiz, code, bogang]) => {
      if (cancelled) return;
      const quizItems = quiz.map((q) => ({
        ...q,
        source: 'quiz100',
        searchText: `${q.question} ${q.answer} ${q.category}`.toLowerCase(),
      }));
      const codeItems = code.map((q) => ({
        ...q,
        source: 'codeDrill',
        searchText: `${q.title} ${q.context} ${q.code} ${q.answer} ${q.pitfall || ''} ${q.lang}`.toLowerCase(),
      }));
      const bogangItems = bogang.map((q) => ({
        ...q,
        source: 'bogang',
        searchText: `${q.question} ${q.answer} ${q.category}`.toLowerCase(),
      }));
      setAllItems([...quizItems, ...codeItems, ...bogangItems]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // 학습 노트 색인. 문제 은행과 따로 불러 — 노트 문서 하나가 실패해도 문제 검색은 그대로 동작한다.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(STUDY_FILES.map((f) => fetchMarkdown(f.file))).then((settled) => {
      if (cancelled) return;
      const items = settled.flatMap((r, fileIdx) =>
        r.status === 'fulfilled'
          ? parseStudyNotes(r.value, fileIdx).map((sec) => ({
              ...sec,
              source: 'notes',
              // 문서 이름(사이드바에 보이는 '시험전날' 등)으로도 찾을 수 있게 포함한다
              searchText: `${STUDY_FILES[fileIdx].name} ${sec.heading} ${sec.text}`.toLowerCase(),
            }))
          : []
      );
      setNoteItems(items);
    });
    return () => { cancelled = true; };
  }, []);

  // 검색 실행 (디바운스)
  const debounceRef = useRef(null);
  const doSearch = useCallback((q, items, filter) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const keywords = q.toLowerCase().split(/\s+/).filter(Boolean);
    let filtered = items.filter((item) =>
      keywords.every((kw) => item.searchText.includes(kw))
    );
    if (filter !== '전체') {
      const sourceKey = Object.keys(SOURCE_CONFIG).find(
        (k) => SOURCE_CONFIG[k].label === filter
      );
      if (sourceKey) filtered = filtered.filter((item) => item.source === sourceKey);
    }
    setResults(filtered);
  }, []);

  const searchable = useMemo(() => [...allItems, ...noteItems], [allItems, noteItems]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, searchable, sourceFilter);
      setShowCount(20);
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query, searchable, sourceFilter, doSearch]);

  // 자동 포커스
  useEffect(() => {
    if (!loading && inputRef.current) inputRef.current.focus();
  }, [loading]);

  const highlightText = (text, q) => {
    if (!q.trim()) return text;
    const keywords = q.toLowerCase().split(/\s+/).filter(Boolean);
    let result = text;
    for (const kw of keywords) {
      const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      result = result.replace(regex, '**$1**');
    }
    return result;
  };

  return (
    <div className="page">
      <h1>검색</h1>
      <p className="subtitle">전체 학습자료에서 키워드를 검색하세요</p>

      {/* 검색 입력 */}
      <div className="search-box" role="search">
        <span className="search-icon"><Icon name="search" size={18}/></span>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          aria-label="검색어 입력"
          placeholder={loading ? '데이터 로딩 중...' : '예: TCP, 디자인패턴, printf, 정규화...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')}><Icon name="x" size={14}/></button>
        )}
      </div>

      {/* 소스 필터 */}
      <div className="filter-bar">
        {['전체', ...Object.values(SOURCE_CONFIG).map((c) => c.label)].map((f) => (
          <button
            key={f}
            className={`btn-outline ${sourceFilter === f ? 'active' : ''}`}
            onClick={() => setSourceFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 결과 수 */}
      {query.trim() && (
        <div style={{ marginBottom: 16, color: 'var(--text-dim)', fontSize: '0.9rem' }} aria-live="polite">
          {results.length}개 결과
        </div>
      )}

      {/* 결과 목록 */}
      {!query.trim() ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ marginBottom: 16, color: 'var(--text-dim)' }}><Icon name="search" size={48}/></div>
          <p style={{ color: 'var(--text-dim)' }}>
            단답형 100선, 코드 트레이싱 40문제, 암기 119선 보강<br />
            학습 노트 {noteItems.length}개 섹션을 포함해 총 {searchable.length}개 항목에서 검색합니다
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ marginBottom: 16, color: 'var(--text-dim)' }}><Icon name="frown" size={48}/></div>
          <p style={{ color: 'var(--text-dim)' }}>"{query}"에 대한 검색 결과가 없습니다</p>
        </div>
      ) : (
        <>
          {results.slice(0, showCount).map((item) => {
            const config = SOURCE_CONFIG[item.source];
            const key = `${item.source}_${item.id}`;
            const isExpanded = expandedId === key;

            if (item.source === 'notes') {
              const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
              return (
                <div key={key} className="card search-result-card" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span className={`badge ${config.badge}`}>{config.label}</span>
                    <span className="badge badge-primary">{STUDY_FILES[item.fileIdx].name}</span>
                  </div>
                  <h3 style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{item.heading}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: '4px 0 8px' }}>
                    {makeSnippet(item.text, keywords)}
                  </p>
                  <Link className="plan-item-link" to={`/study?doc=${item.fileIdx}`}>
                    학습 노트에서 열기 <Icon name="chevron-right" size={14} />
                  </Link>
                </div>
              );
            }

            return (
              <div key={key} className="card search-result-card" style={{ marginBottom: 10 }}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : key); } }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span className={`badge ${config.badge}`}>{config.label}</span>
                      {item.category && <span className="badge badge-success">{item.category}</span>}
                      {item.lang && <span className="badge badge-warning">{item.lang.toUpperCase()}</span>}
                    </div>
                    <h3 style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>
                      {item.id}. {item.question || item.title}
                    </h3>
                  </div>
                  <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
                    <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16}/>
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 16 }}>
                    <ProblemContext text={item.context} />
                    {item.code && (
                      <SyntaxHighlighter
                        language={item.lang}
                        style={syntaxTheme}
                        customStyle={{ borderRadius: 8, fontSize: '0.85rem' }}
                      >
                        {item.code}
                      </SyntaxHighlighter>
                    )}
                    <div className="quiz-result correct" style={{ marginTop: item.code ? 12 : 0 }}>
                      <h4 style={{ marginBottom: 8, color: 'var(--success)' }}>정답 / 해설</h4>
                      <div className="md-content" style={{ fontSize: '0.85rem' }}>
                        <ReactMarkdown>{highlightText(item.answer, query)}</ReactMarkdown>
                      </div>
                    </div>
                    {item.pitfall && (
                      <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(251,191,36,0.1)', borderRadius: 8, border: '1px solid var(--warning)' }}>
                        <strong style={{ color: 'var(--warning)' }}>함정:</strong> {item.pitfall}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {showCount < results.length && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn-outline" onClick={() => setShowCount((c) => c + 20)}>
                더 보기 ({results.length - showCount}개 남음)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
