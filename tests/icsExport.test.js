// .ics 내보내기 검증.
//
// 파싱은 일부러 정규식 몇 줄짜리 헬퍼로 직접 한다 — 구현이 만든 문자열을 구현의 역함수가 아니라
// RFC 5545 의 규칙(줄 접기 해제 = CRLF+공백 제거, TEXT 역이스케이프)으로 읽어야
// 구현과 테스트가 같은 실수를 공유하지 않는다.
//
// 테스트 시간대는 `vite.config.js` 가 Asia/Seoul 로 고정한다. 그래서 `now` 를 UTC 15시로 주면
// 로컬 날짜가 하루 넘어가 있어, DTSTAMP 가 로컬 시간을 쓰는 회귀를 바로 걸러낸다.

import { describe, it, expect, vi, afterEach } from 'vitest';

import { buildIcs, downloadIcs } from '../src/utils/icsExport.js';
import { buildRoadmap, roadmapSchedule } from '../src/domain/roadmap.js';

const CRLF = '\r\n';
const NOW = new Date('2026-10-01T15:04:05Z');

const LEARN = { key: 'learn', label: '개념 학습' };
const PRACTICE = { key: 'practice', label: '실전·약점 보강' };
const FINAL = { key: 'final', label: '시험 마무리' };

const unit = (day, label, phase = LEARN) => ({ day, label, phase });
const study = (date, units, dDay = 10) => ({ date, dDay, kind: 'study', units });
const review = (date, dDay = 5) => ({ date, dDay, kind: 'review', units: [] });
const exam = (date) => ({ date, dDay: 0, kind: 'exam', units: [unit(14, '시험당일', FINAL)] });

/** 접힌 줄을 푼다 (RFC 5545 §3.1: CRLF 바로 뒤의 공백·탭 한 글자와 함께 제거) */
const unfold = (text) => text.replace(/\r\n[ \t]/g, '');

/** 접기를 푼 논리 줄들 (마지막 CRLF 뒤 빈 조각 제외) */
const logicalLines = (text) => unfold(text).split(CRLF).filter((line) => line !== '');

/** TEXT 값 역이스케이프 */
const unescapeText = (value) =>
  value.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

/** VEVENT 들을 {속성머리: 값} 맵으로. 속성머리는 파라미터 포함(예: 'DTSTART;VALUE=DATE') */
function parseEvents(text) {
  const events = [];
  let current = null;
  for (const line of logicalLines(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT') {
      events.push(current);
      current = null;
    } else if (current) {
      const colon = line.indexOf(':');
      current[line.slice(0, colon)] = line.slice(colon + 1);
    }
  }
  return events;
}

const countOf = (text, needle) => text.split(needle).length - 1;
const octets = (line) => Buffer.byteLength(line, 'utf8');

