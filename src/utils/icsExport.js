// 학습 일정(`roadmapSchedule()`)을 iCalendar(.ics, RFC 5545) 파일로 내보낸다.
//
// 왜 Google Calendar API 가 아니라 .ics 인가:
//  - 이 앱은 서버 없는 정적 SPA 라 OAuth 클라이언트 비밀키를 숨길 곳이 없다.
//  - .ics 는 자격증명이 전혀 필요 없고, Google·Apple·Outlook 이 모두 'Import' 로 받아 준다.
//
// 같은 파일을 다시 가져와도 중복되지 않게 UID 를 **날짜로부터 결정적으로** 만든다.
// 완료 체크나 시험일이 바뀌면 일정이 달라지므로, "날짜 → 이벤트 하나" 로 고정해 두면
// 재임포트가 새 이벤트를 쌓지 않고 같은 날짜 이벤트를 갱신하는 쪽으로 동작한다.
//
// 날짜는 전부 'YYYY-MM-DD' 문자열 산술로만 다룬다. `new Date('2026-10-01')` 같은 변환은
// 실행 환경 시간대(DST 포함)에 따라 하루가 밀릴 수 있어 쓰지 않는다.
// `Date` 는 DTSTAMP 를 만들 때 `getUTC*` 로 UTC 성분을 읽는 데만 쓴다.

const CRLF = '\r\n';

/** RFC 5545 §3.1 — 줄 길이(줄바꿈 제외)는 75옥텟을 넘기지 않는 것이 권고다 */
const MAX_LINE_OCTETS = 75;

const DEFAULT_CALENDAR_NAME = '정처기 학습 플랜';
const PRODID = '-//jungchogi-study//Roadmap//KO';
const UID_DOMAIN = 'jungchogi-study';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const REVIEW_SUMMARY = '복습일 (오답노트·플래시카드·코드퀴즈)';
const EXAM_SUMMARY = '정보처리기사 실기 시험';
const STUDY_FALLBACK_SUMMARY = '학습일';

/** Blob URL 해제를 미루는 시간(ms). 클릭 직후 해제하면 일부 브라우저가 다운로드 시작 전에 URL 을 잃는다 */
const REVOKE_DELAY_MS = 1000;

// ── 날짜 산술 (Date 없이) ──────────────────────────────────────────────

