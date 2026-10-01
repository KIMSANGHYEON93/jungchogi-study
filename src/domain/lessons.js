// 로드맵 일차별 레슨 — 개념 요약 · 예제 코드 · 확인 퀴즈.
//
// 1단계 프로토타입으로 D-24(C 연산자) · D-23(C 제어문) · D-17(SQL) 세 일차만 담는다.
// 예제의 출력·퀴즈 정답은 직접 실행해 확인했다(C 는 gcc, SQL 은 SQLite 로 아래 표를 만들어 실행).
// 일차를 더 늘릴 때는 LESSONS 에 같은 모양의 항목을 추가하면 로드맵·레슨 화면이 그대로 따라온다.
//
// @typedef {Object} LessonQuestion
//   id        레슨 안에서 유일한 문항 id
//   prompt    문제 문장
//   code      (선택) 문제 코드  ·  lang  코드 언어
//   answer    정답(출력값). 채점은 공백·줄바꿈 차이를 무시한다(grading.matchesExpectedOutput)
//   explain   해설
//
// @typedef {Object} Lesson
//   id, d(일차), title, track('C'|'SQL'), minutes(예상 소요), summary, goals[],
//   sections[{heading, body, code?, lang?, output?}], pitfalls[], questions[]

export const LESSONS = [
  {
    id: 'c-operators',
    d: 24,
    title: 'C언어 연산자',
    track: 'C',
    minutes: 60,
    summary: '산술·증감·비트·논리 연산자의 결과와 우선순위를 손으로 계산한다.',
    goals: [
      '정수 나눗셈과 % 의 부호 규칙을 안다',
      '전위/후위 증감의 값 변화를 추적한다',
      '비트 연산(& | ^ ~ << >>)을 이진수로 계산한다',
      '논리 연산의 단락 평가를 설명한다',
    ],
    sections: [
      {
        heading: '산술 연산자 — 정수 나눗셈과 나머지',
        body: '정수끼리 나누면 소수점 이하가 버려지고(0 방향), % 의 부호는 왼쪽 피연산자를 따른다. 한쪽이 실수면 실수 나눗셈이다.',
        lang: 'c',
        code: '#include <stdio.h>\nint main(void) {\n    printf("%d %d %d %.1f\\n", 7 / 2, -7 / 2, -7 % 3, 7 / 2.0);\n    return 0;\n}',
        output: '3 -3 -1 3.5',
      },
      {
        heading: '증감 연산자 — 전위와 후위',
        body: '후위(x++)는 현재 값을 쓰고 나서 증가, 전위(++x)는 증가한 뒤 그 값을 쓴다.',
        lang: 'c',
        code: '#include <stdio.h>\nint main(void) {\n    int x = 5;\n    int y = x++;   /* y = 5, x = 6 */\n    int z = ++x;   /* x = 7, z = 7 */\n    printf("%d %d %d\\n", x, y, z);\n    return 0;\n}',
        output: '7 5 7',
      },
      {
        heading: '비트 연산자와 시프트',
        body: '5 = 0101, 3 = 0011. & 는 둘 다 1, | 는 하나라도 1, ^ 는 서로 다를 때 1 이다. ~5 는 -(5+1) = -6. << n 은 ×2ⁿ, 부호 있는 >> n 은 ÷2ⁿ(산술 시프트).',
        lang: 'c',
        code: '#include <stdio.h>\nint main(void) {\n    printf("%d %d %d %d %d %d\\n", 5 & 3, 5 | 3, 5 ^ 3, ~5, 1 << 3, -16 >> 2);\n    return 0;\n}',
        output: '1 7 6 -6 8 -4',
      },
      {
        heading: '논리 연산자 — 단락 평가',
        body: '&& 는 왼쪽이 거짓이면 오른쪽을 평가하지 않고, || 는 왼쪽이 참이면 오른쪽을 건너뛴다. 오른쪽의 증감이 실행되지 않는 것이 단골 함정이다.',
        lang: 'c',
        code: '#include <stdio.h>\nint main(void) {\n    int a = 0, b = 0;\n    if (a++ && b++) { }   /* a++ 는 0(거짓) → b++ 는 건너뜀 */\n    printf("%d %d\\n", a, b);\n    return 0;\n}',
        output: '1 0',
      },
    ],
    pitfalls: [
      '-7 / 2 는 -4 가 아니라 -3 (0 방향 절단)',
      '우선순위: * / % → + - → 시프트 → 비교 → & → ^ → | → && → || → 삼항 → 대입',
      '한 식 안에서 같은 변수를 두 번 증감하면 결과가 정해지지 않는다(시험에서는 피한다)',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '출력 결과는?',
        lang: 'c',
        code: 'int r = 2 + 3 * 4 % 5;\nprintf("%d", r);',
        answer: '4',
        explain: '* 와 % 는 같은 순위라 왼쪽부터: 3*4 = 12, 12%5 = 2, 2+2 = 4.',
      },
      {
        id: 'q2',
        prompt: '출력 결과는?',
        lang: 'c',
        code: 'int x = 5;\nint y = x++;\nint z = ++x;\nprintf("%d %d %d", x, y, z);',
        answer: '7 5 7',
        explain: 'y 는 증가 전 값 5, x 는 6. ++x 로 x = 7 이 되고 z = 7.',
      },
      {
        id: 'q3',
        prompt: '출력 결과는?',
        lang: 'c',
        code: 'printf("%d %d", 5 ^ 3, -16 >> 2);',
        answer: '6 -4',
        explain: '0101 ^ 0011 = 0110(6). -16 을 산술 시프트로 2칸 밀면 -16 / 4 = -4.',
      },
      {
        id: 'q4',
        prompt: '출력 결과는?',
        lang: 'c',
        code: 'int a = 0, b = 0;\nif (a++ && b++) { }\nprintf("%d %d", a, b);',
        answer: '1 0',
        explain: 'a++ 의 값은 0(거짓)이라 && 오른쪽은 평가되지 않는다. a 만 1 로 증가.',
      },
    ],
  },
  {
    id: 'c-control-flow',
    d: 23,
    title: 'C언어 제어문',
    track: 'C',
    minutes: 60,
    summary: 'for · while · switch 와 break/continue 의 흐름을 변수 추적표로 따라간다.',
    goals: [
      'continue 와 break 가 반복에 미치는 영향을 구분한다',
      'switch 의 fall-through(break 없는 연속 실행)를 설명한다',
      '중첩 반복문의 실행 횟수와 누적값을 계산한다',
      'do-while 이 최소 1회 실행됨을 안다',
    ],
    sections: [
      {
        heading: 'for + continue + break',
        body: 'continue 는 이번 회차의 나머지를 건너뛰고 증감식으로, break 는 반복문 전체를 끝낸다. 조건을 위에서부터 차례로 적용한다.',
        lang: 'c',
        code: '#include <stdio.h>\nint main(void) {\n    int sum = 0;\n    for (int i = 1; i <= 10; i++) {\n        if (i % 2 == 0) continue;   /* 짝수 건너뜀 */\n        if (i > 7) break;            /* 9 에서 종료 */\n        sum += i;                    /* 1 + 3 + 5 + 7 */\n    }\n    printf("%d\\n", sum);\n    return 0;\n}',
        output: '16',
      },
      {
        heading: 'switch — fall-through',
        body: 'case 에 일치하면 그 지점부터 break 를 만날 때까지 아래 case 를 모두 실행한다. default 는 어떤 case 와도 맞지 않을 때만 실행된다.',
        lang: 'c',
        code: '#include <stdio.h>\nint main(void) {\n    int n = 2;\n    switch (n) {\n        case 1: printf("A");\n        case 2: printf("B");   /* 여기서 시작 */\n        case 3: printf("C"); break;\n        default: printf("D");\n    }\n    printf("\\n");\n    return 0;\n}',
        output: 'BC',
      },
      {
        heading: '중첩 for — 누적 계산',
        body: '안쪽 반복은 바깥 한 회차마다 처음부터 다시 돈다. i 가 1,2,3 일 때 j 는 각각 1회, 2회, 3회 돌아 총 6번 실행된다.',
        lang: 'c',
        code: '#include <stdio.h>\nint main(void) {\n    int t = 0;\n    for (int i = 1; i <= 3; i++)\n        for (int j = 1; j <= i; j++)\n            t += i * j;   /* 1 + (2+4) + (3+6+9) */\n    printf("%d\\n", t);\n    return 0;\n}',
        output: '25',
      },
      {
        heading: 'do-while — 최소 1회 실행',
        body: '조건을 몸체 뒤에서 검사하므로 처음부터 거짓이어도 한 번은 실행한다.',
        lang: 'c',
        code: '#include <stdio.h>\nint main(void) {\n    int m = 0;\n    do { m += 3; } while (m < 10);   /* 3, 6, 9, 12 */\n    printf("%d\\n", m);\n    return 0;\n}',
        output: '12',
      },
    ],
    pitfalls: [
      'switch 에서 break 를 빠뜨리면 아래 case 가 이어서 실행된다',
      'while 안의 continue 는 증감식 위치에 따라 무한 루프가 될 수 있다 (증감이 continue 앞에 있는지 확인)',
      'for 의 세 부분은 모두 생략 가능하지만 세미콜론은 남아야 한다 — for(;;) 는 무한 루프',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '출력 결과는?',
        lang: 'c',
        code: 'int c = 0;\nfor (int i = 1; i <= 5; i++) {\n    if (i == 3) continue;\n    c += i;\n}\nprintf("%d", c);',
        answer: '12',
        explain: 'i = 3 만 건너뛰므로 1 + 2 + 4 + 5 = 12.',
      },
      {
        id: 'q2',
        prompt: '출력 결과는?',
        lang: 'c',
        code: 'int n = 1;\nswitch (n) {\n    case 1: printf("A");\n    case 2: printf("B"); break;\n    case 3: printf("C");\n}',
        answer: 'AB',
        explain: 'case 1 에서 시작해 break 가 있는 case 2 까지 실행한다.',
      },
      {
        id: 'q3',
        prompt: '출력 결과는?',
        lang: 'c',
        code: 'int t = 0;\nfor (int i = 1; i <= 3; i++)\n    for (int j = 1; j <= i; j++)\n        t += i * j;\nprintf("%d", t);',
        answer: '25',
        explain: 'i=1: 1, i=2: 2+4=6, i=3: 3+6+9=18. 합 25.',
      },
      {
        id: 'q4',
        prompt: '출력 결과는?',
        lang: 'c',
        code: 'int m = 0;\ndo { m += 3; } while (m < 10);\nprintf("%d", m);',
        answer: '12',
        explain: 'm 이 3, 6, 9, 12 가 되고 12 에서 조건이 거짓이라 끝난다.',
      },
    ],
  },
  {
    id: 'sql-join-group',
    d: 17,
    title: 'SQL — JOIN · GROUP BY · HAVING · 서브쿼리',
    track: 'SQL',
    minutes: 60,
    summary: '두 표를 묶고 그룹별로 집계한 뒤 조건으로 거르는 순서를 결과 표로 직접 그려 본다.',
    goals: [
      'INNER JOIN 과 LEFT JOIN 의 행 수 차이를 설명한다',
      'WHERE 와 HAVING 의 적용 시점을 구분한다',
      'COUNT(*) 와 COUNT(컬럼) 의 NULL 처리 차이를 안다',
      '스칼라 서브쿼리로 평균 이상/이하를 거른다',
    ],
    tables: [
      {
        name: 'DEPT',
        columns: ['id', 'name'],
        rows: [[10, '영업'], [20, '개발'], [30, '인사'], [40, '기획']],
      },
      {
        name: 'EMP',
        columns: ['id', 'name', 'dept', 'sal'],
        rows: [[1, '김', 10, 300], [2, '이', 10, 500], [3, '박', 20, 400], [4, '최', 20, 200], [5, '정', 30, 600], [6, '한', null, 100]],
      },
    ],
    sections: [
      {
        heading: 'INNER JOIN vs LEFT JOIN',
        body: 'INNER JOIN 은 양쪽에 짝이 있는 행만 남긴다. LEFT JOIN 은 왼쪽 표의 행을 모두 남기고 짝이 없으면 오른쪽을 NULL 로 채운다. EMP 의 한(dept NULL)은 INNER JOIN 에서 사라지고, 사원이 없는 기획(40)은 DEPT 기준 LEFT JOIN 에서 NULL 행으로 남는다.',
        lang: 'sql',
        code: 'SELECT COUNT(*) FROM EMP e JOIN DEPT d ON e.dept = d.id;        -- 5\nSELECT COUNT(*) FROM DEPT d LEFT JOIN EMP e ON e.dept = d.id;   -- 6',
        output: '5 / 6',
      },
      {
        heading: 'GROUP BY + HAVING',
        body: '실행 순서는 FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY. WHERE 는 그룹을 만들기 전 행을, HAVING 은 집계 결과(그룹)를 거른다.',
        lang: 'sql',
        code: 'SELECT d.name, SUM(e.sal)\nFROM EMP e JOIN DEPT d ON e.dept = d.id\nGROUP BY d.name\nHAVING SUM(e.sal) >= 600\nORDER BY d.name;',
        output: '개발 600 / 영업 800 / 인사 600',
      },
      {
        heading: 'COUNT 와 NULL',
        body: 'COUNT(*) 는 행 수, COUNT(컬럼) 은 NULL 이 아닌 값의 수다. 집계 함수(COUNT(*) 제외)는 NULL 을 무시한다.',
        lang: 'sql',
        code: 'SELECT COUNT(dept), COUNT(*) FROM EMP;   -- 5, 6',
        output: '5 6',
      },
      {
        heading: '서브쿼리 — 평균보다 많이 받는 사원',
        body: '안쪽 쿼리를 먼저 계산해 값 하나로 바꾼 뒤 바깥 WHERE 가 비교한다. EMP 급여 평균은 2100 / 6 = 350.',
        lang: 'sql',
        code: 'SELECT name FROM EMP\nWHERE sal > (SELECT AVG(sal) FROM EMP);',
        output: '이 / 박 / 정',
      },
    ],
    pitfalls: [
      '비교 연산에서 NULL 은 참도 거짓도 아니다 — dept <> 10 은 dept 가 NULL 인 행을 포함하지 않는다',
      'HAVING 에는 집계 함수를, WHERE 에는 집계 함수를 쓸 수 없다',
      'GROUP BY 에 없는 컬럼을 집계 없이 SELECT 하면 오류(또는 임의 값)',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '결과 행 수는? (숫자만 입력)',
        lang: 'sql',
        code: 'SELECT dept, COUNT(*)\nFROM EMP\nGROUP BY dept\nHAVING COUNT(*) >= 2;',
        answer: '2',
        explain: 'dept 별 사원 수는 10:2, 20:2, 30:1, NULL:1. HAVING 으로 2명 이상인 10, 20 두 그룹만 남는다.',
      },
      {
        id: 'q2',
        prompt: '출력되는 값은?',
        lang: 'sql',
        code: 'SELECT COUNT(*)\nFROM DEPT d LEFT JOIN EMP e ON e.dept = d.id;',
        answer: '6',
        explain: '영업 2 + 개발 2 + 인사 1 + 기획(짝 없음) 1 = 6.',
      },
      {
        id: 'q3',
        prompt: '결과 행 수는? (숫자만 입력)',
        lang: 'sql',
        code: 'SELECT name FROM EMP\nWHERE sal > (SELECT AVG(sal) FROM EMP);',
        answer: '3',
        explain: '평균 350 보다 큰 사원은 이(500), 박(400), 정(600).',
      },
      {
        id: 'q4',
        prompt: '출력되는 값은?',
        lang: 'sql',
        code: 'SELECT COUNT(*) FROM EMP WHERE dept <> 10;',
        answer: '3',
        explain: '박·최·정. dept 가 NULL 인 한은 NULL <> 10 이 참이 아니라서 제외된다.',
      },
    ],
  },
];

export const lessonByDay = (d) => LESSONS.find((l) => l.d === Number(d)) ?? null;
export const lessonById = (id) => LESSONS.find((l) => l.id === id) ?? null;