/** 짝 없는 서로게이트(= 4옥텟 문자가 중간에서 잘린 흔적) 검출 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('buildIcs: 문서 구조', () => {
  const ics = buildIcs([study('2026-10-01', [unit(3, 'Python+SQL')])], { now: NOW });

  it('첫 줄은 BEGIN:VCALENDAR, 마지막 내용 줄은 END:VCALENDAR 이다', () => {
    const lines = ics.split(CRLF);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    // 모든 content line 은 CRLF 로 끝나므로 마지막 조각은 빈 문자열이다
    expect(lines.at(-1)).toBe('');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
  });

  it('줄바꿈은 전부 CRLF 이고 맨몸 LF/CR 이 없다', () => {
    expect(ics).toContain(CRLF);
    expect(ics.replaceAll(CRLF, '')).not.toMatch(/[\r\n]/);
  });

  it('필수 헤더(VERSION·PRODID·CALSCALE·X-WR-CALNAME)가 있다', () => {
    const lines = logicalLines(ics);
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('CALSCALE:GREGORIAN');
    expect(lines.some((l) => l.startsWith('PRODID:-//'))).toBe(true);
    expect(lines).toContain('X-WR-CALNAME:정처기 학습 플랜');
  });

  it('calendarName 은 바꿀 수 있고, 비었거나 문자열이 아니면 기본값이다', () => {
    const named = buildIcs([], { calendarName: '내 플랜', now: NOW });
    expect(logicalLines(named)).toContain('X-WR-CALNAME:내 플랜');
    for (const bad of ['', '   ', null, 42]) {
      expect(logicalLines(buildIcs([], { calendarName: bad, now: NOW }))).toContain(
        'X-WR-CALNAME:정처기 학습 플랜'
      );
    }
  });

  it('DTSTAMP 는 now 의 UTC 시각이다 (로컬 시간대와 무관)', () => {
    // Asia/Seoul 이면 이 순간은 이미 10/02 00:04 — 로컬을 쓰면 20261002T000405 가 나온다
    expect(parseEvents(ics)[0].DTSTAMP).toBe('20261001T150405Z');
    expect(parseEvents(ics)[0].DTSTAMP).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it('now 가 잘못된 Date 여도 던지지 않고 형식을 지킨다', () => {
    const out = buildIcs([review('2026-10-01')], { now: new Date('nope') });
    expect(parseEvents(out)[0].DTSTAMP).toMatch(/^\d{8}T\d{6}Z$/);
  });
});

describe('buildIcs: 이벤트 개수와 요약', () => {
  it('유효한 항목마다 VEVENT 하나를 만든다', () => {
    const out = buildIcs(
      [
        study('2026-10-01', [unit(1, 'C언어')]),
        review('2026-10-02'),
        exam('2026-10-03'),
      ],
      { now: NOW }
    );
    expect(countOf(out, 'BEGIN:VEVENT')).toBe(3);
    expect(countOf(out, 'END:VEVENT')).toBe(3);
    expect(parseEvents(out)).toHaveLength(3);
  });

  it('study 요약은 Day 번호 2자리 + 라벨을 " · " 로 잇는다', () => {
    const out = buildIcs(
      [
        study('2026-10-01', [unit(3, 'Python+SQL'), unit(4, 'SQL심화')]),
        study('2026-10-02', [unit(12, '최종정리', PRACTICE)]),
      ],
      { now: NOW }
    );
    const [a, b] = parseEvents(out);
    expect(unescapeText(a.SUMMARY)).toBe('Day03 Python+SQL · Day04 SQL심화');
    expect(unescapeText(b.SUMMARY)).toBe('Day12 최종정리');
  });

  it('review·exam 요약은 고정 문구다', () => {
    const [r, e] = parseEvents(buildIcs([review('2026-10-02'), exam('2026-10-25')], { now: NOW }));
    expect(unescapeText(r.SUMMARY)).toBe('복습일 (오답노트·플래시카드·코드퀴즈)');
    expect(unescapeText(e.SUMMARY)).toBe('정보처리기사 실기 시험');
  });

  it('단위가 없는 study 도 던지지 않고 대체 문구를 쓴다', () => {
    const out = buildIcs([{ date: '2026-10-01', kind: 'study', dDay: 3, units: null }], { now: NOW });
    expect(unescapeText(parseEvents(out)[0].SUMMARY)).toBe('학습일');
  });

  it('DESCRIPTION 에 D-n 과 단계 라벨이 들어간다', () => {
    const out = buildIcs(
      [
        study('2026-10-01', [unit(3, 'Python+SQL'), unit(9, '모의고사1', PRACTICE)], 12),
        review('2026-10-02', 5),
        exam('2026-10-25'),
      ],
      { now: NOW }
    );
    const [s, r, e] = parseEvents(out).map((ev) => unescapeText(ev.DESCRIPTION));
    expect(s).toContain('D-12');
    expect(s).toContain('개념 학습');
    expect(s).toContain('실전·약점 보강');
    expect(r).toContain('D-5');
    expect(e).toContain('D-Day');
    expect(e).toContain('시험 마무리');
  });
});

describe('buildIcs: 종일 이벤트 날짜', () => {
  const endOf = (date) => {
    const [ev] = parseEvents(buildIcs([review(date)], { now: NOW }));
    return { start: ev['DTSTART;VALUE=DATE'], end: ev['DTEND;VALUE=DATE'] };
  };

  it('DTSTART/DTEND 는 VALUE=DATE 형식이고 DTEND 는 다음 날이다', () => {
    expect(endOf('2026-10-01')).toEqual({ start: '20261001', end: '20261002' });
  });

  it('시간(T…) 성분이 없다', () => {
    const out = buildIcs([review('2026-10-01')], { now: NOW });
    expect(out).not.toMatch(/^DT(START|END)(?!;VALUE=DATE:\d{8}$).*$/m);
  });

  it.each([
    ['월말(31일)', '2026-10-31', '20261101'],
    ['월말(30일)', '2026-04-30', '20260501'],
    ['연말', '2026-12-31', '20270101'],
    ['평년 2월 말', '2026-02-28', '20260301'],
    ['윤년 2월 28일', '2028-02-28', '20280229'],
    ['윤년 2월 29일', '2028-02-29', '20280301'],
    ['400의 배수 윤년', '2000-02-28', '20000229'],
    ['100의 배수 평년', '2100-02-28', '21000301'],
    ['월 중간', '2026-10-24', '20261025'],
  ])('DTEND 경계: %s', (_name, date, expectedEnd) => {
    expect(endOf(date)).toEqual({ start: date.replaceAll('-', ''), end: expectedEnd });
  });

  it('9999-12-31 은 다음 날을 DATE 로 표현할 수 없어 건너뛴다', () => {
    const out = buildIcs([review('9999-12-31'), review('9999-12-30')], { now: NOW });
    expect(parseEvents(out).map((e) => e['DTSTART;VALUE=DATE'])).toEqual(['99991230']);
  });
});

describe('buildIcs: TEXT 이스케이프', () => {
  it('역슬래시·세미콜론·쉼표·개행을 이스케이프한다', () => {
    const out = buildIcs([study('2026-10-01', [unit(1, 'a,b;c\\d\ne')])], { now: NOW });
    const raw = logicalLines(out).find((l) => l.startsWith('SUMMARY:'));
    expect(raw).toBe('SUMMARY:Day01 a\\,b\\;c\\\\d\\ne');
  });

  it('CRLF·CR 도 \\n 두 글자 하나로 바뀌고 실제 줄바꿈은 남지 않는다', () => {
    const out = buildIcs([study('2026-10-01', [unit(1, 'x\r\ny\rz')])], { now: NOW });
    expect(unescapeText(parseEvents(out)[0].SUMMARY)).toBe('Day01 x\ny\nz');
    expect(out.replaceAll(CRLF, '')).not.toMatch(/[\r\n]/);
  });

  it('역슬래시 다음 쉼표처럼 겹친 경우도 한 번씩만 이스케이프한다', () => {
    const out = buildIcs([study('2026-10-01', [unit(1, 'p\\,q')])], { now: NOW });
    const raw = logicalLines(out).find((l) => l.startsWith('SUMMARY:'));
    expect(raw).toBe('SUMMARY:Day01 p\\\\\\,q');
    expect(unescapeText(raw.slice('SUMMARY:'.length))).toBe('Day01 p\\,q');
  });

  it('TEXT 에 둘 수 없는 제어문자는 제거한다', () => {
    const out = buildIcs([study('2026-10-01', [unit(1, 'a\u0000b\u0007c\u007fd')])], { now: NOW });
    expect(unescapeText(parseEvents(out)[0].SUMMARY)).toBe('Day01 abcd');
  });

  it('캘린더 이름도 이스케이프한다', () => {
    const out = buildIcs([], { calendarName: 'A,B;C', now: NOW });
    expect(logicalLines(out)).toContain('X-WR-CALNAME:A\\,B\\;C');
  });
});

describe('buildIcs: 75옥텟 접기', () => {
  /** 학습 항목 하나의 SUMMARY 줄과 그 줄을 이루는 물리 줄들 */
  function summaryPhysicalLines(label) {
    const out = buildIcs([study('2026-10-01', [unit(1, label)])], { now: NOW });
    const physical = out.split(CRLF);
    const start = physical.findIndex((l) => l.startsWith('SUMMARY:'));
    let end = start + 1;
    while (physical[end]?.startsWith(' ')) end += 1;
    return { out, lines: physical.slice(start, end) };
  }

  it('모든 물리 줄이 75옥텟 이하다 (접은 뒤 이어지는 줄은 공백 포함)', () => {
    const { out } = summaryPhysicalLines('a'.repeat(300));
    for (const line of out.split(CRLF)) expect(octets(line)).toBeLessThanOrEqual(75);
  });

  it('정확히 75옥텟이면 접지 않고, 76옥텟이 되면 접는다', () => {
    // 'SUMMARY:Day01 ' = 14옥텟
    expect(summaryPhysicalLines('a'.repeat(61)).lines).toHaveLength(1);
    expect(octets(summaryPhysicalLines('a'.repeat(61)).lines[0])).toBe(75);
    expect(summaryPhysicalLines('a'.repeat(62)).lines).toEqual([
      `SUMMARY:Day01 ${'a'.repeat(61)}`,
      ' a',
    ]);
  });

  it('접힌 줄을 풀면 원문과 정확히 같다', () => {
    const label = 'abc가나다'.repeat(40);
    const { out } = summaryPhysicalLines(label);
    expect(parseEvents(out)[0].SUMMARY).toBe(`Day01 ${label}`);
  });

  it('한글(3옥텟)이 한도 경계에 걸리면 통째로 다음 줄로 넘긴다', () => {
    // 14 + 20자×3 = 74옥텟. 다음 글자를 넣으면 77 > 75 라서 거기서 접어야 한다.
    const label = '가'.repeat(60);
    const { lines, out } = summaryPhysicalLines(label);

    expect(octets(lines[0])).toBe(74);
    expect(lines[0]).toBe(`SUMMARY:Day01 ${'가'.repeat(20)}`);
    // 이어지는 줄: 공백 1 + 한글 24자(72) = 73옥텟 (25자면 76 이라 넘친다)
    expect(lines[1]).toBe(` ${'가'.repeat(24)}`);
    expect(octets(lines[1])).toBe(73);
    expect(lines[2]).toBe(` ${'가'.repeat(16)}`);

    for (const line of out.split(CRLF)) {
      expect(octets(line)).toBeLessThanOrEqual(75);
      // UTF-8 왕복이 같다 = 대체문자(U+FFFD)로 깨진 글자가 없다
      expect(Buffer.from(line, 'utf8').toString('utf8')).toBe(line);
      expect(line).not.toContain('�');
    }
    expect(parseEvents(out)[0].SUMMARY).toBe(`Day01 ${label}`);
  });

  it('4옥텟 문자(이모지)도 중간에서 잘리지 않는다', () => {
    const label = '😀'.repeat(30);
    const { out } = summaryPhysicalLines(label);
    for (const line of out.split(CRLF)) {
      expect(octets(line)).toBeLessThanOrEqual(75);
      expect(line).not.toMatch(LONE_SURROGATE);
    }
    expect(parseEvents(out)[0].SUMMARY).toBe(`Day01 ${label}`);
  });

  it('이어지는 줄은 항상 공백으로 시작하고, 접힌 줄 사이에 빈 줄이 없다', () => {
    const { lines } = summaryPhysicalLines('가'.repeat(100));
    expect(lines.length).toBeGreaterThan(2);
    for (const cont of lines.slice(1)) expect(cont.startsWith(' ')).toBe(true);
    expect(lines.every((l) => l.length > 1)).toBe(true);
  });

  it('긴 캘린더 이름 헤더도 접는다', () => {
    const name = '정처기 학습 플랜 '.repeat(10);
    const out = buildIcs([], { calendarName: name, now: NOW });
    for (const line of out.split(CRLF)) expect(octets(line)).toBeLessThanOrEqual(75);
    expect(logicalLines(out)).toContain(`X-WR-CALNAME:${name}`);
  });
});

