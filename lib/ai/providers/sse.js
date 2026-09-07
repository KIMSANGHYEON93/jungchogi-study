// OpenAI 호환 스트림(SSE) 파서 — 서버판.
//
// 브라우저 쪽 `src/services/sseClient.js` 가 우리 엔드포인트의 SSE 를 읽는데,
// 그 파일은 `fetch`·`AbortSignal`·앱 오류 타입에 묶인 브라우저 모듈이라 여기서
// import 할 수 없다. **다뤄야 할 경우의 수는 같다**:
//   · 한 프레임이 여러 청크에 걸쳐 온다 / 한 청크에 여러 프레임이 들어 있다
//   · UTF-8 멀티바이트 문자가 청크 경계에서 잘린다 (한글은 3바이트다)
//   · CRLF 를 쓰는 중계기가 있다. `\r\n` 이 청크 경계에 걸리기도 한다
//   · 주석 줄(`:`)·`event:`/`id:` 필드·빈 줄이 섞여 온다
//   · 한 프레임에 `data:` 줄이 여럿이면 개행으로 이어 붙인다 (SSE 규격)
//   · 마지막 프레임이 끝맺음 빈 줄 없이 끊긴다
//   · `data: [DONE]` 뒤로는 아무것도 읽지 않는다
//   · JSON 이 아닌 프레임이 섞여 온다 (중계기 안내문 등) → 버리고 계속 간다

/** OpenAI 호환 스트림의 종료 표지 */
export const DONE_MARKER = '[DONE]';

/**
 * 프레임 하나에서 `data:` 줄만 모아 잇는다.
 * @param {string} frame
 * @returns {string|null} data 줄이 하나도 없으면 null
 */
function readDataLines(frame) {
  const lines = [];
  for (const line of frame.split('\n')) {
    if (!line.startsWith('data:')) continue; // 주석(:)·event·id·retry 는 버린다
    // 규격상 콜론 뒤 공백 **한 칸만** 지운다. 두 칸째부터는 값이다.
    lines.push(line.slice(5).replace(/^ /, ''));
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * 청크를 이어 붙였다가 빈 줄 경계에서만 프레임을 꺼내는 버퍼.
 *
 * `\r\n` → `\n` 정규화를 **버퍼 전체에** 걸지 않고 새로 들어온 조각에만 걸면
 * `\r` 과 `\n` 이 다른 청크에 갈렸을 때 경계를 놓친다. 그래서 이어 붙인 뒤 통째로 정규화한다.
 * @returns {{push: (chunk: string) => string[], flush: () => string[]}}
 */
export function createSseBuffer() {
  let buffer = '';

  const take = (flush) => {
    const out = [];
    for (;;) {
      const boundary = buffer.indexOf('\n\n');
      let frame;
      if (boundary >= 0) {
        frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
      } else if (flush && buffer.trim() !== '') {
        frame = buffer;
        buffer = '';
      } else {
        // 끝맺음 없이 남은 조각은 다음 청크를 기다린다
        if (flush) buffer = '';
        return out;
      }

      const data = readDataLines(frame);
      if (data !== null) out.push(data);
    }
  };

  return {
    push(chunk) {
      buffer = (buffer + chunk).replace(/\r\n/g, '\n');
      return take(false);
    },
    flush() {
      buffer = buffer.replace(/\r\n/g, '\n');
      return take(true);
    },
  };
}

/**
 * 바이트 스트림을 청크 단위로 읽는다.
 *
 * Node 의 `ReadableStream` 은 async iterable 이지만 웹 표준 구현에는 없어서
 * `getReader()` 경로도 함께 둔다 (둘 중 있는 것을 쓴다).
 * @param {ReadableStream<Uint8Array>|AsyncIterable<Uint8Array>|null|undefined} source
 * @returns {AsyncGenerator<Uint8Array>}
 */
async function* iterateChunks(source) {
  if (!source) return;

  if (typeof source[Symbol.asyncIterator] === 'function') {
    yield* source;
    return;
  }

  if (typeof source.getReader === 'function') {
    const reader = source.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock?.();
    }
  } else {
    throw new TypeError('SSE 본문을 읽을 수 없습니다 (스트림이 아닙니다).');
  }
}

/**
 * 바이트 스트림에서 SSE 프레임의 data 문자열을 순서대로 흘린다.
 * @param {ReadableStream<Uint8Array>|AsyncIterable<Uint8Array>|null} source
 * @returns {AsyncGenerator<string>}
 */
export async function* iterateSseData(source) {
  const buffer = createSseBuffer();
  // `stream: true` 라야 멀티바이트 문자가 청크 경계에서 잘려도 다음 청크와 합쳐 읽는다
  const decoder = new TextDecoder();

  for await (const chunk of iterateChunks(source)) {
    for (const data of buffer.push(decoder.decode(chunk, { stream: true }))) yield data;
  }

  const tail = decoder.decode();
  for (const data of buffer.push(tail)) yield data;
  for (const data of buffer.flush()) yield data;
}

/**
 * SSE 프레임을 JSON 객체로 읽어 흘린다.
 *
 * - `[DONE]` 을 만나면 **즉시 멈춘다** (뒤에 뭐가 오든 읽지 않는다)
 * - JSON 이 아니거나 객체가 아닌 프레임은 버리고 계속 간다 — 중계기가 끼워 넣는
 *   안내문 한 줄 때문에 스트림 전체를 잃는 것이 더 나쁘다
 * @param {ReadableStream<Uint8Array>|AsyncIterable<Uint8Array>|null} source
 * @returns {AsyncGenerator<object>}
 */
export async function* iterateSseJson(source) {
  for await (const data of iterateSseData(source)) {
    if (data.trim() === DONE_MARKER) return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) yield parsed;
  }
}