const pad = (n, width = 2) => String(n).padStart(width, '0');

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 'YYYY-MM-DD' → {y, m, d}. 형식이나 달력이 틀리면(2026-02-30 등) null */
function parseDate(dateKey) {
  const match = typeof dateKey === 'string' ? DATE_PATTERN.exec(dateKey) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/**
 * 다음 날짜. 월말·연말·윤년 2월을 넘긴다.
 * 9999-12-31 은 다음 날이 5자리 연도가 되어 DATE 형식(8자리)에 담을 수 없으므로 null.
 */
function nextDay({ y, m, d }) {
  if (d < daysInMonth(y, m)) return { y, m, d: d + 1 };
  if (m < 12) return { y, m: m + 1, d: 1 };
  return y < 9999 ? { y: y + 1, m: 1, d: 1 } : null;
}

/** {y, m, d} → 'YYYYMMDD' (iCalendar DATE 값) */
const toIcsDate = ({ y, m, d }) => `${pad(y, 4)}${pad(m)}${pad(d)}`;

/** `now` 를 UTC 'YYYYMMDDTHHMMSSZ' 로. 로컬 시간대와 무관하게 UTC 성분만 읽는다 */
function toUtcStamp(now) {
  // 잘못된 Date 를 넘겨도 내보내기가 던지지 않도록 현재 시각으로 대체한다
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const date = `${pad(at.getUTCFullYear(), 4)}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`;
  const time = `${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`;
  return `${date}T${time}Z`;
}

// ── 텍스트 이스케이프·접기 ─────────────────────────────────────────────

const TEXT_ESCAPES = { '\\': '\\\\', ';': '\\;', ',': '\\,', '\n': '\\n' };

/** TEXT 값에 넣을 수 없는 제어문자(탭·개행 제외)와 DEL */
function isForbiddenControl(code) {
  return (code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f;
}

/**
 * RFC 5545 §3.3.11 TEXT 이스케이프: `\` `;` `,` 개행.
 * 개행(CRLF·CR·LF)은 모두 `\n` 두 글자로 바꾼다 — 실제 줄바꿈이 값에 남으면
 * 한 속성이 둘로 쪼개져 파일이 깨진다. 역슬래시를 다른 문자와 같은 한 번의 순회로
 * 처리하므로 이미 만든 이스케이프가 다시 이스케이프되는 일도 없다.
 */
function escapeText(value) {
  const text = String(value).replace(/\r\n?/g, '\n');
  let out = '';
  for (const ch of text) {
    const escaped = TEXT_ESCAPES[ch];
    if (escaped !== undefined) out += escaped;
    else if (!isForbiddenControl(ch.charCodeAt(0))) out += ch;
  }
  return out;
}

/** 코드 포인트 하나의 UTF-8 옥텟 수 */
function utf8Size(codePoint) {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  // 짝 없는 서로게이트도 여기 들어온다 — 인코딩 시 U+FFFD(3옥텟)로 바뀌기 때문
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * 75옥텟 접기 (§3.1). 길이는 글자 수가 아니라 **UTF-8 옥텟** 기준이다 — 한글은 3옥텟이라
 * 25자만 써도 75옥텟이다. 코드 포인트 단위로 세므로 멀티바이트 문자(한글·이모지)가
 * 중간에서 잘리지 않는다. 이어지는 줄은 맨 앞 공백 1옥텟이 한도에 포함되어 내용은 74옥텟까지.
 */
function foldLine(line) {
  const chunks = [];
  let chunk = '';
  let octets = 0;
  let limit = MAX_LINE_OCTETS;
  for (const ch of line) {
    const size = utf8Size(ch.codePointAt(0));
    if (octets + size > limit) {
      chunks.push(chunk);
      chunk = '';
      octets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    chunk += ch;
    octets += size;
  }
  chunks.push(chunk);
  return chunks.join(`${CRLF} `);
}

// ── 이벤트 조립 ────────────────────────────────────────────────────────

/** 'Day03 Python+SQL' — Day 번호는 2자리. 값이 비어 있으면 있는 쪽만 쓴다 */
function unitTitle(unit) {
  const day = Number.isInteger(unit?.day) && unit.day >= 0 ? `Day${pad(unit.day)}` : '';
  const label = typeof unit?.label === 'string' ? unit.label.trim() : '';
  return [day, label].filter(Boolean).join(' ');
}

function dDayLabel(dDay) {
  if (!Number.isInteger(dDay)) return '';
  if (dDay === 0) return 'D-Day';
  return dDay > 0 ? `D-${dDay}` : `D+${-dDay}`;
}

function buildSummary(kind, unitTitles, title) {
  if (kind === 'exam') return EXAM_SUMMARY;
  if (typeof title === 'string' && title.trim()) return title.trim();
  if (kind === 'review') return REVIEW_SUMMARY;
  return unitTitles.length > 0 ? unitTitles.join(' · ') : STUDY_FALLBACK_SUMMARY;
}

/** DESCRIPTION 원문(이스케이프 전): D-n 과 그날 단위들의 단계 라벨 */
function buildDescription(entry, units) {
  const phases = [
    ...new Set(units.map((u) => u?.phase?.label).filter((l) => typeof l === 'string' && l)),
  ];
  const lines = [dDayLabel(entry.dDay)];
  if (phases.length > 0) lines.push(`단계: ${phases.join(' · ')}`);
  // 제목이 따로 있으면 그날의 학습 항목은 설명에 한 줄씩 적는다
  if (typeof entry.title === 'string' && entry.title.trim()) {
    for (const u of units) if (typeof u?.label === 'string' && u.label.trim()) lines.push(`- ${u.label.trim()}`);
  }
  if (entry.kind === 'review') lines.push('오답노트·플래시카드·코드퀴즈로 약점을 복습하세요.');
  return lines.filter(Boolean).join('\n');
}

/** 한 ScheduleEntry → VEVENT 내용 줄들. 날짜가 틀리면 null */
function buildEventLines(entry, stamp) {
  const start = parseDate(entry?.date);
  const end = start ? nextDay(start) : null;
  if (!start || !end) return null;

  const units = Array.isArray(entry.units) ? entry.units : [];
  const unitTitles = units.map(unitTitle).filter(Boolean);
  const description = buildDescription(entry, units);

  return [
    'BEGIN:VEVENT',
    `UID:jungchogi-${entry.date}@${UID_DOMAIN}`,
    `DTSTAMP:${stamp}`,
    // 종일 이벤트는 DTEND 가 "마지막 날의 다음 날"(배타적 끝)이어야 하루로 보인다
    `DTSTART;VALUE=DATE:${toIcsDate(start)}`,
    `DTEND;VALUE=DATE:${toIcsDate(end)}`,
    `SUMMARY:${escapeText(buildSummary(entry.kind, unitTitles, entry.title))}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    // 종일 학습 메모가 공유 캘린더에서 "하루 종일 바쁨"으로 보이지 않게 한다
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

/**
 * 일정을 RFC 5545 문자열로 만든다. 순수 함수 — 브라우저 API 를 쓰지 않는다.
 *
 * 비배열·빈 입력은 이벤트 없는 유효한 VCALENDAR 를 돌려주고, 날짜가 틀린 항목은 건너뛴다.
 * 같은 날짜가 두 번 오면 첫 항목만 쓴다 — UID 가 날짜 기반이라 둘 다 내보내면
 * 한 파일 안에 UID 가 겹치기 때문이다.
 *
 * @param {import('../domain/dailyPlan').ScheduleEntry[]} schedule
 * @param {{calendarName?: string, now?: Date}} [options]
 * @returns {string} CRLF 로 끝나는 줄들로 이루어진 iCalendar 텍스트
 */
export function buildIcs(schedule, { calendarName = DEFAULT_CALENDAR_NAME, now = new Date() } = {}) {
  const stamp = toUtcStamp(now);
  const name = typeof calendarName === 'string' && calendarName.trim() ? calendarName : DEFAULT_CALENDAR_NAME;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(name)}`,
  ];

  const seenDates = new Set();
  for (const entry of Array.isArray(schedule) ? schedule : []) {
    const eventLines = buildEventLines(entry, stamp);
    if (eventLines === null || seenDates.has(entry.date)) continue;
    seenDates.add(entry.date);
    lines.push(...eventLines);
  }

  lines.push('END:VCALENDAR');
  // 마지막 줄도 CRLF 로 끝내는 것이 RFC 의 content line 정의다
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/**
 * .ics 텍스트를 브라우저 다운로드로 내려받게 한다. 브라우저 전용 — 순수 함수 `buildIcs` 와 분리했다.
 *
 * @param {string} icsText `buildIcs` 의 결과
 * @param {string} [filename]
 */
export function downloadIcs(icsText, filename = 'jungchogi-plan.ics') {
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // 일부 브라우저는 DOM 에 붙어 있지 않은 링크의 click() 을 무시한다
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