describe('buildIcs: UID 결정성', () => {
  const schedule = [
    study('2026-10-01', [unit(1, 'C언어')]),
    review('2026-10-02'),
    exam('2026-10-25'),
  ];

  it('UID 는 jungchogi-<date>@jungchogi-study 이다', () => {
    const uids = parseEvents(buildIcs(schedule, { now: NOW })).map((e) => e.UID);
    expect(uids).toEqual([
      'jungchogi-2026-10-01@jungchogi-study',
      'jungchogi-2026-10-02@jungchogi-study',
      'jungchogi-2026-10-25@jungchogi-study',
    ]);
  });

  it('시각·내용이 달라져도 같은 날짜의 UID 는 같다 (재임포트가 중복을 만들지 않는다)', () => {
    const first = parseEvents(buildIcs(schedule, { now: NOW }));
    const later = parseEvents(
      buildIcs(
        [study('2026-10-01', [unit(2, 'Java')]), review('2026-10-02'), exam('2026-10-25')],
        { now: new Date('2026-10-20T00:00:00Z') }
      )
    );
    expect(later.map((e) => e.UID)).toEqual(first.map((e) => e.UID));
    // DTSTAMP 는 내보낸 시각이라 달라진다 — 갱신 판정에 쓰이는 값
    expect(later[0].DTSTAMP).not.toBe(first[0].DTSTAMP);
  });

  it('같은 입력·같은 now 면 출력이 바이트 단위로 같다', () => {
    expect(buildIcs(schedule, { now: NOW })).toBe(buildIcs(schedule, { now: NOW }));
  });

  it('한 파일 안에서 UID 가 겹치지 않는다 — 같은 날짜가 둘이면 첫 항목만 쓴다', () => {
    const out = buildIcs(
      [study('2026-10-01', [unit(1, 'C언어')]), review('2026-10-01'), review('2026-10-02')],
      { now: NOW }
    );
    const events = parseEvents(out);
    expect(events).toHaveLength(2);
    expect(new Set(events.map((e) => e.UID)).size).toBe(2);
    expect(unescapeText(events[0].SUMMARY)).toBe('Day01 C언어');
  });
});

