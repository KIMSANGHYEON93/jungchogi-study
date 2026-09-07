// 평문 응답에서 JSON 객체를 건져 내고, 스키마를 프롬프트로 내리는 유틸.
//
// 엄격 스키마(`response_format: json_schema`)를 지원하는 무료 모델은 소수다.
// 나머지 모델에서는 "JSON 만 내라" 고 지시해도 이런 것들이 섞여 온다:
//   · ```json 코드펜스로 감싸기
//   · "결과는 다음과 같습니다:" 같은 머리말·맺음말
//   · 값 안에 중괄호나 이스케이프된 따옴표
// 여기서 흡수할 수 있는 만큼만 흡수하고, 못 건지면 **null 을 돌려준다**.
// 그러면 프로바이더가 `text` 를 그대로 넘기고 호출부(`normalizeGrade`·`extractPlan`)가
// 자기 규칙으로 판정한다 — 여기서 억지로 만들어 내면 조용히 틀린 채점이 된다.

/** 코드펜스만 벗긴다 (앞뒤 설명은 남긴다 — 균형 탐색이 알아서 건너뛴다) */
function stripCodeFence(text) {
  const opening = text.match(/```[ \t]*[A-Za-z0-9_-]*[ \t]*\r?\n/);
  if (!opening) return text;

  const start = opening.index + opening[0].length;
  const rest = text.slice(start);
  const closing = rest.indexOf('```');
  // 닫는 펜스가 없는 경우(절단)도 열린 채로 읽는다
  return closing >= 0 ? rest.slice(0, closing) : rest;
}

/**
 * `{` 부터 균형이 맞는 `}` 까지를 잘라 낸다. 문자열 리터럴 안의 괄호는 세지 않는다.
 * @param {string} text
 * @param {number} start `{` 의 위치
 * @returns {string|null} 균형이 맞기 전에 끝나면 null
 */
function sliceBalancedObject(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 모델이 낸 텍스트에서 JSON **객체** 하나를 건져 낸다.
 *
 * 최상위가 배열·문자열·숫자면 null 이다 — 이 앱의 구조화 출력 계약은 전부 객체이고,
 * 배열을 객체로 넘기면 호출부가 `typeof === 'object'` 만 보고 통과시킬 수 있다.
 * @param {unknown} text
 * @returns {object|null}
 */
export function extractJsonObject(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;

  const body = stripCodeFence(text).trim();
  if (body === '') return null;

  // ① 응답 전체가 온전한 JSON 이면 그것이 답이다.
  //    객체가 아니면 **파고들지 않는다** — 배열 하나를 통째로 낸 모델에게
  //    "몇 번째 원소를 뜻했나" 를 우리가 추측하면 조용히 다른 답이 된다.
  try {
    const whole = JSON.parse(body);
    return whole !== null && typeof whole === 'object' && !Array.isArray(whole) ? whole : null;
  } catch {
    // 앞뒤에 설명이 붙었거나 절단됐다 — 아래에서 객체만 건져 본다
  }

  // ② `{` 를 앞에서부터 시도한다. 설명문의 여는 괄호는 균형이 안 맞아 걸러지는데,
  //    그때 **멈추면 안 된다** — 진짜 객체가 그 뒤에 있을 수 있다.
  for (let i = body.indexOf('{'); i >= 0; i = body.indexOf('{', i + 1)) {
    const candidate = sliceBalancedObject(body, i);
    if (candidate === null) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // 이 여는 괄호는 JSON 이 아니었다 — 다음 후보로
    }
  }
  return null;
}

/**
 * 스키마를 시스템 프롬프트에 실을 수 있는 지시문으로 만든다.
 *
 * `response_format` 을 못 쓰거나 `json_object` 까지만 되는 모델에게는 이것이
 * 스키마를 알리는 **유일한 수단**이다. 출력이 결정적이어야 한다 —
 * 같은 스키마에 매번 다른 문자열을 만들면 프롬프트 캐시가 매번 어긋난다.
 * @param {object|null|undefined} schema JSON Schema
 * @param {string} [name] 스키마 이름 (모델이 부를 이름)
 * @returns {string} 스키마가 없으면 빈 문자열
 */
export function describeSchema(schema, name) {
  if (schema === null || typeof schema !== 'object') return '';

  const label = typeof name === 'string' && name.trim() !== '' ? name.trim() : 'output';
  return [
    '# 출력 형식 (반드시 지킵니다)',
    `아래 JSON Schema(\`${label}\`)를 만족하는 **JSON 객체 하나만** 출력합니다.`,
    '코드펜스·머리말·맺음말·설명 문장을 덧붙이지 않습니다. 응답 전체가 그 JSON 이어야 합니다.',
    '```json',
    JSON.stringify(schema, null, 2),
    '```',
  ].join('\n');
}
