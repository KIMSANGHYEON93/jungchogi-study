// OpenRouter 스트림 파서 — `lib/ai/providers/sse.js`.
//
// **청크 경계는 프레임 경계와 아무 관계가 없다.** 한 프레임이 두 청크에 걸치고,
// 한 청크에 여러 프레임이 들어오고, 한글 한 글자가 UTF-8 3바이트로 쪼개져 온다.
// 브라우저 쪽 `src/services/sseClient.js` 가 이미 같은 경우의 수를 다루고 있고,
// 여기는 그 서버판이다 (브라우저 모듈이라 그대로 import 할 수 없다).

import { describe, it, expect } from 'vitest';
import { createSseBuffer, iterateSseData, iterateSseJson } from '../lib/ai/providers/sse.js';

const encoder = new TextEncoder();

/** 문자열 청크 목록을 바이트 스트림으로 만든다 */
function byteStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

/** getReader() 만 있고 async iterator 가 없는 스트림 (브라우저 구현 흉내) */
function readerOnlyStream(chunks) {
  const stream = byteStream(chunks);
  return { getReader: () => stream.getReader() };
}

const collect = async (iterable) => {
  const out = [];
  for await (const item of iterable) out.push(item);
  return out;
};

describe('createSseBuffer — 프레임 경계', () => {
  it('완결된 프레임 하나를 꺼낸다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('data: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it('프레임이 청크 경계로 쪼개져도 이어 붙인다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('data: {"a":')).toEqual([]);
    expect(buffer.push('1}')).toEqual([]);
    expect(buffer.push('\n\n')).toEqual(['{"a":1}']);
  });

  it('한 청크에 여러 프레임이 오면 순서대로 전부 꺼낸다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('data: 1\n\ndata: 2\n\ndata: 3\n\n')).toEqual(['1', '2', '3']);
  });

  it('주석 줄(:)은 버린다 — OpenRouter 가 킵얼라이브로 보낸다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push(': OPENROUTER PROCESSING\n\n')).toEqual([]);
    expect(buffer.push('data: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it('data 아닌 필드(event·id·retry)는 버린다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('event: message\nid: 7\nretry: 100\ndata: {"a":1}\n\n')).toEqual([
      '{"a":1}',
    ]);
  });

  it('data 줄이 여러 개면 SSE 규격대로 개행으로 잇는다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('data: {"a":\ndata: 1}\n\n')).toEqual(['{"a":\n1}']);
  });

  it('data: 뒤 공백은 한 칸만 지운다 (규격)', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('data:  두칸\n\n')).toEqual([' 두칸']);
  });

  it('공백 없는 data: 도 읽는다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('data:{"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it('CRLF 로 오는 프레임도 같은 경계로 자른다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('data: {"a":1}\r\n\r\n')).toEqual(['{"a":1}']);
  });

  it('CRLF 가 청크 경계에 걸려도 (\\r | \\n) 프레임을 놓치지 않는다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('data: {"a":1}\r')).toEqual([]);
    expect(buffer.push('\n\r\n')).toEqual(['{"a":1}']);
  });

  it('빈 프레임(연속 개행)은 아무것도 내지 않는다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('\n\n\n\ndata: 1\n\n')).toEqual(['1']);
  });

  it('flush 는 끝맺음 빈 줄 없이 끝난 마지막 프레임을 꺼낸다', () => {
    const buffer = createSseBuffer();
    expect(buffer.push('data: {"a":1}')).toEqual([]);
    expect(buffer.flush()).toEqual(['{"a":1}']);
  });

  it('flush 는 버퍼가 비어 있으면 아무것도 내지 않는다', () => {
    const buffer = createSseBuffer();
    buffer.push('data: 1\n\n');
    expect(buffer.flush()).toEqual([]);
  });

  it('flush 뒤 버퍼는 비어 있다 — 같은 프레임을 두 번 내지 않는다', () => {
    const buffer = createSseBuffer();
    buffer.push('data: 1');
    expect(buffer.flush()).toEqual(['1']);
    expect(buffer.flush()).toEqual([]);
  });
});

describe('iterateSseData — 바이트 스트림', () => {
  it('스트림 전체를 프레임 단위로 읽는다', async () => {
    const data = await collect(iterateSseData(byteStream(['data: 1\n\ndata: 2\n\n'])));
    expect(data).toEqual(['1', '2']);
  });

  it('한글이 UTF-8 3바이트로 청크 경계에 걸려도 깨지지 않는다', async () => {
    const bytes = encoder.encode('data: {"t":"정규화"}\n\n');
    // "정" 의 3바이트 중간에서 자른다
    const cut = 12;
    const data = await collect(iterateSseData(byteStream([bytes.slice(0, cut), bytes.slice(cut)])));
    expect(JSON.parse(data[0])).toEqual({ t: '정규화' });
  });

  it('끝맺음 빈 줄 없이 끊긴 마지막 프레임도 흘린다', async () => {
    const data = await collect(iterateSseData(byteStream(['data: 1\n\ndata: 2'])));
    expect(data).toEqual(['1', '2']);
  });

  it('async iterator 가 없고 getReader 만 있는 스트림도 읽는다', async () => {
    const data = await collect(iterateSseData(readerOnlyStream(['data: 1\n\n'])));
    expect(data).toEqual(['1']);
  });

  it('본문이 null 이면 아무것도 내지 않는다', async () => {
    expect(await collect(iterateSseData(null))).toEqual([]);
  });
});

describe('iterateSseJson — 파싱과 종료 표지', () => {
  it('프레임을 JSON 으로 읽어 낸다', async () => {
    const events = await collect(iterateSseJson(byteStream(['data: {"a":1}\n\n'])));
    expect(events).toEqual([{ a: 1 }]);
  });

  it('[DONE] 에서 멈추고 그 표지는 내보내지 않는다', async () => {
    const events = await collect(
      iterateSseJson(byteStream(['data: {"a":1}\n\ndata: [DONE]\n\ndata: {"b":2}\n\n']))
    );
    expect(events).toEqual([{ a: 1 }]);
  });

  it('[DONE] 앞뒤 공백도 종료 표지로 본다', async () => {
    const events = await collect(iterateSseJson(byteStream(['data:  [DONE] \n\ndata: {"b":2}\n\n'])));
    expect(events).toEqual([]);
  });

  it('JSON 이 아닌 프레임은 건너뛰고 계속 읽는다', async () => {
    const events = await collect(
      iterateSseJson(byteStream(['data: {"a":1}\n\ndata: 깨진{\n\ndata: {"b":2}\n\n']))
    );
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('JSON 스칼라(문자열·숫자·null)는 이벤트가 아니므로 건너뛴다', async () => {
    const events = await collect(
      iterateSseJson(byteStream(['data: 3\n\ndata: "hi"\n\ndata: null\n\ndata: {"b":2}\n\n']))
    );
    expect(events).toEqual([{ b: 2 }]);
  });

  it('[DONE] 없이 끊겨도 그때까지 받은 것은 남는다', async () => {
    const events = await collect(iterateSseJson(byteStream(['data: {"a":1}\n\ndata: {"b":2}'])));
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