describe('buildIcs: 빈·잘못된 입력', () => {
  const emptyCalendar = (out) => {
    expect(out.startsWith(`BEGIN:VCALENDAR${CRLF}`)).toBe(true);
    expect(out.endsWith(`END:VCALENDAR${CRLF}`)).toBe(true);
    expect(out).not.toContain('BEGIN:VEVENT');
    expect(logicalLines(out)).toContain('VERSION:2.0');
  };

  it.each([
    ['빈 배열', []],
    ['undefined', undefined],
    ['null', null],
    ['문자열', 'not an array'],
    ['객체', { schedule: [] }],
    ['숫자', 7],
  ])('%s → 이벤트 없는 유효한 VCALENDAR (던지지 않는다)', (_name, input) => {
    expect(() => buildIcs(input, { now: NOW })).not.toThrow();
    emptyCalendar(buildIcs(input, { now: NOW }));
  });

  it('옵션 없이 호출해도 동작한다', () => {
    expect(() => buildIcs()).not.toThrow();
    emptyCalendar(buildIcs());
    expect(() => buildIcs([review('2026-10-01')])).not.toThrow();
  });

  it('날짜 형식·달력이 틀린 항목은 건너뛰고 나머지는 살린다', () => {
    const bad = [
      '2026-02-30', // 없는 날
      '2025-02-29', // 평년 2월 29일
      '2100-02-29', // 100의 배수 평년
      '2026-13-01',
      '2026-00-10',
      '2026-10-00',
      '2026-10-32',
      '2026-4-30', // 0 패딩 없음
      '2026/10/01',
      '20261001',
      ' 2026-10-01',
      '2026-10-01\n',
      '0000-01-01',
      '',
      null,
      undefined,
      20261001,
    ];
    const schedule = [
      ...bad.map((date) => ({ date, dDay: 1, kind: 'review', units: [] })),
      null,
      'x',
      5,
      {},
      review('2026-10-05'),
    ];
    const events = parseEvents(buildIcs(schedule, { now: NOW }));
    expect(events).toHaveLength(1);
    expect(events[0].UID).toBe('jungchogi-2026-10-05@jungchogi-study');
  });

  it('윤년 2월 29일은 유효한 날짜로 받아 준다', () => {
    const [ev] = parseEvents(buildIcs([review('2028-02-29')], { now: NOW }));
    expect(ev['DTSTART;VALUE=DATE']).toBe('20280229');
  });

  it('units 안의 이상한 값(null·누락 필드)에도 던지지 않는다', () => {
    const out = buildIcs(
      [study('2026-10-01', [null, { day: 'x' }, { label: '라벨만' }, { day: 5 }, unit(6, 'SW공학')])],
      { now: NOW }
    );
    expect(unescapeText(parseEvents(out)[0].SUMMARY)).toBe('라벨만 · Day05 · Day06 SW공학');
  });
});

