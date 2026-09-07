// 평문에서 JSON 을 건져 내기 — `lib/ai/providers/json.js`.
//
// 엄격 스키마(json_schema)를 못 쓰는 무료 모델에서는 "JSON 만 내라" 고 시켜도
// 코드펜스로 감싸거나 앞뒤에 설명을 붙여 온다. 그 경우를 여기서 흡수하고,
// 그래도 못 건지면 `data: null` 로 두어 **호출부가 text 를 다루게** 한다
// (`normalizeGrade`·`extractPlan` 이 이미 그 경로를 갖고 있다).

import { describe, it, expect } from 'vitest';
import { extractJsonObject, describeSchema } from '../lib/ai/providers/json.js';

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['correct', 'incorrect'] },
    score: { type: 'integer', description: '0 이상 100 이하' },
  },
  required: ['verdict', 'score'],
  additionalProperties: false,
};

describe('extractJsonObject — 잘 온 경우', () => {
  it('JSON 객체 그대로', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('앞뒤 공백·개행이 붙어도 읽는다', () => {
    expect(extractJsonObject('\n\n  {"a":1}  \n')).toEqual({ a: 1 });
  });

  it('한글 값도 그대로 보존한다', () => {
    expect(extractJsonObject('{"feedback":"정규화를 반대로 썼습니다"}')).toEqual({
      feedback: '정규화를 반대로 썼습니다',
    });
  });
});

describe('extractJsonObject — 코드펜스', () => {
  it('```json 펜스를 벗긴다', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('언어 태그 없는 펜스도 벗긴다', () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('대문자 태그(```JSON)도 벗긴다', () => {
    expect(extractJsonObject('```JSON\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('닫는 펜스가 없어도 읽는다 — max_tokens 로 잘리면 이렇게 온다', () => {
    expect(extractJsonObject('```json\n{"a":1}')).toEqual({ a: 1 });
  });
});

describe('extractJsonObject — 앞뒤에 설명이 붙은 경우', () => {
  it('앞에 문장이 있어도 건져 낸다', () => {
    expect(extractJsonObject('알겠습니다. 결과는 다음과 같습니다:\n{"a":1}')).toEqual({ a: 1 });
  });

  it('뒤에 문장이 있어도 건져 낸다', () => {
    expect(extractJsonObject('{"a":1}\n\n이상입니다. 더 궁금한 점이 있으면 알려 주세요.')).toEqual({
      a: 1,
    });
  });

  it('앞뒤 양쪽에 설명 + 펜스까지 겹쳐도 건져 낸다', () => {
    const text = '채점 결과입니다.\n\n```json\n{"verdict":"correct"}\n```\n\n도움이 되었길 바랍니다.';
    expect(extractJsonObject(text)).toEqual({ verdict: 'correct' });
  });

  it('설명 안의 중괄호에 속지 않고 진짜 객체를 찾는다', () => {
    expect(extractJsonObject('{ 이건 JSON 이 아니라 그냥 괄호다\n\n{"a":1}')).toEqual({ a: 1 });
  });

  it('객체가 여러 개면 처음으로 완결되는 것을 쓴다', () => {
    expect(extractJsonObject('{"a":1}\n{"b":2}')).toEqual({ a: 1 });
  });
});

describe('extractJsonObject — 문자열 안의 괄호', () => {
  it('값에 중괄호가 들어 있어도 경계를 헷갈리지 않는다', () => {
    expect(extractJsonObject('{"code":"if (x) { y(); }"}')).toEqual({ code: 'if (x) { y(); }' });
  });

  it('이스케이프된 따옴표를 문자열 끝으로 오해하지 않는다', () => {
    expect(extractJsonObject('{"q":"그는 \\"응집도\\" 라고 썼다"}')).toEqual({
      q: '그는 "응집도" 라고 썼다',
    });
  });

  it('중첩 객체·배열을 끝까지 읽는다', () => {
    expect(extractJsonObject('앞말 {"items":[{"n":1},{"n":2}],"m":{"k":[]}} 뒷말')).toEqual({
      items: [{ n: 1 }, { n: 2 }],
      m: { k: [] },
    });
  });

  it('역슬래시로 끝나는 문자열도 올바로 닫는다', () => {
    expect(extractJsonObject('{"p":"C:\\\\temp\\\\"}')).toEqual({ p: 'C:\\temp\\' });
  });
});

describe('extractJsonObject — 못 건지는 경우는 null 이다', () => {
  it.each([
    ['빈 문자열', ''],
    ['공백만', '   \n  '],
    ['null·undefined 가 아닌 값이 아님', null],
    ['숫자만 넘어옴', 42],
    ['JSON 이 아닌 평문', '무엇을 채점해야 할지 모르겠습니다.'],
    ['중괄호가 안 닫힘 (절단)', '{"a":1'],
    ['따옴표가 안 닫힘', '{"a":"열린 문자열'],
    ['JSON 스칼라', '42'],
    ['JSON 문자열', '"correct"'],
    ['JSON null', 'null'],
    ['최상위 배열 — 계약은 객체다', '[{"a":1}]'],
  ])('%s → null', (_label, input) => {
    expect(extractJsonObject(input)).toBeNull();
  });

  it('스키마를 어긴 JSON 은 그대로 돌려준다 — 판정은 호출부 몫이다', () => {
    // verdict 가 계약 밖이고 score 가 문자열이지만, 여기서 거르지 않는다.
    // `normalizeGrade` 가 "조인다 / 거절한다" 를 이미 나눠 갖고 있다.
    expect(extractJsonObject('{"verdict":"아마도","score":"백점"}')).toEqual({
      verdict: '아마도',
      score: '백점',
    });
  });
});

describe('describeSchema — 스키마를 프롬프트로 내리기', () => {
  it('스키마 JSON 을 그대로 싣는다', () => {
    const text = describeSchema(SCHEMA, 'grade');
    expect(text).toContain('"verdict"');
    expect(text).toContain('"additionalProperties": false');
  });

  it('스키마 이름을 알린다', () => {
    expect(describeSchema(SCHEMA, 'grade')).toContain('grade');
  });

  it('이름이 없어도 동작한다', () => {
    expect(describeSchema(SCHEMA)).toContain('"verdict"');
  });

  it('JSON 하나만 내라고 못 박는다', () => {
    const text = describeSchema(SCHEMA, 'grade');
    expect(text).toMatch(/JSON/);
    expect(text).toMatch(/코드펜스|설명/);
  });

  it('같은 스키마면 같은 문자열이다 — 캐시 프리픽스에 실려도 흔들리지 않게', () => {
    expect(describeSchema(SCHEMA, 'grade')).toBe(describeSchema(SCHEMA, 'grade'));
  });

  it('스키마가 없으면 빈 문자열이다', () => {
    expect(describeSchema(null, 'grade')).toBe('');
    expect(describeSchema(undefined)).toBe('');
  });
});
