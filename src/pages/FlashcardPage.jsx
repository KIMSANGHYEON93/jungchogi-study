import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { parseQuiz } from '../utils/parseQuiz';
import { parseBogang } from '../utils/parseBogang';
import { saveProgress, loadProgress } from '../utils/storage';
import useSwipe from '../hooks/useSwipe';
import useStudyTimer from '../hooks/useStudyTimer';
import { fetchMarkdown } from '../utils/mdCache';
import Icon from '../components/Icon';
import BookmarkButton from '../components/ui/BookmarkButton';
import { DECK_BOOKMARK_TYPE } from '../domain/bookmarks';
import { resolveBogangId } from '../domain/bogangDeck';
import useStudyState from '../hooks/useStudyState';
import { bookmarkKey } from '../utils/studyState';
import {
  useDeepLinkId,
  useDeepLinkedIndex,
  deckDeepLinkNotice,
  DEEP_LINK_NOTICE_STYLE,
} from '../hooks/useDeepLink';

const CATEGORIES = ['전체', '데이터베이스', '소프트웨어공학', '디자인패턴/UML', '테스트', '보안/네트워크', 'OS/기타'];

// `idPattern` 은 교재 카드 id 형식이다 — 딥링크가 어느 덱을 가리키는지 모양으로 가른다.
const DECKS = [
  { key: 'quiz100', label: '단답형 100선', file: '정처기_단답형_100선.md', parser: 'quiz', idPattern: /^\d{3}$/ },
  { key: 'bogang119', label: '암기 119선 보강', file: '정처기_보강_기출분석_암기119선.md', parser: 'bogang', idPattern: /^B\d{2,3}(-\d+)?$/ },
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
        setAllCards(deckInfo.parser === 'quiz' ? parseQuiz(text) : parseBogang(text));
        setKnown(loadProgress(`flashcard_known_${deck}`, {}));
      });
    return () => { cancelled = true; };
  }, [deck]);

  const isKnown = useCallback((card) => !!known[card.id], [known]);

  // 필터 결과는 파생 상태 — effect 없이 렌더 중 계산한다
  const filtered = useMemo(() => {
    let f = allCards;
    if (category !== '전체') f = f.filter((c) => c.category === category);
    if (filterMode === 'unknown') f = f.filter((c) => !isKnown(c));
    if (filterMode === 'bookmarked') f = f.filter((c) => bookmarkKey(bookmarkType, c.id) in bookmarks);
    return f;
  }, [allCards, category, filterMode, isKnown, bookmarks, bookmarkType]);

  // 셔플은 그 대상이 지금의 filtered 와 같을 때만 유효하다
  const cards = shuffled && shuffled.source === filtered ? shuffled.order : filtered;

  // 카드 커서. 딥링크가 지목한 카드가 지금 목록에 있으면 거기서 시작한다.
  // 목록이 줄어 커서가 범위를 벗어나는 경우(모르는 것만 필터에서 외움 처리)도
  // 이 훅이 첫 카드로 되돌린다.
  // 쪼개기 전의 섹션 id(`B07`)로 온 링크는 그 섹션의 첫 카드로 보낸다
  const wantedId = deck === 'bogang119' ? resolveBogangId(requestedId, allCards) : requestedId;
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

  // 필터를 바꾸면 첫 카드로 되돌린다 — effect 대신 이벤트 핸들러에서 리셋
  const changeCategory = (cat) => { setCategory(cat); setIndex(0); setFlipped(false); };
  const changeFilterMode = (mode) => { setFilterMode(mode); setIndex(0); setFlipped(false); };

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
    const handler = (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev]);

  const swipeHandlers = useSwipe({
    onSwipeLeft: next,
    onSwipeRight: prev,
  });

  const knownCount = allCards.filter((c) => known[c.id]).length;
  const current = cards[idx];

  return (
    <div className="page">
      <h1>플래시카드</h1>
      <p className="subtitle">탭하여 뒤집기, 좌우 스와이프로 이동</p>

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

      {cards.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          {filterMode === 'unknown' ? <><Icon name="party" size={24}/> 모든 카드를 외웠습니다!</>
            : filterMode === 'bookmarked' && allCards.length > 0 ? '북마크한 카드가 없습니다. 카드 위의 북마크 버튼으로 추가해 보세요.'
            : '문제를 불러오는 중...'}
        </div>
      ) : current ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <BookmarkButton
              active={study.isBookmarked(bookmarkType, current.id)}
              onToggle={() => study.toggleBookmark(bookmarkType, current.id)}
              label={`${current.id}번 카드 북마크`}
            />
          </div>
          <div className="flashcard-container" {...swipeHandlers}>
            <div className={`flashcard ${flipped ? 'flipped' : ''} ${deck === 'bogang119' && flipped ? 'flashcard-tall' : ''}`} onClick={() => setFlipped(!flipped)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(!flipped); } }} role="button" tabIndex={0} aria-label="카드 뒤집기">
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
                <div className="md-content" style={{ width: '100%', fontSize: deck === 'bogang119' ? '0.85rem' : '0.95rem' }}>
                  <ReactMarkdown>{current.answer}</ReactMarkdown>
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