describe('buildIcs: title 이 있는 일정', () => {
  it('title 이 있으면 SUMMARY 가 title 이고, 학습 항목은 설명에 한 줄씩 적는다', () => {
    const entry = {
      date: '2026-10-01', dDay: 24, kind: 'study', title: 'D-24 C언어 연산자',
      units: [{ label: 'C언어 — 연산자', phase: { label: '코딩 · SQL 집중' } }, { label: '  ' }, null],
    };
    const [event] = parseEvents(buildIcs([entry], { now: NOW }));
    expect(unescapeText(event.SUMMARY)).toBe('D-24 C언어 연산자');
    const desc = unescapeText(event.DESCRIPTION).split('\n');
    expect(desc).toContain('D-24');
    expect(desc).toContain('단계: 코딩 · SQL 집중');
    expect(desc).toContain('- C언어 — 연산자');
    expect(desc).toHaveLength(3);
  });

  it('title 이 비었거나 문자열이 아니면 기존 규칙(Day 라벨)을 쓴다', () => {
    const [a, b] = parseEvents(
      buildIcs(
        [
          { date: '2026-10-01', dDay: 3, kind: 'study', title: '   ', units: [unit(1, 'C언어')] },
          { date: '2026-10-02', dDay: 2, kind: 'study', title: 42, units: [unit(2, 'Java')] },
        ],
        { now: NOW }
      )
    );
    expect(unescapeText(a.SUMMARY)).toBe('Day01 C언어');
    expect(unescapeText(b.SUMMARY)).toBe('Day02 Java');
  });

  it('시험 당일은 title 이 있어도 시험 문구다', () => {
    const [event] = parseEvents(buildIcs([{ date: '2026-10-25', dDay: 0, kind: 'exam', title: 'x', units: [] }], { now: NOW }));
    expect(unescapeText(event.SUMMARY)).toBe('정보처리기사 실기 시험');
  });
});

