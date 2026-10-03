// SQL 빈칸 채우기 문항과 채점 규칙.
// 시험 답안은 대소문자·공백·세미콜론 표기가 제각각이라, 글자 그대로가 아니라 정규화 후 비교한다.

/**
 * SQL 한 조각을 비교용 문자열로 정규화한다.
 * 소문자화, 연속 공백 → 한 칸, 앞뒤 공백·끝의 `;` 제거, 구분 기호·비교 연산자 둘레 공백 제거.
 * 연산자 둘레 공백을 지우는 이유: `a >= 1` 과 `a>=1` 은 같은 답인데 사람마다 띄우는 습관이 다르다.
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeSql(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/;+$/, '')
    .trim()
    // 긴 연산자를 먼저 두어 `<=` 가 `<`, `=` 로 쪼개져 처리되지 않게 한다
    .replace(/\s*(<=|>=|<>|!=|[,()=<>])\s*/g, '$1');
}

/**
 * 입력이 정답 후보 중 하나와 정규화 후 같은지.
 * 빈 입력은 정답 후보가 빈 문자열이어도 오답으로 본다 — 안 쓴 칸이 맞은 것으로 나오면 안 된다.
 * @param {unknown} input
 * @param {string[]} answers
 * @returns {boolean}
 */
export function checkBlank(input, answers) {
  const got = normalizeSql(input);
  if (got === '') return false;
  return Array.isArray(answers) && answers.some((a) => normalizeSql(a) === got);
}

/** 모든 문항이 공유하는 표 정의 */
const EMP = { name: 'emp', columns: ['id', 'name', 'dept_id', 'salary'] };
const DEPT = { name: 'dept', columns: ['dept_id', 'dept_name'] };

// 각 solution 은 python3 sqlite3 로 emp/dept 샘플 데이터를 만들어 실행해 의도한 결과를 확인했다.
export const SQL_BLANK_ITEMS = [
  {
    id: 'SQ-01',
    title: '기본 조회 SELECT-FROM-WHERE',
    prompt: '급여(salary)가 3000 이상인 사원의 이름과 급여를 조회하시오.',
    tables: [EMP],
    template: '[[1]] name, salary [[2]] emp [[3]] salary >= 3000;',
    blanks: [
      { id: 1, answers: ['SELECT'] },
      { id: 2, answers: ['FROM'] },
      { id: 3, answers: ['WHERE'] },
    ],
    solution: 'SELECT name, salary FROM emp WHERE salary >= 3000;',
  },
  {
    id: 'SQ-02',
    title: '중복 제거 DISTINCT',
    prompt: '사원이 속한 부서번호(dept_id)를 중복 없이 조회하시오.',
    tables: [EMP],
    template: 'SELECT [[1]] dept_id FROM emp;',
    blanks: [{ id: 1, answers: ['DISTINCT'] }],
    solution: 'SELECT DISTINCT dept_id FROM emp;',
  },
  {
    id: 'SQ-03',
    title: '그룹별 집계 GROUP BY-HAVING',
    prompt: '부서별 사원 수를 구하되, 사원이 2명 이상인 부서만 조회하시오.',
    tables: [EMP],
    template: 'SELECT dept_id, COUNT(*) FROM emp [[1]] dept_id [[2]] COUNT(*) >= 2;',
    blanks: [
      { id: 1, answers: ['GROUP BY'] },
      { id: 2, answers: ['HAVING'] },
    ],
    solution: 'SELECT dept_id, COUNT(*) FROM emp GROUP BY dept_id HAVING COUNT(*) >= 2;',
  },
  {
    id: 'SQ-04',
    title: '테이블 결합 JOIN-ON',
    prompt: '사원 이름과 소속 부서명을 함께 조회하시오.',
    tables: [EMP, DEPT],
    template: 'SELECT e.name, d.dept_name FROM emp e [[1]] dept d [[2]] e.dept_id = d.dept_id;',
    blanks: [
      { id: 1, answers: ['INNER JOIN', 'JOIN'] },
      { id: 2, answers: ['ON'] },
    ],
    solution: 'SELECT e.name, d.dept_name FROM emp e INNER JOIN dept d ON e.dept_id = d.dept_id;',
  },
  {
    id: 'SQ-05',
    title: '정렬 ORDER BY',
    prompt: '사원을 급여가 높은 순으로 정렬해 이름과 급여를 조회하시오.',
    tables: [EMP],
    template: 'SELECT name, salary FROM emp [[1]] salary [[2]];',
    blanks: [
      { id: 1, answers: ['ORDER BY'] },
      { id: 2, answers: ['DESC'] },
    ],
    solution: 'SELECT name, salary FROM emp ORDER BY salary DESC;',
  },
  {
    id: 'SQ-06',
    title: '집계 함수 AVG',
    prompt: '부서별 평균 급여를 조회하시오.',
    tables: [EMP],
    template: 'SELECT dept_id, [[1]](salary) FROM emp GROUP BY dept_id;',
    blanks: [{ id: 1, answers: ['AVG'] }],
    solution: 'SELECT dept_id, AVG(salary) FROM emp GROUP BY dept_id;',
  },
  {
    id: 'SQ-07',
    title: '패턴 검색 LIKE',
    prompt: "이름이 '김' 으로 시작하는 사원을 모두 조회하시오.",
    tables: [EMP],
    template: "SELECT * FROM emp WHERE name [[1]] '김%';",
    blanks: [{ id: 1, answers: ['LIKE'] }],
    solution: "SELECT * FROM emp WHERE name LIKE '김%';",
  },
  {
    id: 'SQ-08',
    title: '범위 검색 BETWEEN',
    prompt: '급여가 3000 이상 4000 이하인 사원의 이름을 조회하시오.',
    tables: [EMP],
    template: 'SELECT name FROM emp WHERE salary [[1]] 3000 [[2]] 4000;',
    blanks: [
      { id: 1, answers: ['BETWEEN'] },
      { id: 2, answers: ['AND'] },
    ],
    solution: 'SELECT name FROM emp WHERE salary BETWEEN 3000 AND 4000;',
  },
  {
    id: 'SQ-09',
    title: '서브쿼리 평균 초과',
    prompt: '급여가 전체 평균 급여보다 높은 사원의 이름을 조회하시오.',
    tables: [EMP],
    template: 'SELECT name FROM emp WHERE salary > (SELECT [[1]](salary) FROM [[2]]);',
    blanks: [
      { id: 1, answers: ['AVG'] },
      { id: 2, answers: ['emp'] },
    ],
    solution: 'SELECT name FROM emp WHERE salary > (SELECT AVG(salary) FROM emp);',
  },
  {
    id: 'SQ-10',
    title: '종합: 조인 + 그룹 + 정렬',
    prompt: '부서명별 평균 급여를 구해 평균 급여가 높은 순으로 조회하시오.',
    tables: [EMP, DEPT],
    template:
      'SELECT d.dept_name, AVG(e.salary) FROM emp e JOIN dept d [[1]] e.dept_id = d.dept_id [[2]] d.dept_name [[3]] AVG(e.salary) DESC;',
    blanks: [
      { id: 1, answers: ['ON'] },
      { id: 2, answers: ['GROUP BY'] },
      { id: 3, answers: ['ORDER BY'] },
    ],
    solution:
      'SELECT d.dept_name, AVG(e.salary) FROM emp e JOIN dept d ON e.dept_id = d.dept_id GROUP BY d.dept_name ORDER BY AVG(e.salary) DESC;',
  },
];
