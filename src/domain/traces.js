// 코드 트레이싱 드릴(public/data/정처기_코드트레이싱_드릴.md)의 문제별 실행 추적 데이터.
//
// 모든 항목은 실제 gcc / javac / python3 로 문제 코드를 실행해 expectedOutput 과 일치함을 확인하고,
// 변수 상태는 Python 은 sys.settrace, C/Java 는 printf/System.err 삽입 계측으로 뽑아 손 추적표와 대조했다.
// line 은 문제 코드 블록 안의 1-기준 줄 번호이고, 각 step 의 변수는 그 줄을 "실행한 직후" 상태다.

/**
 * 행을 [line, 이번 줄에서 바뀐 변수, 새로 출력된 것] 으로 적으면 이전 step 의 변수를 이어받아 누적한다.
 * 손으로 매 step 마다 전체 변수를 반복해 적다가 한 칸 틀리는 실수를 막기 위해서다.
 * @returns {{step: number, line: number, variables: Record<string, string|number|null>, output?: string}[]}
 */
function build(rows) {
  const vars = {};
  return rows.map(([line, delta, output], i) => {
    Object.assign(vars, delta);
    const step = { step: i + 1, line, variables: { ...vars } };
    if (output) step.output = output;
    return step;
  });
}

export const TRACES = {
  // int a=10,b=20; p=&a → *p=30(a) → p=&b → *p=50(b)
  'C-01': {
    steps: build([
      [3, { a: 10, b: 20 }],
      [4, { p: '&a' }],
      [5, { a: 30 }],
      [6, { p: '&b' }],
      [7, { b: 50 }],
      [8, {}, '30 50'],
    ]),
  },
  // a++ 는 값을 쓰고 증가, ++b 는 증가 후 값을 쓴다
  'C-02': {
    steps: build([
      [3, { a: 5, b: 5 }],
      [4, { a: 6, b: 6, c: 11 }],
      [5, { a: 7, b: 7, d: 13 }],
      [6, {}, '7 7 11 13'],
    ]),
  },
  'C-03': {
    steps: build([
      [3, { a: '{1,2,3,4,5}' }],
      [4, { p: 'a[1]', '*p': 2 }],
      [5, {}, '2 '],
      [6, {}, '4 '],
      [7, {}, '4 '],
    ]),
  },
  // f(7) = 7 * f(5) = 7*5*f(3) = 7*5*3*f(1) = 105
  'C-04': {
    steps: build([
      [3, { n: 7, ret: null }],
      [4, { n: 7 }],
      [3, { n: 5 }],
      [4, { n: 5 }],
      [3, { n: 3 }],
      [4, { n: 3 }],
      [3, { n: 1, ret: 1 }],
      [4, { n: 3, ret: 3 }],
      [4, { n: 5, ret: 15 }],
      [4, { n: 7, ret: 105 }],
      [7, {}, '105'],
    ]),
  },
  // 필드는 참조 타입(A) 기준, 메서드는 실제 객체(B) 기준
  'J-01': {
    steps: build([
      [11, { 'A.x': 10, 'B.x': 20, obj: 'B 객체' }],
      [12, { 'obj.x': 10, 'obj.f()': 'B' }, '10 B\n'],
    ]),
  },
  'J-03': {
    steps: build([
      [11, { count: 0 }],
      [5, { count: 1 }],
      [6, { 'a.id': 1 }],
      [12, {}],
      [5, { count: 2 }],
      [6, { 'b.id': 2 }],
      [13, {}],
      [5, { count: 3 }],
      [6, { 'c.id': 3 }],
      [14, {}, '1 2 3\n'],
    ]),
  },
  'J-04': {
    steps: build([
      [12, { s: null }],
      [7, { w: 3, h: 4 }],
      [12, { s: 'Rect 객체' }],
      [13, { 's.area()': 12, 's.perimeter()': 0 }, '12 0\n'],
    ]),
  },
  'P-01': {
    steps: build([
      [1, { a: '[1, 2, 3, 4, 5, 6, 7, 8]' }],
      [2, {}, '[3, 4, 5]\n'],
      [3, {}, '[1, 4, 7]\n'],
      [4, {}, '[6, 7, 8]\n'],
      [5, {}, '[2, 4, 6]\n'],
    ]),
  },
  'P-02': {
    steps: build([
      [1, { a: '{1, 2, 3, 4, 5}' }],
      [2, { b: '{3, 4, 5, 6, 7}' }],
      [3, {}, '{3, 4, 5}\n'],
      [4, {}, '{1, 2, 3, 4, 5, 6, 7}\n'],
      [5, {}, '{1, 2}\n'],
      [6, {}, '4\n'],
    ]),
  },
  // map/filter 의 람다 호출은 한 줄 안에서 끝나므로 줄 단위 step 으로 접었다
  'P-03': {
    steps: build([
      [1, { f: 'lambda x: x ** 2 + 1' }],
      [2, { a: '[1, 2, 3, 4]' }],
      [3, { result: '[2, 5, 10, 17]' }],
      [4, {}, '[2, 5, 10, 17]\n'],
      [5, {}, '[10, 17]\n'],
    ]),
  },
  'P-04': {
    steps: build([
      [1, { d: "{'a': 1, 'b': 2, 'c': 3}" }],
      [2, { d: "{'a': 1, 'b': 2, 'c': 3, 'd': 4}" }],
      [3, { d: "{'a': 1, 'b': 20, 'c': 3, 'd': 4}" }],
      [4, {}, "{'a': 1, 'b': 20, 'c': 3, 'd': 4}\n"],
      [5, {}, "['a', 'b', 'c', 'd']\n"],
      [6, {}, '28\n'],
    ]),
  },
};

/** 문제 id 의 추적 데이터. 아직 만들지 않은 문제는 null. */
export function traceFor(id) {
  return Object.prototype.hasOwnProperty.call(TRACES, id) ? TRACES[id] : null;
}