describe('buildIcs: 실제 roadmapSchedule 결과', () => {
  const roadmap = buildRoadmap({ examDate: '2026-10-25', today: '2026-10-01' });
  const schedule = roadmapSchedule(roadmap);
  const events = parseEvents(buildIcs(schedule, { now: NOW }));

  it('오늘~시험일 전부가 하루에 하나씩 이벤트가 된다', () => {
    expect(schedule).toHaveLength(25);
    expect(events).toHaveLength(25);
    expect(events[0]['DTSTART;VALUE=DATE']).toBe('20261001');
    expect(new Set(events.map((e) => e.UID)).size).toBe(25);
  });

  it('제목은 D-n 과 일차 제목이다', () => {
    expect(unescapeText(events[0].SUMMARY)).toBe('D-24 C언어 연산자');
    expect(unescapeText(events[8].SUMMARY)).toBe('D-16 1단계 점검');
  });

  it('시험 당일 이벤트는 시험 문구이고 DTEND 는 다음 날이다', () => {
    const last = events.at(-1);
    expect(last['DTSTART;VALUE=DATE']).toBe('20261025');
    expect(last['DTEND;VALUE=DATE']).toBe('20261026');
    expect(unescapeText(last.SUMMARY)).toBe('정보처리기사 실기 시험');
    expect(unescapeText(last.DESCRIPTION)).toContain('D-Day');
  });

  it('첫날 설명에 D-24 · 단계 · 학습 항목이 있다', () => {
    const desc = unescapeText(events[0].DESCRIPTION);
    expect(desc).toContain('D-24');
    expect(desc).toContain('단계: 코딩 · SQL 집중');
    expect(desc).toContain('- C언어 — 산술 · 증감 · 비트 · 논리 연산자');
  });

  it('3단계 날은 공통 복습과 기사 특화 항목을 모두 적는다', () => {
    const d9 = events.find((e) => unescapeText(e.SUMMARY).startsWith('D-9 '));
    const desc = unescapeText(d9.DESCRIPTION);
    expect(desc).toContain('- 공통 복습');
    expect(desc).toContain('- SDLC');
  });

  it('연속한 날짜의 DTEND 는 다음 이벤트의 DTSTART 와 맞물린다', () => {
    for (let i = 0; i < events.length - 1; i += 1) {
      expect(events[i]['DTEND;VALUE=DATE']).toBe(events[i + 1]['DTSTART;VALUE=DATE']);
    }
  });
});

describe('downloadIcs', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Blob 으로 a[download] 를 클릭하고 URL 을 해제한다', async () => {
    vi.useFakeTimers();
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const body = { appendChild: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body });
    let blob;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blob = b;
      return 'blob:mock-url';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const text = buildIcs([review('2026-10-01')], { now: NOW });
    downloadIcs(text);

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toBe('jungchogi-plan.ics');
    expect(body.appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(blob.type).toBe('text/calendar;charset=utf-8');
    expect(await blob.text()).toBe(text);

    // 클릭 직후에는 아직 해제하지 않고, 잠시 뒤에 해제한다
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:mock-url');
  });

  it('파일명을 바꿀 수 있다', () => {
    vi.useFakeTimers();
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    downloadIcs('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', 'custom.ics');
    expect(anchor.download).toBe('custom.ics');
  });
});
