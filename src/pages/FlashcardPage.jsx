import { useState, useEffect, useCallback, useMemo } from 'react';
import ProgressNav from '../components/ProgressNav';
import { ITEM_STATUS, firstPendingIndex } from '../domain/progressNav';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseQuiz } from '../utils/parseQuiz';
import { saveProgress, loadProgress } from '../utils/storage';
import useSwipe from '../hooks/useSwipe';
import useStudyTimer from '../hooks/useStudyTimer';
import { fetchMarkdown } from '../utils/mdCache';
import Icon from '../components/Icon';
import BookmarkButton from '../components/ui/BookmarkButton';
import { DECK_BOOKMARK_TYPE } from '../domain/bookmarks';
import { CORE_DECK_FILE, CORE_DECK_KEY } from '../domain/coreDeck';
import useStudyState from '../hooks/useStudyState';
import { bookmarkKey } from '../utils/studyState';
import {
  useDeepLinkId,
  useDeepLinkedIndex,
  deckDeepLinkNotice,
  DEEP_LINK_NOTICE_STYLE,
} from '../hooks/useDeepLink';

const CATEGORIES = ['전체', '데이터베이스', '소프트웨어공학', '디자인패턴/UML', '인터페이스/UI', '테스트', '보안/네트워크', 'OS/기타'];

// `idPattern` 은 교재 카드 id 형식이다 — 딥링크가 어느 덱을 가리키는지 모양으로 가른다.
const DECKS = [
  { key: 'quiz100', label: '단답형 100선', file: '정처기_단답형_100선.md', parser: 'quiz', idPattern: /^\d{3}$/ },
  { key: CORE_DECK_KEY, label: '핵심 암기 카드', file: CORE_DECK_FILE, parser: 'quiz', idPattern: /^K\d{3}$/ },
  { key: 'extra', label: '출제범위 확장 80', file: '정처기_출제범위_확장문항.md', parser: 'quiz', idPattern: /^X\d{3}$/ },
  { key: 'pastTopic', label: '기출 주제 보강 65', file: '정처기_기출주제_보강문항.md', parser: 'quiz', idPattern: /^Y\d{3}$/ },
];

const DEFAULT_DECK = 'quiz100';

/**
 * `/flashcard?id=<문항 id>` 가 어느 덱을 가리키는지 가른다.
 *
 * 계약에 덱 이름이 없으므로 화면이 판단해야 한다. 교재 id 형식이 덱마다 겹치지
 * 않아(`001` vs `B01`) 모양으로 갈릴 수 있다 — 두 덱을 다 뒤지려면 md 를 둘 다
 * 받아야 하고, 그러면 덱 선택이 fetch 결과에 매달려 effect 안으로 들어간다.
 *
 * @param {string|null} id
 * @returns {string|null} 어느 덱 형식도 아니면 null (기본 덱으로 열고 안내한다)
 */
function deckForId(id) {
  if (!id) return null;
  return DECKS.find((d) => d.idPattern.test(id))?.key ?? null;
}

const VIEW_KEY = 'jungchogi-flashcard-view';

function loadView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'card' ? 'card' : 'list';
  } catch {
    return 'list';
  }
}

function saveView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // 기억하지 못해도 이번 화면에서는 바뀐 방식으로 보인다
  }
}

/** 카드 상태 → 색 구분 클래스와 이름. 외움 = 초록, 모름 = 빨강, 아직 표시 안 함 = 회색 */
const STATUS_LOOK = {
  [ITEM_STATUS.DONE]: { cls: 'is-known', label: '외움' },
  [ITEM_STATUS.WRONG]: { cls: 'is-unknown', label: '모름' },
  [ITEM_STATUS.TODO]: { cls: 'is-new', label: '안 봄' },
};

export default function FlashcardPage() {
  useStudyTimer();
  // `/flashcard?id=B07` 로 지목받은 카드. 첫 렌더에만 읽는다.
  const requestedId = useDeepLinkId();
  const [deck, setDeck] = useState(() => deckForId(requestedId) ?? DEFAULT_DECK);
  const [allCards, setAllCards] = useState([]);
  const [shuffled, setShuffled] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [category, setCategory] = useState('전체');
  const [known, setKnown] = useState({});
  const [filterMode, setFilterMode] = useState('all');
  // 보기 방식: 'list' = 문제와 답을 한눈에(기본), 'card' = 한 장씩 뒤집기.
  // 특정 카드로 온 링크는 그 카드를 한 장으로 연다. 고른 방식은 이 기기에만 기억한다(백업 대상 아님)
  const [view, setView] = useState(() => (requestedId ? 'card' : loadView()));
  const [hideAnswers, setHideAnswers] = useState(false);
  const study = useStudyState();
  const bookmarkType = DECK_BOOKMARK_TYPE[deck];
  const { bookmarks } = study;

  // 덱 변경 시 데이터 로드
  useEffect(() => {
    let cancelled = false;
    const deckInfo = DECKS.find((d) => d.key === deck);
    fetchMarkdown(deckInfo.file)
      .then((text) => {
        if (cancelled) return;
        setAllCards(parseQuiz(text));
        setKnown(loadProgress(`flashcard_known_${deck}`, {}));
      });
    return () => { cancelled = true; };
  }, [deck]);

  const isKnown = useCallback((card) => !!known[card.id], [known]);

  // 필터 결과는 파생 상태 — effect 없이 렌더 중 계산한다
  const applyFilters = useCallback((cat, mode) => {
    let f = allCards;
    if (cat !== '전체') f = f.filter((c) => c.category === cat);
    if (mode === 'unknown') f = f.filter((c) => !isKnown(c));
    if (mode === 'bookmarked') f = f.filter((c) => bookmarkKey(bookmarkType, c.id) in bookmarks);
    return f;
  }, [allCards, isKnown, bookmarks, bookmarkType]);
  const filtered = useMemo(() => applyFilters(category, filterMode), [applyFilters, category, filterMode]);

  // 셔플은 그 대상이 지금의 filtered 와 같을 때만 유효하다
  const cards = shuffled && shuffled.source === filtered ? shuffled.order : filtered;

  // 카드 커서. 딥링크가 지목한 카드가 지금 목록에 있으면 거기서 시작한다.
  // 목록이 줄어 커서가 범위를 벗어나는 경우(모르는 것만 필터에서 외움 처리)도
  // 이 훅이 첫 카드로 되돌린다.
  // 쪼개기 전의 섹션 id(`B07`)로 온 링크는 그 섹션의 첫 카드로 보낸다
  const wantedId = requestedId;
  const { index: idx, setIndex, missedId } = useDeepLinkedIndex(cards, wantedId, isKnown);
  const deepLinkNotice = deckDeepLinkNotice(missedId);

  const markKnown = useCallback((card, val) => {
    const next = { ...known, [card.id]: val };
    setKnown(next);
    saveProgress(`flashcard_known_${deck}`, next);
  }, [known, deck]);

  const next = useCallback(() => { setFlipped(false); setIndex(Math.min(idx + 1, cards.length - 1)); }, [idx, cards.length, setIndex]);
  const prev = useCallback(() => { setFlipped(false); setIndex(Math.max(idx - 1, 0)); }, [idx, setIndex]);

  const shuffle = useCallback(() => {
    const a = [...cards];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    // 셔플 결과를 현재 filtered 에 묶어 둔다 — 필터가 바뀌면 자동 폐기된다
    setShuffled({ source: filtered, order: a });
    setIndex(0);
    setFlipped(false);
  }, [cards, filtered, setIndex]);

  // 필터를 바꾸면 바뀐 목록의 첫 미완료(아직 안 외운) 카드로 간다 — effect 대신 이벤트 핸들러에서
  const startAt = (cat, mode) => Math.max(firstPendingIndex(applyFilters(cat, mode), (c) => !isKnown(c)), 0);
  const changeCategory = (cat) => { setCategory(cat); setIndex(startAt(cat, filterMode)); setFlipped(false); };
  const changeFilterMode = (mode) => { setFilterMode(mode); setIndex(startAt(category, mode)); setFlipped(false); };

  // 카드 상태: 외움 = 완료, 모름으로 표시 = 모름, 표시 안 함 = 안 봄
  const statusOf = (c) => (known[c.id] === true ? ITEM_STATUS.DONE : known[c.id] === false ? ITEM_STATUS.WRONG : ITEM_STATUS.TODO);
  const pickCard = (i) => { setIndex(i); setFlipped(false); };

  // 덱을 바꾸면 필터·커서를 처음 상태로 돌린다. 예전에는 로드 콜백이 이 일을 했는데,
  // 그러면 카드가 도착할 때마다 커서가 0 으로 밀려 딥링크가 지워진다.
  const changeDeck = (key) => {
    if (key === deck) return;
    setDeck(key);
    setIndex(0);
    setFlipped(false);
    setCategory('전체');
    setFilterMode('all');
  };

  useEffect(() => {
    // 목록 보기에서는 스페이스가 화면 스크롤이어야 한다 — 한 장씩 볼 때만 단축키를 건다
    if (view !== 'card') return undefined;
    const handler = (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('button, input, textarea, select, a')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, view]);

  const changeView = (v) => {
    setView(v);
    saveView(v);
    setFlipped(false);
  };

  // 목록에서 카드를 누르면 그 카드부터 한 장씩 본다
  const openCard = (i) => {
    setIndex(i);
    changeView('card');
  };

  const swipeHandlers = useSwipe({
    onSwipeLeft: next,
    onSwipeRight: prev,
  });

  const knownCount = allCards.filter((c) => known[c.id]).length;
  const current = cards[idx];

  return (
    <div className="page">
      <h1>플래시카드</h1>
      <p className="subtitle">
        {view === 'list'
          ? '문제와 답을 한눈에 보고 외움·모름을 표시하세요 — 카드 색으로 구분됩니다'
          : '탭하여 뒤집기, 좌우 스와이프로 이동'}
      </p>

      <div className="fc-view-toggle" role="group" aria-label="보기 방식">
        <button type="button" className={view === 'list' ? 'btn-primary' : 'btn-outline'} aria-pressed={view === 'list'} onClick={() => changeView('list')}>
          문제·답 함께 보기
        </button>
        <button type="button" className={view === 'card' ? 'btn-primary' : 'btn-outline'} aria-pressed={view === 'card'} onClick={() => changeView('card')}>
          한 장씩 뒤집기
        </button>
      </div>

      {/* 덱 선택 */}
      <div className="deck-selector">
        {DECKS.map((d) => (
          <button
            key={d.key}
            className={`deck-btn ${deck === d.key ? 'active' : ''}`}
            onClick={() => changeDeck(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="stats">
        <div className="stat-box">
          <div className="value">{allCards.length}</div>
          <div className="label">전체 문제</div>
        </div>
        <div className="stat-box">
          <div className="value" style={{ color: 'var(--success)' }}>{knownCount}</div>
          <div className="label">외운 문제</div>
        </div>
        <div className="stat-box">
          <div className="value" style={{ color: 'var(--warning)' }}>{allCards.length - knownCount}</div>
          <div className="label">남은 문제</div>
        </div>
      </div>

      <div className="progress-bar">
        <div className="fill" style={{ width: `${allCards.length ? (knownCount / allCards.length) * 100 : 0}%` }} />
      </div>

      <div className="filter-bar">
        {CATEGORIES.map((cat) => (
          <button key={cat} className={`btn-outline ${category === cat ? 'active' : ''}`} onClick={() => changeCategory(cat)}>
            {cat}
          </button>
        ))}
        <span style={{ margin: '0 8px', borderLeft: '1px solid var(--border)', height: 28 }} />
        <button className={`btn-outline ${filterMode === 'all' ? 'active' : ''}`} onClick={() => changeFilterMode('all')}>전체</button>
        <button className={`btn-outline ${filterMode === 'unknown' ? 'active' : ''}`} onClick={() => changeFilterMode('unknown')}>모르는 것만</button>
          <button className={`btn-outline ${filterMode === 'bookmarked' ? 'active' : ''}`} onClick={() => changeFilterMode('bookmarked')}>북마크만</button>
        <span style={{ margin: '0 8px', borderLeft: '1px solid var(--border)', height: 28 }} />
        <button className="btn-outline" onClick={shuffle} title="카드 순서 섞기"><Icon name="refresh" size={14}/> 섞기</button>
      </div>

      {/* 지목받은 카드를 못 찾았을 때. 조용히 다른 카드를 열면 사용자는
          계획이 틀렸는지 앱이 틀렸는지 알 수 없다. */}
      {deepLinkNotice && (
        <div className="deep-link-notice" role="status" style={DEEP_LINK_NOTICE_STYLE}>
          {deepLinkNotice}
        </div>
      )}

      {/* 한 장씩 볼 때는 번호판 요약이 같은 수를 보여 주므로 목록에서만 색 안내를 띄운다 */}
      {view === 'list' ? (
      <ul className="fc-legend" aria-label="카드 색 안내">
        <li className="is-known">외움 {knownCount}</li>
        <li className="is-unknown">모름 {allCards.filter((c) => known[c.id] === false).length}</li>
        <li className="is-new">안 봄 {allCards.filter((c) => known[c.id] === undefined).length}</li>
      </ul>
      ) : null}

      {view === 'list' && cards.length > 0 ? (
        <>
          <label className="fc-hide-toggle">
            <input type="checkbox" checked={hideAnswers} onChange={(e) => setHideAnswers(e.target.checked)} />
            답 가리기 (스스로 떠올린 뒤 펼쳐 보기)
          </label>
          <ol className="fc-list">
            {cards.map((card, i) => {
              const look = STATUS_LOOK[statusOf(card)];
              return (
                <li key={card.id} className={`fc-item ${look.cls}`}>
                  <div className="fc-item-head">
                    <span className="fc-item-id">{card.id}</span>
                    <span className="badge badge-primary">{card.category}</span>
                    <span className={`fc-status ${look.cls}`}>{look.label}</span>
                    <span className="fc-item-tools">
                      <BookmarkButton
                        active={study.isBookmarked(bookmarkType, card.id)}
                        onToggle={() => study.toggleBookmark(bookmarkType, card.id)}
                        label={`${card.id}번 카드 북마크`}
                      />
                    </span>
                  </div>
                  <p className="fc-question">{card.question}</p>
                  {hideAnswers ? (
                    <details className="fc-answer-fold">
                      <summary>답 보기</summary>
                      <div className="md-content fc-answer">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.answer}</ReactMarkdown>
                      </div>
                    </details>
                  ) : (
                    <div className="md-content fc-answer">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.answer}</ReactMarkdown>
                    </div>
                  )}
                  <div className="fc-item-actions">
                    <button
                      type="button"
                      className={known[card.id] === false ? 'btn-danger' : 'btn-outline fc-btn-unknown'}
                      aria-pressed={known[card.id] === false}
                      aria-label={`${card.id}번 모름 표시`}
                      onClick={() => markKnown(card, false)}
                    >
                      <Icon name="x" size={16} /> 모름
                    </button>
                    <button
                      type="button"
                      className={known[card.id] === true ? 'btn-success' : 'btn-outline fc-btn-known'}
                      aria-pressed={known[card.id] === true}
                      aria-label={`${card.id}번 외움 표시`}
                      onClick={() => markKnown(card, true)}
                    >
                      <Icon name="check" size={16} /> 외움
                    </button>
                    <button type="button" className="btn-outline fc-open-card" onClick={() => openCard(i)}>
                      한 장으로 보기
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}

      {view === 'card' ? (
      <ProgressNav
        items={cards}
        index={idx}
        statusOf={statusOf}
        onPick={pickCard}
        labels={{ done: '외움', wrong: '모름', todo: '안 봄' }}
        pending={[ITEM_STATUS.TODO, ITEM_STATUS.WRONG]}
        collapsible
      />
      ) : null}

      {cards.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          {filterMode === 'unknown' ? <><Icon name="party" size={24}/> 모든 카드를 외웠습니다!</>
            : filterMode === 'bookmarked' && allCards.length > 0 ? '북마크한 카드가 없습니다. 카드 위의 북마크 버튼으로 추가해 보세요.'
            : '문제를 불러오는 중...'}
        </div>
      ) : view === 'card' && current ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <BookmarkButton
              active={study.isBookmarked(bookmarkType, current.id)}
              onToggle={() => study.toggleBookmark(bookmarkType, current.id)}
              label={`${current.id}번 카드 북마크`}
            />
          </div>
          <div className={`flashcard-container ${STATUS_LOOK[statusOf(current)].cls}`} {...swipeHandlers}>
            <span className={`fc-status fc-status-floating ${STATUS_LOOK[statusOf(current)].cls}`}>{STATUS_LOOK[statusOf(current)].label}</span>
            <div className={`flashcard ${flipped ? 'flipped' : ''} ${deck === CORE_DECK_KEY && flipped ? 'flashcard-tall' : ''}`} onClick={() => setFlipped(!flipped)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(!flipped); } }} role="button" tabIndex={0} aria-label="카드 뒤집기">
              <div className="flashcard-face">
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <span className="badge badge-primary">{current.category}</span>
                </div>
                <h2 style={{ fontSize: '1.3rem', textAlign: 'center', lineHeight: 1.6 }}>
                  {current.id}. {current.question}
                </h2>
                <p style={{ color: 'var(--text-dim)', marginTop: 16, fontSize: '0.85rem' }}>클릭하여 정답 확인</p>
              </div>
              <div className="flashcard-face flashcard-back">
                <div className="md-content" style={{ width: '100%', fontSize: deck === CORE_DECK_KEY ? '0.9rem' : '0.95rem' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.answer}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>

          <div className="flashcard-nav">
            <button className="btn-outline" onClick={prev} disabled={idx === 0} aria-label="이전 카드"><Icon name="chevron-left" size={16}/> 이전</button>
            <button className="btn-danger" onClick={() => markKnown(current, false)} style={{ padding: '10px 16px' }} aria-label="모름 표시"><Icon name="x" size={16}/> 모름</button>
            <span className="flashcard-counter" aria-live="polite">{idx + 1} / {cards.length}</span>
            <button className="btn-success" onClick={() => { markKnown(current, true); next(); }} style={{ padding: '10px 16px' }} aria-label="외움 표시"><Icon name="check" size={16}/> 외움</button>
            <button className="btn-outline" onClick={next} disabled={idx === cards.length - 1} aria-label="다음 카드">다음 <Icon name="chevron-right" size={16}/></button>
          </div>
        </>
      ) : null}
    </div>
  );
}
