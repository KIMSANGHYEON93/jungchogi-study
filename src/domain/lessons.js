// 로드맵 일차별 레슨 — 개념 요약 · 예제 코드 · 확인 퀴즈.
//
// 1단계(D-24 ~ D-17) 8개 · 2단계(D-15 ~ D-11) 5개 · 3단계(D-9 ~ D-5) 5개 일차를 담는다. D-16 · D-10 · D-4 는 점검일이라 레슨 대신 연습·오답노트를 쓴다.
// 예제의 출력·퀴즈 정답은 직접 실행해 확인했다(C 는 gcc, Java 는 javac, Python 은 python3, SQL 은 SQLite).
// 일차를 더 늘릴 때는 LESSONS 에 같은 모양의 항목을 추가하면 로드맵·레슨 화면이 그대로 따라온다.
//
// @typedef {Object} LessonQuestion
//   id        레슨 안에서 유일한 문항 id
//   prompt    문제 문장
//   code      (선택) 문제 코드 — 없으면 문장형 문제  ·  lang  코드 언어
//   alt       (선택) 같은 뜻의 다른 표기 목록  ·  ignoreCase  true 면 대소문자 무시(용어 문제)
//   answer    정답(출력값·숫자·짧은 단어). 채점은 공백·줄바꿈 차이를 무시한다(grading.matchesExpectedOutput)
//   explain   해설
//
// @typedef {Object} Lesson
//   id, d(일차), title, tablesTitle?, tables?[{name, columns, rows}], track('C'|'Java'|'Python'|'SQL'|'OS'|'네트워크'|'테스트'|'소프트웨어 공학'|'디자인패턴'|'통합 구현'|'보안'), minutes(예상 소요), summary, goals[],
//   sections[{heading, body, code?, lang?, output?}], pitfalls[], questions[]

import { matchesExpectedOutput } from './grading';

/** 템플릿 문자열의 앞 줄바꿈과 끝 공백을 걷어 코드 본문만 남긴다. 역슬래시는 그대로 둔다(String.raw). */
const code = (strings, ...values) =>
  String.raw({ raw: strings.raw }, ...values).replace(/^\n/, '').replace(/\s+$/, '');

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
    id: 'c-pointer-struct',
    d: 22,
    title: 'C언어 포인터 · 배열 · 구조체',
    track: 'C',
    minutes: 60,
    summary: '포인터가 가리키는 주소와 값, 배열·문자열과의 관계, 구조체 접근과 재귀 호출을 추적한다.',
    goals: [
      '& 와 * 로 주소와 값을 오가며 계산한다',
      '배열 이름과 포인터 산술(p+1, p[i])의 관계를 설명한다',
      '문자열의 끝 문자와 strlen/sizeof 의 차이를 안다',
      '값 전달과 주소 전달의 차이, 구조체 포인터(->)를 구분한다',
    ],
    sections: [
      {
        heading: '포인터 기본 — 주소와 값',
        body: '&a 는 a 의 주소, *p 는 p 가 가리키는 값이다. *p 를 바꾸면 원래 변수 a 가 바뀐다.',
        lang: 'c',
        code: code`
#include <stdio.h>
int main(void) {
    int a = 10;
    int *p = &a;
    *p += 5;                 /* a 가 15 로 바뀐다 */
    printf("%d %d\n", a, *p);
    return 0;
}`,
        output: '15 15',
      },
      {
        heading: '배열과 포인터',
        body: '배열 이름은 첫 원소의 주소처럼 쓰인다. *(p+2) 와 p[2] 는 같은 값이다. 포인터에 1을 더하면 자료형 크기만큼 이동한다. sizeof(arr)/sizeof(arr[0]) 은 원소 개수다.',
        lang: 'c',
        code: code`
#include <stdio.h>
int main(void) {
    int arr[5] = {10, 20, 30, 40, 50};
    int *q = arr;
    printf("%d %d %d\n", *(q + 2), q[3], (int)(sizeof(arr) / sizeof(arr[0])));
    return 0;
}`,
        output: '30 40 5',
      },
      {
        heading: '문자열 — 널 문자',
        body: '문자열은 끝에 널 문자(\\0)가 붙는다. "HELLO" 는 5글자지만 배열 크기는 6. strlen 은 널 문자를 세지 않는다. s+2 는 세 번째 글자부터 시작하는 문자열이다.',
        lang: 'c',
        code: code`
#include <stdio.h>
#include <string.h>
int main(void) {
    char s[] = "HELLO";
    printf("%zu %zu %s\n", strlen(s), sizeof(s), s + 2);
    return 0;
}`,
        output: '5 6 LLO',
      },
      {
        heading: '구조체 — . 과 ->',
        body: '구조체 변수는 . 으로, 구조체 포인터는 -> 로 멤버에 접근한다. q->x 는 (*q).x 와 같다.',
        lang: 'c',
        code: code`
#include <stdio.h>
struct P { int x; int y; };
int main(void) {
    struct P pt = {1, 2};
    struct P *pp = &pt;
    pp->x += 10;
    printf("%d %d\n", pt.x, pt.y);
    return 0;
}`,
        output: '11 2',
      },
      {
        heading: '재귀 호출',
        body: '재귀는 "종료 조건 → 자기 자신 호출" 순서로 따라간다. fact(5) = 5×4×3×2×1, fib(6) 은 앞의 두 값의 합(0,1,1,2,3,5,8).',
        lang: 'c',
        code: code`
#include <stdio.h>
int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
int fib(int n)  { if (n <= 1) return n; return fib(n - 1) + fib(n - 2); }
int main(void) {
    printf("%d %d\n", fact(5), fib(6));
    return 0;
}`,
        output: '120 8',
      },
    ],
    pitfalls: [
      'C 는 값 전달이다 — 함수에 변수를 넘기면 복사본이 바뀐다. 원본을 바꾸려면 주소(&)를 넘긴다',
      'sizeof(포인터) 는 배열 크기가 아니라 포인터 자체의 크기다 (함수 인자로 넘어온 배열 포함)',
      '재귀는 종료 조건이 없으면 무한 호출 — 반환값을 어떻게 곱하고 더하는지 호출 스택 순서로 계산한다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '출력 결과는?',
        lang: 'c',
        code: code`
int a[] = {3, 6, 9, 12};
int *p = a + 1;
printf("%d %d", *p, *(p + 2));`,
        answer: '6 12',
        explain: 'p 는 a[1] 을 가리킨다. *p = 6, p+2 는 a[3] 이므로 12.',
      },
      {
        id: 'q2',
        prompt: '출력 결과는?',
        lang: 'c',
        code: code`
int x = 5;
int *p = &x;
int **pp = &p;
**pp = 9;
printf("%d", x);`,
        answer: '9',
        explain: '**pp 는 p 가 가리키는 x 자체다. 거기에 9 를 넣었으므로 x = 9.',
      },
      {
        id: 'q3',
        prompt: '출력 결과는?',
        lang: 'c',
        code: code`
char t[] = "ABCDE";
char *tp = t + 1;
printf("%c %s", *tp, tp + 2);`,
        answer: 'B DE',
        explain: 'tp 는 "BCDE" 의 시작. *tp = B, tp+2 는 "DE".',
      },
      {
        id: 'q4',
        prompt: '출력 결과는?',
        lang: 'c',
        code: code`
void f(int v)  { v = 10; }
void g(int *v) { *v = 10; }
int main(void) {
    int m = 1, n = 1;
    f(m);
    g(&n);
    printf("%d %d", m, n);
}`,
        answer: '1 10',
        explain: 'f 는 복사본만 바꾸므로 m 은 그대로 1. g 는 주소로 접근해 n 을 10 으로 바꾼다.',
      },
    ],
  },
  {
    id: 'java-class-inherit',
    d: 21,
    title: 'Java 클래스 · 상속 · 오버라이딩',
    track: 'Java',
    minutes: 60,
    summary: '생성자 호출 순서, 오버라이딩과 동적 바인딩, 필드·오버로딩의 정적 바인딩을 구분한다.',
    goals: [
      '상속에서 부모 → 자식 순서의 생성자 호출을 추적한다',
      '오버라이딩된 메서드가 실제 객체 타입으로 실행됨을 설명한다',
      '필드와 오버로딩은 참조 변수의 선언 타입으로 정해짐을 안다',
      'super 와 super(...) 를 구분한다',
    ],
    sections: [
      {
        heading: '생성자 호출 순서',
        body: '자식 객체를 만들면 부모 생성자가 먼저 실행된다. 자식 생성자 첫 줄에 super(...) 가 없으면 부모의 기본 생성자 super() 가 자동으로 들어간다.',
        lang: 'java',
        code: code`
class A { A() { System.out.print("A"); } }
class B extends A { B() { System.out.print("B"); } }
// new B();`,
        output: 'AB',
      },
      {
        heading: '오버라이딩과 동적 바인딩',
        body: '변수의 타입이 Animal 이어도 실제 객체가 Dog 이면 Dog 의 오버라이딩 메서드가 실행된다(실행 시점에 결정).',
        lang: 'java',
        code: code`
class Animal { void sound() { System.out.print("Animal"); } }
class Dog extends Animal { void sound() { System.out.print("Dog"); } }
// Animal a = new Dog();
// a.sound();`,
        output: 'Dog',
      },
      {
        heading: '필드는 오버라이딩되지 않는다',
        body: '필드 접근은 참조 변수의 선언 타입을 따른다. 부모 타입 변수로 v 를 읽으면 부모의 v, get() 은 오버라이딩되어 자식 것이 실행된다.',
        lang: 'java',
        code: code`
class P { int v = 1; int get() { return v; } }
class C extends P { int v = 2; int get() { return v; } }
// P p = new C();
// System.out.println(p.v + " " + p.get());`,
        output: '1 2',
      },
      {
        heading: '오버로딩은 선언 타입으로 고른다',
        body: '오버로딩된 메서드 중 어느 것을 부를지는 컴파일 시점에 인자의 선언 타입으로 정한다. 실제 객체가 String 이어도 Object 로 선언했다면 Object 버전이 호출된다.',
        lang: 'java',
        code: code`
static void f(Object o) { System.out.print("O"); }
static void f(String s) { System.out.print("S"); }
// Object o = "x";
// f(o); f("x");`,
        output: 'OS',
      },
    ],
    pitfalls: [
      '메서드는 실제 객체 타입(동적), 필드·static 메서드·오버로딩은 선언 타입(정적)으로 결정된다',
      '오버라이딩은 이름·매개변수가 같아야 하고, 접근 제어자는 더 좁아질 수 없다',
      '부모에 기본 생성자가 없으면 자식 생성자에서 super(인자) 를 직접 호출해야 한다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '출력 결과는?',
        lang: 'java',
        code: code`
class A {
    A()      { System.out.print("A"); }
    A(int x) { System.out.print("a" + x); }
}
class B extends A {
    B() { super(5); System.out.print("B"); }
}
// new B();`,
        answer: 'a5B',
        explain: 'super(5) 로 부모의 A(int) 가 먼저 실행되어 a5, 이어서 B.',
      },
      {
        id: 'q2',
        prompt: '출력 결과는?',
        lang: 'java',
        code: code`
class P { int v = 10; int get() { return v; } }
class C extends P { int v = 20; int get() { return v; } }
// P p = new C();
System.out.println(p.v + " " + p.get());`,
        answer: '10 20',
        explain: 'p.v 는 선언 타입 P 의 필드 10, p.get() 은 C 가 오버라이딩해 20.',
      },
      {
        id: 'q3',
        prompt: '출력 결과는?',
        lang: 'java',
        code: code`
static void f(Object o) { System.out.print("O"); }
static void f(String s) { System.out.print("S"); }
// ...
Object o2 = "hi";
f(o2);
f("hi");`,
        answer: 'OS',
        explain: 'f(o2) 는 선언 타입 Object 라 Object 버전, f("hi") 는 String 버전.',
      },
      {
        id: 'q4',
        prompt: '출력 결과는? (공백 포함)',
        lang: 'java',
        code: code`
class Animal { String name() { return "Animal"; } }
class Dog extends Animal { String name() { return "Dog"; } }
class Cat extends Animal { }
// ...
Animal[] arr = { new Dog(), new Cat(), new Animal() };
for (Animal an : arr) System.out.print(an.name() + " ");`,
        answer: 'Dog Animal Animal',
        explain: 'Dog 는 오버라이딩한 "Dog", Cat 은 오버라이딩하지 않아 부모의 "Animal".',
      },
    ],
  },
  {
    id: 'java-exception-static',
    d: 20,
    title: 'Java 예외 · static · 인터페이스 · 추상 클래스',
    track: 'Java',
    minutes: 60,
    summary: 'try/catch/finally 실행 흐름, static 멤버의 공유, 인터페이스·추상 클래스 다형성을 추적한다.',
    goals: [
      'try / catch / finally 의 실행 순서를 추적한다',
      'finally 와 return 이 함께 있을 때의 값을 계산한다',
      'static 변수는 객체 간에 공유됨을 설명한다',
      '인터페이스·추상 클래스를 통한 다형성 호출을 계산한다',
    ],
    sections: [
      {
        heading: 'try / catch / finally 흐름',
        body: '예외가 나면 그 줄 이후의 try 코드는 건너뛰고 맞는 catch 로 간다. finally 는 예외 여부와 상관없이 항상 실행된다. 예외가 처리되면 그다음 코드는 계속 실행된다.',
        lang: 'java',
        code: code`
try {
    System.out.print("A");
    int x = 1 / 0;          // ArithmeticException
    System.out.print("B");  // 실행되지 않음
} catch (ArithmeticException e) {
    System.out.print("C");
} finally {
    System.out.print("D");
}
System.out.print("E");`,
        output: 'ACDE',
      },
      {
        heading: 'finally 와 return',
        body: 'return 값을 정한 뒤 finally 가 실행된다. finally 의 출력은 반환값보다 먼저 나온다.',
        lang: 'java',
        code: code`
static int ff() {
    try { return 1; }
    finally { System.out.print("F"); }
}
// System.out.println(ff());`,
        output: 'F1',
      },
      {
        heading: 'static — 모든 객체가 공유',
        body: 'static 변수는 클래스에 하나만 있다. 객체를 만들 때마다 증가시키면 마지막 객체의 id 와 cnt 는 같다.',
        lang: 'java',
        code: code`
class Counter {
    static int cnt = 0;
    int id;
    Counter() { id = ++cnt; }
}
// Counter c1 = new Counter(), c2 = new Counter(), c3 = new Counter();
// System.out.println(c3.id + " " + Counter.cnt);`,
        output: '3 3',
      },
      {
        heading: '추상 클래스와 인터페이스',
        body: '추상 클래스는 직접 객체를 만들 수 없고 abstract 메서드를 자식이 구현해야 한다. 인터페이스는 구현 클래스가 메서드를 모두 구현한다. 부모 타입으로 호출해도 실제 객체의 구현이 실행된다.',
        lang: 'java',
        code: code`
abstract class Shape { abstract int area(); }
class Rect extends Shape { int area() { return 2 * 3; } }
// Shape s = new Rect();
// System.out.println(s.area());`,
        output: '6',
      },
    ],
    pitfalls: [
      'catch 는 위에서부터 맞는 첫 번째만 실행된다 — 부모 예외를 위에 두면 자식 catch 는 도달 불가(컴파일 오류)',
      'finally 안에서 지역 변수를 바꿔도 이미 정해진 return 값(기본형)은 바뀌지 않는다',
      'static 메서드는 this 를 쓸 수 없고 인스턴스 멤버에 직접 접근할 수 없다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '출력 결과는?',
        lang: 'java',
        code: code`
try {
    int[] a = new int[2];
    a[2] = 1;
    System.out.print("A");
} catch (ArrayIndexOutOfBoundsException e) {
    System.out.print("B");
} catch (Exception e) {
    System.out.print("C");
} finally {
    System.out.print("D");
}`,
        answer: 'BD',
        explain: 'a[2] 에서 예외 → A 는 출력되지 않고 첫 번째 catch 가 실행(B), finally 가 D.',
      },
      {
        id: 'q2',
        prompt: '출력 결과는?',
        lang: 'java',
        code: code`
class Counter {
    static int cnt = 0;
    int id;
    Counter() { id = ++cnt; }
}
// ...
Counter a = new Counter();
Counter b = new Counter();
System.out.println(a.id + " " + b.id + " " + Counter.cnt);`,
        answer: '1 2 2',
        explain: '첫 객체 id = 1, 둘째 id = 2, 공유되는 cnt 는 2.',
      },
      {
        id: 'q3',
        prompt: '출력 결과는?',
        lang: 'java',
        code: code`
static int f() {
    int x = 1;
    try { return x; }
    finally { x = 2; }
}
// ...
System.out.println(f());`,
        answer: '1',
        explain: 'return 시점에 값 1 이 정해진다. finally 에서 x 를 2 로 바꿔도 반환값은 그대로 1.',
      },
      {
        id: 'q4',
        prompt: '출력 결과는?',
        lang: 'java',
        code: code`
interface Calc { int run(int a); }
class Dbl implements Calc { public int run(int a) { return a * 2; } }
class Inc implements Calc { public int run(int a) { return a + 1; } }
// ...
Calc[] cs = { new Dbl(), new Inc() };
int v = 3;
for (Calc c : cs) v = c.run(v);
System.out.println(v);`,
        answer: '7',
        explain: 'v = 3 → Dbl 로 6 → Inc 로 7.',
      },
    ],
  },
  {
    id: 'python-basics',
    d: 19,
    title: 'Python 리스트 · 딕셔너리 · 슬라이싱 · 클래스',
    track: 'Python',
    minutes: 60,
    summary: '슬라이싱 규칙, 가변 객체 참조, 딕셔너리 집계, 상속 초기화의 결과를 직접 계산한다.',
    goals: [
      '슬라이싱 a[start:stop:step] 의 범위와 음수 인덱스를 계산한다',
      '리스트 대입은 복사가 아니라 참조임을 설명한다',
      'dict.get 과 컴프리헨션의 결과를 계산한다',
      'super().__init__() 호출 후 속성 변화를 추적한다',
    ],
    sections: [
      {
        heading: '슬라이싱',
        body: 'a[start:stop] 은 stop 직전까지. 음수는 뒤에서부터, step 이 음수면 거꾸로다. 범위를 벗어나도 오류 없이 잘린다.',
        lang: 'python',
        code: code`
a = [0, 1, 2, 3, 4, 5]
print(a[1:4], a[::-1], a[-2:], a[::2])`,
        output: '[1, 2, 3] [5, 4, 3, 2, 1, 0] [4, 5] [0, 2, 4]',
      },
      {
        heading: '딕셔너리',
        body: 'd[키] = 값 으로 추가·수정한다. d.get(키, 기본값) 은 키가 없어도 오류 없이 기본값을 돌려준다. 키 순서는 삽입 순서다.',
        lang: 'python',
        code: code`
d = {'a': 1, 'b': 2}
d['c'] = 3
print(len(d), d.get('z', 0), list(d.keys()))`,
        output: "3 0 ['a', 'b', 'c']",
      },
      {
        heading: '참조와 복사',
        body: 'b = a 는 같은 리스트를 가리킨다. 한쪽을 바꾸면 다른 쪽도 바뀐다. a[:] 는 새 리스트(얕은 복사)를 만든다.',
        lang: 'python',
        code: code`
a = [1, 2]
b = a
b.append(3)
print(a)          # b 와 같은 객체
c = a[:]
c.append(4)
print(a, c)`,
        output: '[1, 2, 3] / [1, 2, 3] [1, 2, 3, 4]',
      },
      {
        heading: '클래스 상속',
        body: '자식 __init__ 에서 super().__init__() 으로 부모를 먼저 초기화하면 부모가 만든 속성을 자식이 이어서 바꿀 수 있다.',
        lang: 'python',
        code: code`
class P:
    def __init__(self): self.n = 1
    def show(self): print(self.n)
class C(P):
    def __init__(self):
        super().__init__()
        self.n += 1
C().show()`,
        output: '2',
      },
    ],
    pitfalls: [
      '함수 기본 인자에 리스트·딕셔너리를 쓰면 호출마다 공유된다 (def f(x, lst=[]) 의 함정)',
      '슬라이싱 a[1:4] 에서 4번 인덱스는 포함되지 않는다',
      '들여쓰기가 곧 블록이다 — 같은 줄 위치의 코드만 같은 블록에서 실행된다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '출력 결과는?',
        lang: 'python',
        code: 'print([i * i for i in range(5) if i % 2 == 0])',
        answer: '[0, 4, 16]',
        explain: 'i 가 0, 2, 4 일 때만 제곱: 0, 4, 16.',
      },
      {
        id: 'q2',
        prompt: '출력 결과는?',
        lang: 'python',
        code: code`
s = "python"
print(s[1:4], s[::-1][:2])`,
        answer: 'yth no',
        explain: 's[1:4] = "yth". s[::-1] = "nohtyp" 의 앞 두 글자 "no".',
      },
      {
        id: 'q3',
        prompt: '출력 결과는?',
        lang: 'python',
        code: code`
def f(v, lst=[]):
    lst.append(v)
    return lst
f(1)
print(f(2))`,
        answer: '[1, 2]',
        explain: '기본 인자 리스트는 함수 정의 때 한 번만 만들어져 호출마다 공유된다.',
      },
      {
        id: 'q4',
        prompt: '출력 결과는?',
        lang: 'python',
        code: code`
words = ["a", "b", "a", "c", "a"]
d = {}
for w in words:
    d[w] = d.get(w, 0) + 1
print(d["a"], len(d))`,
        answer: '3 3',
        explain: 'a 는 3번 나오고, 서로 다른 키는 a, b, c 세 개.',
      },
    ],
  },
  {
    id: 'sql-basic-ddl',
    d: 18,
    title: 'SQL — SELECT · WHERE · 집계 · DDL/DML/DCL',
    track: 'SQL',
    minutes: 60,
    summary: '조건 검색과 NULL 처리, 집계 함수, DDL·DML·DCL 구분을 결과 표로 확인한다.',
    goals: [
      'WHERE 의 IN · BETWEEN · LIKE · IS NULL 을 구분한다',
      '집계 함수가 NULL 을 무시하는 규칙을 안다',
      'NULL 이 포함된 산술은 NULL 이 됨을 안다',
      'DDL · DML · DCL · TCL 의 대표 명령을 구분한다',
    ],
    tables: [
      {
        name: 'STUDENT',
        columns: ['id', 'name', 'grade', 'score'],
        rows: [[1, '김', 1, 80], [2, '이', 2, 95], [3, '박', 2, 70], [4, '최', 3, 85], [5, '정', 1, null]],
      },
    ],
    sections: [
      {
        heading: 'SELECT · WHERE · ORDER BY',
        body: 'WHERE 로 행을 거르고 ORDER BY 로 정렬한다(DESC 는 내림차순). NULL 은 비교 결과가 참이 아니라서 score >= 80 에도 걸리지 않는다.',
        lang: 'sql',
        code: 'SELECT name FROM STUDENT\nWHERE score >= 80\nORDER BY score DESC;',
        output: '이 / 최 / 김',
      },
      {
        heading: 'IN · BETWEEN · IS NULL',
        body: 'IN 은 목록 중 하나, BETWEEN a AND b 는 양 끝을 포함한 범위다. NULL 검사는 = 가 아니라 IS NULL / IS NOT NULL 을 쓴다.',
        lang: 'sql',
        code: 'SELECT name FROM STUDENT\nWHERE grade IN (1, 2) AND score IS NOT NULL;   -- 김 / 이 / 박\nSELECT COUNT(*) FROM STUDENT\nWHERE grade BETWEEN 2 AND 3;                    -- 3',
        output: '김 이 박 / 3',
      },
      {
        heading: '집계 함수와 NULL',
        body: 'COUNT(*) 는 행 수, COUNT(컬럼) 과 AVG 는 NULL 을 제외한다. 정(NULL)을 뺀 네 명의 평균은 (80+95+70+85) / 4 = 82.5.',
        lang: 'sql',
        code: 'SELECT COUNT(*), COUNT(score), AVG(score) FROM STUDENT;',
        output: '5 4 82.5',
      },
      {
        heading: 'DDL · DML · DCL · TCL',
        body: 'DDL(정의): CREATE · ALTER · DROP · TRUNCATE. DML(조작): SELECT · INSERT · UPDATE · DELETE. DCL(제어): GRANT · REVOKE. TCL(트랜잭션): COMMIT · ROLLBACK. DELETE 는 조건 행만 지우고 롤백할 수 있으며, TRUNCATE 는 전체를 지운다.',
        lang: 'sql',
        code: 'CREATE TABLE STUDENT (id INT, name VARCHAR(20), grade INT, score INT);\nALTER TABLE STUDENT ADD email VARCHAR(50);\nDELETE FROM STUDENT WHERE grade = 1;   -- 1학년 행만 삭제\nGRANT SELECT ON STUDENT TO user1;      -- 권한 부여(DCL)\nCOMMIT;',
      },
    ],
    pitfalls: [
      '= NULL 은 항상 거짓이다 — IS NULL 을 쓴다',
      'AVG 는 NULL 을 분모에서도 뺀다 (5명 중 NULL 1명이면 4로 나눈다)',
      'NULL 과의 산술(score + 10)은 NULL 이다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '출력되는 값은?',
        lang: 'sql',
        code: 'SELECT COUNT(*) FROM STUDENT\nWHERE score < 90;',
        answer: '3',
        explain: '80, 70, 85 세 행. 95 는 90 이상이고, NULL 은 비교가 참이 아니라 제외된다.',
      },
      {
        id: 'q2',
        prompt: '출력되는 값은?',
        lang: 'sql',
        code: 'SELECT AVG(score) FROM STUDENT;',
        answer: '82.5',
        explain: 'NULL 을 제외한 네 점수의 평균 (80+95+70+85)/4 = 82.5.',
      },
      {
        id: 'q3',
        prompt: '출력되는 값은?',
        lang: 'sql',
        code: 'SELECT name FROM STUDENT\nWHERE score = (SELECT MAX(score) FROM STUDENT);',
        answer: '이',
        explain: '서브쿼리가 최고점 95 를 돌려주고, 95 를 받은 학생은 이.',
      },
      {
        id: 'q4',
        prompt: '출력되는 값은? (NULL 이면 NULL)',
        lang: 'sql',
        code: 'UPDATE STUDENT SET score = score + 10\nWHERE grade = 1;\nSELECT score FROM STUDENT WHERE id = 5;',
        answer: 'NULL',
        explain: '정(id 5)은 1학년이지만 score 가 NULL 이고, NULL + 10 은 NULL 이다.',
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
  {
    id: 'os-scheduling',
    d: 15,
    title: 'OS 프로세스 스케줄링 (FCFS · SJF · HRN · RR)',
    track: 'OS',
    minutes: 60,
    summary: '같은 프로세스 표로 FCFS · SJF · HRN · 라운드 로빈의 실행 순서와 평균 대기·반환시간을 직접 계산한다.',
    goals: [
      '대기시간 = 시작 − 도착, 반환시간 = 종료 − 도착 으로 계산한다',
      'FCFS · SJF(비선점)의 선택 기준과 실행 순서를 구한다',
      'HRN 우선순위 (대기 + 서비스) / 서비스 를 계산해 다음 프로세스를 고른다',
      '라운드 로빈의 큐 순서와 종료 시각을 추적한다',
    ],
    tablesTitle: '프로세스 표 (이 레슨 전체에서 사용)',
    tables: [
      {
        name: '프로세스',
        columns: ['프로세스', '도착 시간', '실행 시간'],
        rows: [['P1', 0, 6], ['P2', 1, 3], ['P3', 2, 1], ['P4', 3, 4]],
      },
    ],
    sections: [
      {
        heading: 'FCFS — 도착 순서대로',
        body: '먼저 도착한 프로세스부터 끝까지 실행한다(비선점). 실행 순서 P1 → P2 → P3 → P4. 시작 시각은 0, 6, 9, 10 이므로 대기시간은 0, 5, 7, 7.',
        lang: 'text',
        code: code`
대기시간: P1 0, P2 6-1=5, P3 9-2=7, P4 10-3=7
평균 대기시간 = (0 + 5 + 7 + 7) / 4 = 4.75
반환시간: P1 6, P2 8, P3 8, P4 11  →  평균 8.25`,
        output: '평균 대기 4.75 / 평균 반환 8.25',
      },
      {
        heading: 'SJF(비선점) — 실행 시간이 짧은 것부터',
        body: 'CPU 가 비는 시점에 도착해 있는 프로세스 중 실행 시간이 가장 짧은 것을 고른다. t=6 에 P1 이 끝나면 P2(3) · P3(1) · P4(4) 가 대기 중이라 P3 → P2 → P4 순서다.',
        lang: 'text',
        code: code`
실행 순서: P1(0~6) → P3(6~7) → P2(7~10) → P4(10~14)
대기시간: P1 0, P3 6-2=4, P2 7-1=6, P4 10-3=7
평균 대기시간 = (0 + 4 + 6 + 7) / 4 = 4.25
평균 반환시간 = (6 + 5 + 9 + 11) / 4 = 7.75`,
        output: '평균 대기 4.25 / 평균 반환 7.75',
      },
      {
        heading: 'HRN — 응답률이 높은 것부터',
        body: '우선순위 = (대기 시간 + 서비스 시간) / 서비스 시간. 클수록 먼저 실행한다. 오래 기다린 긴 작업도 우선순위가 올라가 기아를 막는다. t=6 에 P1 이 끝난 직후 비교하면 P3 가 가장 크다.',
        lang: 'text',
        code: code`
t = 6 :  P2 = (5 + 3) / 3 = 2.67
         P3 = (4 + 1) / 1 = 5.00   ← 선택
         P4 = (3 + 4) / 4 = 1.75
t = 7 :  P2 = (6 + 3) / 3 = 3.00   ← 선택
         P4 = (4 + 4) / 4 = 2.00
실행 순서: P1 → P3 → P2 → P4`,
        output: 'P1 → P3 → P2 → P4',
      },
      {
        heading: '라운드 로빈 (시간 할당량 2)',
        body: '각 프로세스가 시간 할당량만큼 실행한 뒤 큐의 맨 뒤로 간다. 같은 시각에 새로 도착한 프로세스는 할당량이 끝난 프로세스보다 먼저 큐에 들어간다고 약속하고 푼다(시험 지문의 규칙을 따른다).',
        lang: 'text',
        code: code`
실행 구간: P1(0~2) P2(2~4) P3(4~5) P1(5~7) P4(7~9) P2(9~10) P1(10~12) P4(12~14)
종료 시각: P3 5, P2 10, P1 12, P4 14`,
        output: 'P3 5 / P2 10 / P1 12 / P4 14',
      },
    ],
    pitfalls: [
      '비선점은 실행 중인 프로세스를 중간에 빼앗지 않는다 — 선택은 "CPU 가 비는 순간"에만 한다',
      '대기시간은 "도착 후 실행 시작까지"이고, 반환시간은 "도착부터 종료까지" 다(반환 = 대기 + 실행)',
      '라운드 로빈은 도착 시각과 큐 삽입 순서 규칙에 따라 결과가 달라지니 문제의 조건을 먼저 확인한다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '프로세스 표 기준 FCFS 의 평균 대기시간은? (소수 둘째 자리까지)',
        answer: '4.75',
        explain: '시작 0, 6, 9, 10 → 대기 0, 5, 7, 7. 합 19 / 4 = 4.75.',
      },
      {
        id: 'q2',
        prompt: '프로세스 표 기준 SJF(비선점)의 실행 순서는? (예: P1 P2 P3 P4)',
        answer: 'P1 P3 P2 P4',
        explain: 't=0 에는 P1 뿐이라 먼저 실행. t=6 에 대기 중인 P2(3)·P3(1)·P4(4) 중 P3 → P2 → P4.',
      },
      {
        id: 'q3',
        prompt: '프로세스 표 기준 SJF(비선점)의 평균 반환시간은? (소수 둘째 자리까지)',
        answer: '7.75',
        explain: '종료 시각 P1 6, P3 7, P2 10, P4 14 에서 도착을 빼면 반환 6, 5, 9, 11. 합 31 / 4 = 7.75.',
      },
      {
        id: 'q4',
        prompt: 'HRN 에서 P1 이 끝난 직후(t=6) 다음에 실행될 프로세스는?',
        answer: 'P3',
        explain: 'P2 = 8/3 ≈ 2.67, P3 = 5/1 = 5, P4 = 7/4 = 1.75. 가장 큰 P3.',
      },
    ],
  },
  {
    id: 'os-memory-deadlock',
    d: 14,
    title: 'OS 페이지 교체 · 교착상태',
    track: 'OS',
    minutes: 60,
    summary: 'FIFO · LRU · LFU 로 페이지 부재(폴트) 횟수를 표로 계산하고, 교착상태 4조건을 정리한다.',
    goals: [
      '프레임 표를 그려 FIFO · LRU 의 페이지 폴트 수를 센다',
      'LFU 의 동률 처리 규칙(가장 오래된 것)을 적용한다',
      'FIFO 의 Belady 모순(프레임이 늘어도 폴트가 늘 수 있음)을 설명한다',
      '교착상태 발생 4조건과 예방·회피를 구분한다',
    ],
    tablesTitle: '프레임 표 — 참조열 1 2 3 1 4 1 2, 프레임 3개',
    tables: [
      {
        name: 'FIFO (폴트 6)',
        columns: ['참조', '프레임 1', '프레임 2', '프레임 3', '결과'],
        rows: [
          [1, 1, '-', '-', '폴트'], [2, 1, 2, '-', '폴트'], [3, 1, 2, 3, '폴트'], [1, 1, 2, 3, '적중'],
          [4, 4, 2, 3, '폴트'], [1, 4, 1, 3, '폴트'], [2, 4, 1, 2, '폴트'],
        ],
      },
      {
        name: 'LRU (폴트 5)',
        columns: ['참조', '프레임 1', '프레임 2', '프레임 3', '결과'],
        rows: [
          [1, 1, '-', '-', '폴트'], [2, 1, 2, '-', '폴트'], [3, 1, 2, 3, '폴트'], [1, 1, 2, 3, '적중'],
          [4, 1, 4, 3, '폴트'], [1, 1, 4, 3, '적중'], [2, 1, 4, 2, '폴트'],
        ],
      },
    ],
    sections: [
      {
        heading: '교체 알고리즘 규칙',
        body: 'FIFO 는 가장 먼저 들어온 페이지, LRU 는 가장 오래 사용하지 않은 페이지, LFU 는 참조 횟수가 가장 적은 페이지를 내보낸다. 참조 횟수가 같으면 가장 오래 적재된 페이지를 내보낸다(이 앱의 규칙). 표를 그릴 때 "적중이면 아무것도 바뀌지 않지만 LRU 는 사용 시각이 갱신된다"는 점을 놓치지 않는다.',
      },
      {
        heading: 'FIFO 와 LRU 비교 — 위 표 읽는 법',
        body: '네 번째 참조 1 은 이미 프레임에 있어 적중이다. 다섯 번째 4 가 들어올 때 FIFO 는 가장 먼저 들어온 1 을 내보내고, LRU 는 사용이 가장 오래된 2 를 내보낸다. 그 결과 다음의 1 이 FIFO 에서는 폴트, LRU 에서는 적중이 된다.',
        lang: 'text',
        code: code`
FIFO : 폴트 6회  (적중 1회)
LRU  : 폴트 5회  (적중 2회)`,
        output: 'FIFO 6 / LRU 5',
      },
      {
        heading: 'Belady 모순',
        body: 'FIFO 는 프레임 수를 늘려도 폴트가 오히려 늘어날 수 있다. 참조열 1 2 3 4 1 2 5 1 2 3 4 5 는 프레임 3개에서 9회, 4개에서 10회다. LRU 같은 스택 알고리즘은 이런 모순이 없다.',
        lang: 'text',
        code: code`
참조열: 1 2 3 4 1 2 5 1 2 3 4 5
FIFO 프레임 3 → 폴트 9
FIFO 프레임 4 → 폴트 10`,
        output: '9 / 10',
      },
      {
        heading: '교착상태 (Deadlock)',
        body: '발생 4조건: 상호 배제 · 점유와 대기 · 비선점 · 환형 대기. 예방은 4조건 중 하나를 깨는 것(예: 자원을 한꺼번에 요청, 순서 부여로 환형 대기 제거), 회피는 안전 상태를 유지하며 할당하는 것(은행원 알고리즘), 탐지·복구는 발생 후 처리하는 방식이다.',
      },
    ],
    pitfalls: [
      '표의 한 칸에서 교체되는 위치는 바뀐 페이지의 칸이다 — 앞칸 밀기 방식(큐)과 같은 칸 교체 방식 모두 폴트 수는 같다',
      'LRU 는 적중일 때도 "최근 사용"이 갱신된다 (FIFO 는 갱신되지 않는다)',
      '교착상태 4조건은 "모두" 성립해야 발생한다 — 하나만 깨도 예방된다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '참조열 1 2 3 1 4 1 2 를 프레임 3개로 FIFO 처리하면 페이지 폴트는 몇 번인가?',
        answer: '6',
        explain: '적중은 네 번째 참조(1) 한 번뿐이라 7 − 1 = 6.',
      },
      {
        id: 'q2',
        prompt: '같은 참조열 1 2 3 1 4 1 2 를 프레임 3개로 LRU 처리하면 페이지 폴트는?',
        answer: '5',
        explain: '네 번째의 1 과 여섯 번째의 1 이 적중이다. 7 − 2 = 5.',
      },
      {
        id: 'q3',
        prompt: '참조열 1 2 3 4 1 2 5 1 2 3 4 5 를 프레임 4개로 FIFO 처리하면 페이지 폴트는?',
        answer: '10',
        explain: '프레임 3개일 때 9회였는데 4개에서 10회로 늘어난다(Belady 모순).',
      },
      {
        id: 'q4',
        prompt: '참조열 2 3 2 1 5 2 4 5 3 2 5 2 를 프레임 3개로 LFU 처리하면 폴트는? (동률이면 가장 오래 적재된 것 교체)',
        answer: '6',
        explain: '자주 쓰는 2 와 5 가 계속 남아 적중이 많다. 폴트 6회(처음 2, 3, 1, 5 와 이후 4, 3).',
      },
    ],
  },
  {
    id: 'net-addressing',
    d: 13,
    title: '네트워크 ① IP 주소 · 서브넷 · CIDR 계산',
    track: '네트워크',
    minutes: 60,
    summary: '블록 크기 방법으로 서브넷 마스크, 호스트 수, 네트워크·브로드캐스트 주소를 계산한다.',
    goals: [
      '/n 에서 서브넷 마스크와 가용 호스트 수 2^(32−n) − 2 를 구한다',
      '블록 크기로 IP 가 속한 네트워크 주소와 브로드캐스트 주소를 구한다',
      '사설 IP 대역과 클래스별 기본 마스크를 기억한다',
    ],
    tablesTitle: 'CIDR 빠른 표 (/24 ~ /30)',
    tables: [
      {
        name: 'CIDR',
        columns: ['접두사', '서브넷 마스크', '블록 크기', '가용 호스트'],
        rows: [
          ['/24', '255.255.255.0', 256, 254], ['/25', '255.255.255.128', 128, 126],
          ['/26', '255.255.255.192', 64, 62], ['/27', '255.255.255.224', 32, 30],
          ['/28', '255.255.255.240', 16, 14], ['/29', '255.255.255.248', 8, 6],
          ['/30', '255.255.255.252', 4, 2],
        ],
      },
    ],
    sections: [
      {
        heading: '호스트 수와 마스크',
        body: '/n 은 앞에서부터 1이 n개라는 뜻이다. 호스트 비트는 32 − n 개이고, 가용 호스트 수는 2^(32−n) − 2 (네트워크 주소와 브로드캐스트 주소 제외). 마스크의 경계 옥텟은 256 − 블록 크기로 구한다.',
        lang: 'text',
        code: code`
/27 → 호스트 비트 5 → 2^5 - 2 = 30
/20 → 255.255.(256-16).0 = 255.255.240.0`,
      },
      {
        heading: '네트워크·브로드캐스트 주소 — 블록 크기 방법',
        body: '192.168.10.77/26 : /26 은 마지막 옥텟의 블록 크기가 64 다. 77 은 64 ~ 127 구간에 있으므로 네트워크 주소 192.168.10.64, 브로드캐스트 192.168.10.127, 사용 가능한 호스트는 .65 ~ .126(62개).',
        lang: 'text',
        code: code`
192.168.10.77/26
블록 크기 64 → 구간 0-63 / 64-127 / ...   77 ∈ 64-127
네트워크    192.168.10.64
브로드캐스트 192.168.10.127
호스트      .65 ~ .126  (62개)`,
        output: '192.168.10.64 / 192.168.10.127',
      },
      {
        heading: '경계가 3번째 옥텟일 때',
        body: '172.16.37.200/21 : /21 은 3번째 옥텟의 블록 크기가 8 이다(마스크 255.255.248.0). 37 은 32 ~ 39 구간이므로 네트워크 주소 172.16.32.0, 브로드캐스트 172.16.39.255.',
        lang: 'text',
        code: code`
172.16.37.200/21
3번째 옥텟 블록 크기 8 → 32-39 구간
네트워크    172.16.32.0
브로드캐스트 172.16.39.255   (호스트 2046개)`,
        output: '172.16.32.0 / 172.16.39.255',
      },
      {
        heading: '사설 IP · 클래스',
        body: '사설 대역: 10.0.0.0/8, 172.16.0.0/12(172.16 ~ 172.31), 192.168.0.0/16. 클래스 기본 마스크: A /8 (1~126), B /16 (128~191), C /24 (192~223).',
      },
    ],
    pitfalls: [
      '가용 호스트는 항상 2^h − 2 다 — 블록 크기 − 2 와 같다',
      '경계가 어느 옥텟인지 먼저 정한다 (/16~/23 은 3번째, /24~/31 은 4번째 옥텟)',
      '브로드캐스트 주소는 "다음 블록 시작 − 1" 이다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '/27 네트워크의 가용 호스트 수는? (숫자만 입력)',
        answer: '30',
        explain: '호스트 비트 32 − 27 = 5, 2^5 − 2 = 30.',
      },
      {
        id: 'q2',
        prompt: '접두사 /20 의 서브넷 마스크는?',
        answer: '255.255.240.0',
        explain: '3번째 옥텟에서 앞 4비트가 1: 256 − 16 = 240.',
      },
      {
        id: 'q3',
        prompt: '172.16.37.200/21 의 네트워크 주소는?',
        answer: '172.16.32.0',
        explain: '3번째 옥텟 블록 크기 8, 37 이 속한 구간 32~39 의 시작은 32.',
      },
      {
        id: 'q4',
        prompt: '192.168.10.77/26 의 브로드캐스트 주소는?',
        answer: '192.168.10.127',
        explain: '블록 크기 64, 77 이 속한 구간 64~127 의 마지막 값.',
      },
    ],
  },
  {
    id: 'net-protocol',
    d: 12,
    title: '네트워크 ② OSI · TCP/UDP · 주요 프로토콜',
    track: '네트워크',
    minutes: 60,
    summary: 'OSI 7계층과 장비, TCP 와 UDP 의 차이, 대표 프로토콜의 포트 번호를 표로 정리한다.',
    goals: [
      'OSI 7계층 이름·번호와 대표 장비를 연결한다',
      'TCP 와 UDP 의 특징을 비교한다',
      'TCP 3-way handshake 순서를 설명한다',
      '대표 프로토콜의 포트 번호를 외운다',
    ],
    tablesTitle: '핵심 표',
    tables: [
      {
        name: 'OSI 7계층',
        columns: ['계층', '이름', '대표 프로토콜 · 장비'],
        rows: [
          [7, '응용', 'HTTP, FTP, SMTP, DNS'],
          [6, '표현', '암호화, 압축, 인코딩'],
          [5, '세션', '세션 설정·종료'],
          [4, '전송', 'TCP, UDP (포트)'],
          [3, '네트워크', 'IP, ICMP · 라우터'],
          [2, '데이터링크', '이더넷, MAC · 스위치, 브리지'],
          [1, '물리', '전기 신호 · 리피터, 허브'],
        ],
      },
      {
        name: '포트 번호',
        columns: ['프로토콜', '포트'],
        rows: [
          ['FTP', '20(데이터) / 21(제어)'], ['SSH', 22], ['Telnet', 23], ['SMTP', 25], ['DNS', 53],
          ['DHCP', '67 / 68'], ['HTTP', 80], ['POP3', 110], ['IMAP', 143], ['HTTPS', 443],
        ],
      },
    ],
    sections: [
      {
        heading: 'TCP vs UDP',
        body: 'TCP 는 연결형(3-way handshake)·신뢰성(순서 보장, 재전송, 흐름·혼잡 제어)·느림, UDP 는 비연결형·비신뢰성·빠름(DNS 질의, 스트리밍, VoIP). 둘 다 4계층(전송)이고 포트 번호로 응용을 구분한다.',
      },
      {
        heading: 'TCP 3-way handshake',
        body: '연결 설정은 세 번의 세그먼트 교환이다. 종료는 FIN/ACK 를 주고받는 4-way 다.',
        lang: 'text',
        code: code`
클라이언트 → 서버 : SYN
서버 → 클라이언트 : SYN + ACK
클라이언트 → 서버 : ACK        (연결 수립)`,
        output: '3개 세그먼트',
      },
      {
        heading: '자주 나오는 프로토콜 정리',
        body: 'IP(주소 지정·라우팅, 비연결), ICMP(오류·진단: ping), ARP(IP → MAC 주소 변환), RARP(MAC → IP), DNS(도메인 → IP), DHCP(IP 자동 할당), HTTP/HTTPS(웹), SMTP(메일 전송)·POP3/IMAP(메일 수신).',
      },
    ],
    pitfalls: [
      'IP 는 3계층, TCP/UDP 는 4계층이다 — "전송 = 4" 를 기준으로 위아래를 센다',
      'ARP 는 IP → MAC, RARP 는 MAC → IP (방향 혼동 주의)',
      '라우터는 3계층, 스위치는 2계층, 허브·리피터는 1계층 장비다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: 'HTTPS 의 기본 포트 번호는?',
        answer: '443',
        explain: 'HTTP 는 80, HTTPS 는 443.',
      },
      {
        id: 'q2',
        prompt: '라우터가 동작하는 OSI 계층의 번호는? (숫자만 입력)',
        answer: '3',
        explain: '라우터는 IP 주소를 보고 경로를 정하는 네트워크 계층(3계층) 장비다.',
      },
      {
        id: 'q3',
        prompt: 'TCP 연결 설정(3-way handshake)에서 주고받는 세그먼트 수는? (숫자만 입력)',
        answer: '3',
        explain: 'SYN → SYN+ACK → ACK, 총 3번이다.',
      },
      {
        id: 'q4',
        prompt: 'SSH 의 기본 포트 번호는?',
        answer: '22',
        explain: 'FTP 는 21, SSH 는 22, Telnet 은 23.',
      },
    ],
  },
  {
    id: 'test-theory',
    d: 11,
    title: '애플리케이션 테스트 — 블랙박스 · 화이트박스 · 순환 복잡도',
    track: '테스트',
    minutes: 60,
    summary: '테스트 기법을 구분하고, 순환 복잡도와 커버리지를 직접 계산한다.',
    goals: [
      '블랙박스와 화이트박스 기법을 구분한다',
      '순환 복잡도 V(G) 를 세 가지 방법으로 계산한다',
      '구문 · 결정 · 조건 커버리지의 최소 테스트 수를 구한다',
      '테스트 레벨(단위 · 통합 · 시스템 · 인수)의 순서를 안다',
    ],
    sections: [
      {
        heading: '블랙박스 vs 화이트박스',
        body: '블랙박스는 내부 구조를 보지 않고 입력과 출력만 본다: 동치 분할, 경계값 분석, 결정 테이블, 상태 전이, 원인-결과 그래프. 화이트박스는 코드 구조를 보고 설계한다: 구문(문장), 결정(분기), 조건, 조건/결정, 다중 조건 커버리지, 기본 경로 테스트.',
      },
      {
        heading: '순환 복잡도 V(G)',
        body: '세 가지 방법은 같은 값을 준다: ① E − N + 2 (간선 − 노드 + 2), ② 영역(면)의 수(바깥 영역 포함), ③ 판단(조건) 노드 수 + 1. 아래 코드는 판단이 if, for, if 세 개라 3 + 1 = 4 이다.',
        lang: 'c',
        code: code`
if (a > 0) {                          /* 판단 1 */
    for (i = 0; i < n; i++) {         /* 판단 2 */
        if (x[i] > 0) s++;            /* 판단 3 */
    }
} else {
    s--;
}`,
        output: 'V(G) = 3 + 1 = 4',
      },
      {
        heading: '커버리지',
        body: 'if (a > 0 && b > 0) s = 1; 에서 — 구문 커버리지: s = 1 이 한 번 실행되면 되므로 (a=1, b=1) 1개. 결정 커버리지: 결과가 참·거짓 모두 나와야 하므로 (1,1) 과 (0,0) 2개. 조건 커버리지: a>0 과 b>0 이 각각 참·거짓이 되어야 하므로 (1,0) 과 (0,1) 2개.',
        lang: 'text',
        code: code`
구문: (a=1, b=1)                          → 1개
결정: (1,1) 참 + (0,0) 거짓                → 2개
조건: (1,0) + (0,1)  (각 조건 T/F 모두)    → 2개`,
      },
      {
        heading: '테스트 레벨',
        body: '단위 테스트(모듈) → 통합 테스트(모듈 결합) → 시스템 테스트(전체 요구사항) → 인수 테스트(사용자 승인). 인수 테스트에는 개발 환경의 알파 테스트, 사용자 환경의 베타 테스트가 있다.',
      },
    ],
    pitfalls: [
      '순환 복잡도에서 && 로 이어진 조건은 문제의 흐름 그래프에 따라 센다 — 그래프가 주어지면 E − N + 2 를 우선한다',
      '결정 커버리지는 "분기 결과"가 참·거짓, 조건 커버리지는 "각 조건"이 참·거짓이다',
      '블랙박스는 내부 구조를 보지 않는다 — 코드 라인 커버리지는 화이트박스 척도다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '흐름 그래프의 간선이 11개, 노드가 9개일 때 순환 복잡도는? (숫자만 입력)',
        answer: '4',
        explain: 'V(G) = E − N + 2 = 11 − 9 + 2 = 4.',
      },
      {
        id: 'q2',
        prompt: '다음 코드의 순환 복잡도는? (숫자만 입력)',
        lang: 'c',
        code: code`
if (a > 0) f1();
else if (a < 0) f2();
for (i = 0; i < n; i++) f3();
while (k > 0) k--;`,
        answer: '5',
        explain: '판단 노드가 if, else if, for, while 4개라 4 + 1 = 5.',
      },
      {
        id: 'q3',
        prompt: '입력이 1 ~ 100 만 유효할 때 동치 분할 테스트의 동치 클래스는 모두 몇 개인가? (유효 클래스와 무효 클래스를 모두 센다, 숫자만 입력)',
        answer: '3',
        explain: '유효 1개(1~100) + 무효 2개(1 미만, 100 초과) = 3. 클래스마다 대표값 1개씩 3개의 테스트를 만든다.',
      },
      {
        id: 'q4',
        prompt: 'if (a > 0 && b > 0) 에서 결정 커버리지를 만족하는 최소 테스트 케이스 수는? (숫자만 입력)',
        lang: 'c',
        code: 'if (a > 0 && b > 0) s = 1;',
        answer: '2',
        explain: '결정 전체의 결과가 참 한 번, 거짓 한 번 나오면 된다: (1,1) 과 (0,0) 등 2개.',
      },
    ],
  },
  {
    id: 'sdlc-requirements',
    d: 9,
    title: 'SDLC · 개발 방법론 · 요구사항 · UML',
    track: '소프트웨어 공학',
    minutes: 60,
    summary: '개발 방법론을 비교하고, 요구공학 단계와 UML 다이어그램의 종류를 구분한다.',
    goals: [
      '폭포수 · 프로토타입 · 나선형 · 애자일의 특징을 비교한다',
      '스크럼의 역할과 XP 의 실천 방법을 구분한다',
      '요구공학의 단계와 기능/비기능 요구사항을 구분한다',
      'UML 의 구조 다이어그램과 행위 다이어그램을 분류한다',
    ],
    tablesTitle: '핵심 표',
    tables: [
      {
        name: '개발 방법론',
        columns: ['모델', '핵심', '특징'],
        rows: [
          ['폭포수', '순차적 단계', '단계별 산출물, 요구 변경 어려움'],
          ['프로토타입', '시제품 → 피드백', '요구사항이 불명확할 때 유리'],
          ['나선형', '계획 → 위험 분석 → 개발 → 평가 반복', '위험 분석 중심, 대규모 시스템'],
          ['애자일', '짧은 반복과 협업', '변화 수용 (스크럼 · XP · 칸반)'],
        ],
      },
      {
        name: 'UML 다이어그램',
        columns: ['분류', '다이어그램'],
        rows: [
          ['구조', '클래스 · 객체 · 컴포넌트 · 배치 · 복합체 구조 · 패키지'],
          ['행위', '유스케이스 · 시퀀스 · 상태 · 활동 · 커뮤니케이션 · 타이밍'],
        ],
      },
    ],
    sections: [
      {
        heading: '애자일 — 스크럼과 XP',
        body: '스크럼: 역할은 제품 책임자(PO) · 스크럼 마스터 · 개발팀, 산출물은 제품 백로그 · 스프린트 백로그, 반복 기간은 스프린트(보통 1~4주), 매일 15분 데일리 스크럼. XP(익스트림 프로그래밍): 짝 프로그래밍, 테스트 주도 개발(TDD), 리팩토링, 소규모 릴리즈, 지속적 통합. XP 의 5가지 가치는 의사소통 · 단순성 · 피드백 · 용기 · 존중이다.',
      },
      {
        heading: '요구공학',
        body: '요구사항 도출(Elicitation) → 분석 → 명세 → 확인(검증) 순으로 진행한다. 기능 요구사항은 "시스템이 무엇을 해야 하는가"(로그인, 결제), 비기능 요구사항은 성능 · 보안 · 가용성 · 사용성 같은 품질 제약이다.',
      },
      {
        heading: '유스케이스와 시퀀스',
        body: '유스케이스 다이어그램은 액터(사용자)와 시스템 기능의 관계를, 시퀀스 다이어그램은 객체 사이의 메시지를 시간 순서로 보여 준다. 클래스 다이어그램의 관계는 연관 · 집약 · 합성 · 일반화(상속) · 의존 · 실체화이다.',
      },
    ],
    pitfalls: [
      '나선형은 "위험 분석"이 핵심 키워드, 폭포수는 "순차·산출물", 애자일은 "변화 수용"이다',
      '시퀀스 · 유스케이스 · 상태 · 활동은 행위 다이어그램, 클래스 · 객체 · 컴포넌트 · 배치는 구조 다이어그램이다',
      '요구공학의 첫 단계는 도출이고 확인(검증)이 마지막이다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '반복 단계마다 위험 분석을 수행하는 점진적 개발 모델은?',
        answer: '나선형',
        alt: ['나선형 모델', '스파이럴', '스파이럴 모델', 'spiral', 'spiral model'],
        ignoreCase: true,
        explain: '계획 → 위험 분석 → 개발 → 평가를 반복하는 나선형(스파이럴) 모델이다.',
      },
      {
        id: 'q2',
        prompt: 'XP 의 실천 방법 중 두 명의 개발자가 한 컴퓨터에서 함께 코딩하는 방식은?',
        answer: '짝 프로그래밍',
        alt: ['페어 프로그래밍', '짝프로그래밍', 'pair programming'],
        ignoreCase: true,
        explain: '코드 품질과 지식 공유를 높이기 위한 XP 의 짝 프로그래밍(페어 프로그래밍)이다.',
      },
      {
        id: 'q3',
        prompt: '객체 간 메시지를 시간 순서대로 표현하는 UML 행위 다이어그램은?',
        answer: '시퀀스 다이어그램',
        alt: ['시퀀스', '순차 다이어그램', 'sequence diagram', 'sequence'],
        ignoreCase: true,
        explain: '시퀀스 다이어그램은 생명선과 메시지로 상호작용의 시간 순서를 나타낸다.',
      },
      {
        id: 'q4',
        prompt: '스크럼에서 한 번의 반복 개발 기간(보통 1~4주)을 무엇이라 하는가?',
        answer: '스프린트',
        alt: ['sprint'],
        ignoreCase: true,
        explain: '스프린트 계획 → 개발 → 리뷰 → 회고를 한 사이클로 반복한다.',
      },
    ],
  },
  {
    id: 'pattern-creational-structural',
    d: 8,
    title: '디자인패턴 ① 생성 · 구조 패턴',
    track: '디자인패턴',
    minutes: 60,
    summary: 'GoF 23개 패턴의 분류를 외우고, 생성 5 · 구조 7 패턴의 의도를 구분한다.',
    goals: [
      'GoF 패턴이 생성 5 · 구조 7 · 행위 11 로 나뉨을 안다',
      '싱글톤의 인스턴스 하나 보장 방식을 코드로 확인한다',
      '어댑터 · 퍼사드 · 프록시 · 데코레이터를 의도로 구분한다',
    ],
    tablesTitle: 'GoF 23개 패턴',
    tables: [
      {
        name: '분류별 패턴',
        columns: ['분류', '개수', '패턴'],
        rows: [
          ['생성', 5, 'Abstract Factory · Builder · Factory Method · Prototype · Singleton'],
          ['구조', 7, 'Adapter · Bridge · Composite · Decorator · Facade · Flyweight · Proxy'],
          ['행위', 11, 'Chain of Responsibility · Command · Interpreter · Iterator · Mediator · Memento · Observer · State · Strategy · Template Method · Visitor'],
        ],
      },
    ],
    sections: [
      {
        heading: '생성 패턴',
        body: '객체 생성 방식을 캡슐화한다. 싱글톤: 인스턴스를 하나만 만들고 전역 접근점을 제공. 팩토리 메서드: 객체 생성을 서브클래스에 위임. 추상 팩토리: 관련 객체군을 한 번에 생성. 빌더: 복잡한 객체를 단계적으로 조립. 프로토타입: 기존 객체를 복제해 생성.',
      },
      {
        heading: '싱글톤 코드',
        body: '생성자를 private 으로 막고 getInstance() 로만 얻게 한다. 여러 번 호출해도 같은 객체이므로 == 비교가 참이다.',
        lang: 'java',
        code: code`
class Singleton {
    private static Singleton inst;
    private Singleton() { }
    static Singleton getInstance() {
        if (inst == null) inst = new Singleton();
        return inst;
    }
}
// Singleton a = Singleton.getInstance();
// Singleton b = Singleton.getInstance();
// System.out.println(a == b);`,
        output: 'true',
      },
      {
        heading: '구조 패턴 구분',
        body: '어댑터: 호환되지 않는 인터페이스를 변환해 연결. 퍼사드: 복잡한 서브시스템에 단순한 통합 창구 제공. 프록시: 대리 객체가 접근을 제어(지연 로딩 · 접근 제어). 데코레이터: 기존 객체에 기능을 동적으로 추가. 컴포지트: 부분-전체를 같은 방식으로 다루는 트리 구조. 브리지: 추상과 구현을 분리. 플라이웨이트: 공유로 메모리 절약.',
      },
    ],
    pitfalls: [
      '어댑터는 "인터페이스 변환", 퍼사드는 "인터페이스 단순화" — 목적이 다르다',
      '팩토리 메서드(서브클래스가 결정)와 추상 팩토리(관련 객체군 생성)를 구분한다',
      '프록시는 접근 제어, 데코레이터는 기능 추가 — 구조는 비슷해도 의도가 다르다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '인스턴스를 하나만 만들고 전역 접근점을 제공하는 생성 패턴은?',
        answer: '싱글톤',
        alt: ['싱글톤 패턴', '싱글턴', 'singleton'],
        ignoreCase: true,
        explain: 'private 생성자와 정적 getInstance() 로 하나의 인스턴스만 유지한다.',
      },
      {
        id: 'q2',
        prompt: '호환되지 않는 인터페이스를 가진 클래스를 함께 쓰도록 변환해 주는 구조 패턴은?',
        answer: '어댑터',
        alt: ['어댑터 패턴', 'adapter'],
        ignoreCase: true,
        explain: '콘센트 어댑터처럼 한쪽 인터페이스를 다른 쪽이 기대하는 형태로 바꿔 준다.',
      },
      {
        id: 'q3',
        prompt: '복잡한 서브시스템에 대해 단순한 하나의 통합 인터페이스를 제공하는 구조 패턴은?',
        answer: '퍼사드',
        alt: ['파사드', '퍼사드 패턴', 'facade'],
        ignoreCase: true,
        explain: '퍼사드는 여러 클래스를 감싼 단순한 창구다.',
      },
      {
        id: 'q4',
        prompt: '출력 결과는? (true 또는 false)',
        lang: 'java',
        code: code`
Singleton a = Singleton.getInstance();
Singleton b = Singleton.getInstance();
System.out.println(a == b);`,
        answer: 'true',
        explain: '같은 정적 인스턴스를 돌려주므로 두 참조가 같은 객체다.',
      },
    ],
  },
  {
    id: 'pattern-behavioral-coupling',
    d: 7,
    title: '디자인패턴 ② 행위 패턴 · 결합도 · 응집도',
    track: '디자인패턴',
    minutes: 60,
    summary: '옵저버 · 전략 · 상태 같은 행위 패턴과 결합도·응집도의 강약 순서를 정리한다.',
    goals: [
      '옵저버 · 전략 · 상태 · 템플릿 메서드 · 이터레이터의 의도를 구분한다',
      '옵저버 코드의 통지 흐름을 추적한다',
      '결합도와 응집도의 종류를 강약 순서로 나열한다',
    ],
    tablesTitle: '결합도 · 응집도 순서',
    tables: [
      {
        name: '결합도 (좋음 → 나쁨)',
        columns: ['순위', '종류', '설명'],
        rows: [
          [1, '자료 결합도', '필요한 데이터만 매개변수로 전달'],
          [2, '스탬프 결합도', '구조체(복합 자료) 전체 전달'],
          [3, '제어 결합도', '제어 신호(플래그)로 동작 제어'],
          [4, '외부 결합도', '외부 변수·인터페이스 공유'],
          [5, '공통 결합도', '전역 변수 공유'],
          [6, '내용 결합도', '다른 모듈의 내부를 직접 참조'],
        ],
      },
      {
        name: '응집도 (좋음 → 나쁨)',
        columns: ['순위', '종류'],
        rows: [
          [1, '기능적'], [2, '순차적'], [3, '통신적'], [4, '절차적'], [5, '시간적'], [6, '논리적'], [7, '우연적'],
        ],
      },
    ],
    sections: [
      {
        heading: '행위 패턴 핵심',
        body: '옵저버: 상태가 변하면 등록된 구독자에게 자동 통지. 전략: 알고리즘을 캡슐화해 교체 가능하게 함. 상태: 상태에 따라 객체 행동을 바꿈. 템플릿 메서드: 알고리즘의 뼈대는 상위 클래스, 세부는 하위 클래스. 이터레이터: 내부 구조를 노출하지 않고 순차 접근. 커맨드: 요청을 객체로 캡슐화(실행 취소). 중재자: 객체 간 통신을 한곳에 모음.',
      },
      {
        heading: '옵저버 코드 추적',
        body: 'Subject 에 두 옵저버를 등록하고 값을 5로 바꾸면 등록 순서대로 update() 가 호출된다.',
        lang: 'java',
        code: code`
interface Observer { void update(int v); }
class Named implements Observer {
    String n;
    Named(String n) { this.n = n; }
    public void update(int v) { System.out.print(n + ":" + v + " "); }
}
// Subject s = new Subject();
// s.add(new Named("A")); s.add(new Named("B"));
// s.set(5);   // 등록된 옵저버에게 차례로 update(5)`,
        output: 'A:5 B:5',
      },
      {
        heading: '결합도와 응집도',
        body: '좋은 설계는 결합도는 낮게, 응집도는 높게 가져간다. 결합도는 자료 → 스탬프 → 제어 → 외부 → 공통 → 내용 순으로 강해지고, 응집도는 기능 → 순차 → 통신 → 절차 → 시간 → 논리 → 우연 순으로 약해진다.',
      },
    ],
    pitfalls: [
      '결합도는 "약할수록 좋고", 응집도는 "강할수록 좋다" — 방향이 반대다',
      '전략은 알고리즘 교체, 상태는 상태에 따른 행동 변화 — 구조가 비슷해 혼동하기 쉽다',
      '템플릿 메서드는 상속, 전략은 위임(구성)으로 변화를 처리한다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '상태가 변하면 등록된 객체들에게 자동으로 통지하는 행위 패턴은?',
        answer: '옵저버',
        alt: ['옵저버 패턴', '관찰자', 'observer'],
        ignoreCase: true,
        explain: 'Subject 가 상태 변경을 Observer 들에게 알리는 발행-구독 구조다.',
      },
      {
        id: 'q2',
        prompt: '알고리즘을 캡슐화해 실행 중에 교체할 수 있게 하는 행위 패턴은?',
        answer: '전략',
        alt: ['전략 패턴', '스트래티지', '스트래티지 패턴', 'strategy'],
        ignoreCase: true,
        explain: '같은 인터페이스를 가진 여러 알고리즘 중 상황에 맞는 것을 끼워 쓴다.',
      },
      {
        id: 'q3',
        prompt: '결합도 중 가장 약한(가장 좋은) 결합도는?',
        answer: '자료 결합도',
        alt: ['자료', '데이터 결합도', 'data coupling'],
        ignoreCase: true,
        explain: '필요한 데이터만 매개변수로 주고받는 자료 결합도가 가장 약하다.',
      },
      {
        id: 'q4',
        prompt: '응집도 중 가장 강한(가장 좋은) 응집도는?',
        answer: '기능적 응집도',
        alt: ['기능적', '기능 응집도', '기능', 'functional cohesion'],
        ignoreCase: true,
        explain: '모듈이 하나의 기능만 수행하는 기능적 응집도가 가장 강하다.',
      },
    ],
  },
  {
    id: 'integration-interface',
    d: 6,
    title: '통합 구현 — 연계(EAI · ESB) · 인터페이스 · REST',
    track: '통합 구현',
    minutes: 60,
    summary: 'EAI 구축 유형과 ESB, REST 의 HTTP 메서드·상태 코드, JSON 데이터 형식을 정리한다.',
    goals: [
      'EAI 의 4가지 구축 유형을 구분한다',
      'ESB 와 EAI 의 차이를 설명한다',
      'REST 의 HTTP 메서드와 대표 상태 코드를 연결한다',
      'JSON 구조를 읽고 값을 꺼낸다',
    ],
    tablesTitle: '핵심 표',
    tables: [
      {
        name: 'EAI 구축 유형',
        columns: ['유형', '구조', '특징'],
        rows: [
          ['Point-to-Point', '1:1 직접 연결', '단순하지만 연결 수가 늘면 복잡'],
          ['Hub & Spoke', '중앙 허브 경유', '단일 접점 관리, 허브 장애에 취약'],
          ['Message Bus (ESB 형)', '버스를 통한 메시지 전달', '확장성 높음, 대규모 환경'],
          ['Hybrid', 'Hub & Spoke + Bus', '그룹 내 허브, 그룹 간 버스'],
        ],
      },
      {
        name: 'REST (HTTP)',
        columns: ['메서드', '용도', '대표 응답 코드'],
        rows: [
          ['GET', '조회', '200 OK'],
          ['POST', '생성', '201 Created'],
          ['PUT', '전체 수정', '200 OK'],
          ['PATCH', '부분 수정', '200 OK'],
          ['DELETE', '삭제', '204 No Content'],
        ],
      },
    ],
    sections: [
      {
        heading: 'EAI 와 ESB',
        body: 'EAI(기업 응용 통합)는 서로 다른 응용 시스템을 연계해 데이터와 업무 흐름을 통합한다. ESB(엔터프라이즈 서비스 버스)는 서비스 지향 구조(SOA)에서 버스를 통해 서비스 간 메시지 라우팅·변환·프로토콜 중개를 담당한다.',
      },
      {
        heading: 'HTTP 상태 코드',
        body: '2xx 성공(200 OK, 201 Created, 204 No Content), 3xx 리다이렉션, 4xx 클라이언트 오류(400 잘못된 요청, 401 인증 필요, 403 권한 없음, 404 찾을 수 없음), 5xx 서버 오류(500 내부 오류, 503 서비스 이용 불가).',
      },
      {
        heading: 'JSON 읽기',
        body: 'JSON 은 { 키: 값 } 객체와 [ ] 배열로 이루어진 가벼운 데이터 교환 형식이다. 배열의 인덱스는 0 부터 시작한다.',
        lang: 'python',
        code: code`
import json
data = json.loads('{"id": 1, "tags": ["a", "b"]}')
print(data["tags"][1])`,
        output: 'b',
      },
    ],
    pitfalls: [
      'POST 는 생성(멱등하지 않음), PUT 은 전체 교체(멱등) — GET · PUT · DELETE 는 멱등이다',
      '401 은 "인증 안 됨", 403 은 "인증됐지만 권한 없음"이다',
      'Hub & Spoke 는 허브가 단일 장애점이 될 수 있다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: 'EAI 구축 유형 중 중앙의 허브를 거쳐 데이터를 주고받는 방식은?',
        answer: 'Hub & Spoke',
        alt: ['허브 앤 스포크', '허브앤스포크', '허브 스포크', 'hub and spoke', 'hub&spoke', 'hub spoke'],
        ignoreCase: true,
        explain: '모든 시스템이 중앙 허브와만 연결되는 방식이다.',
      },
      {
        id: 'q2',
        prompt: 'REST API 에서 새 리소스를 생성할 때 주로 쓰는 HTTP 메서드는?',
        answer: 'POST',
        ignoreCase: true,
        explain: '생성은 POST, 조회는 GET, 전체 수정은 PUT, 삭제는 DELETE 다.',
      },
      {
        id: 'q3',
        prompt: '존재하지 않는 리소스를 요청했을 때의 HTTP 상태 코드는? (숫자만 입력)',
        answer: '404',
        explain: '404 Not Found. 400 은 잘못된 요청, 403 은 권한 없음이다.',
      },
      {
        id: 'q4',
        prompt: 'XML 보다 가볍고 { 키: 값 } 형태를 쓰는 데이터 교환 형식의 약어는?',
        answer: 'JSON',
        alt: ['제이슨'],
        ignoreCase: true,
        explain: 'JavaScript Object Notation. 웹 API 의 기본 데이터 형식으로 널리 쓰인다.',
      },
    ],
  },
  {
    id: 'security-basics',
    d: 5,
    title: '보안 — 암호화 · 접근 통제 · 웹 공격',
    track: '보안',
    minutes: 60,
    summary: '대칭·비대칭 암호, 해시, 보안 3요소와 대표 웹 공격(SQL 인젝션 · XSS · CSRF)을 정리한다.',
    goals: [
      '보안 3요소 (기밀성 · 무결성 · 가용성) 를 설명한다',
      '대칭키와 비대칭키의 특징과 필요한 키 개수를 계산한다',
      '대표 암호·해시 알고리즘을 분류한다',
      'SQL 인젝션과 방어책(준비된 문장)을 이해한다',
    ],
    tablesTitle: '핵심 표',
    tables: [
      {
        name: '암호 알고리즘',
        columns: ['분류', '알고리즘', '특징'],
        rows: [
          ['대칭키', 'DES · 3DES · AES · SEED · ARIA', '같은 키로 암·복호화, 빠름, 키 배송 문제'],
          ['비대칭키', 'RSA · ECC · ElGamal', '공개키/개인키, 느림, 전자서명 가능'],
          ['해시', 'SHA · MD5', '단방향, 무결성 검증, 복호화 불가'],
        ],
      },
      {
        name: '웹 공격',
        columns: ['공격', '설명'],
        rows: [
          ['SQL 인젝션', '입력값으로 SQL 구문을 조작'],
          ['XSS', '악성 스크립트를 페이지에 삽입해 사용자 브라우저에서 실행'],
          ['CSRF', '로그인된 사용자의 권한으로 원치 않는 요청을 보내게 함'],
        ],
      },
    ],
    sections: [
      {
        heading: '보안 3요소와 키 개수',
        body: '기밀성(허가된 사람만 열람) · 무결성(허가 없이 변경 금지) · 가용성(필요할 때 사용 가능). 대칭키는 n 명이 서로 통신하려면 n(n−1)/2 개, 비대칭키는 사용자마다 한 쌍이라 2n 개의 키가 필요하다.',
        lang: 'text',
        code: code`
n = 10
대칭키   : n(n-1)/2 = 10 x 9 / 2 = 45
비대칭키 : 2n       = 20`,
        output: '대칭 45 / 비대칭 20',
      },
      {
        heading: '접근 통제',
        body: 'DAC(임의 접근 통제, 소유자가 권한 부여), MAC(강제 접근 통제, 보안 등급 기반), RBAC(역할 기반 접근 통제, 역할에 권한 부여). 인증은 지식(비밀번호) · 소유(OTP, 토큰) · 존재(생체) 요소로 나뉘며 둘 이상 결합하면 다중 요소 인증이다.',
      },
      {
        heading: 'SQL 인젝션',
        body: '입력값을 문자열로 이어 붙여 SQL 을 만들면 \' OR \'1\'=\'1 같은 입력이 조건을 항상 참으로 만들어 인증을 우회한다. 방어는 준비된 문장(Prepared Statement)으로 값을 바인딩하고, 입력값을 검증·이스케이프하는 것이다.',
        lang: 'python',
        code: code`
uid = "' OR '1'='1"
print("SELECT * FROM users WHERE id='" + uid + "'")`,
        output: "SELECT * FROM users WHERE id='' OR '1'='1'",
      },
    ],
    pitfalls: [
      '대칭키 알고리즘은 AES · DES · SEED · ARIA, 비대칭키는 RSA · ECC 로 구분한다',
      '해시는 복호화가 안 된다 — 암호화(복호화 가능)와 다르다',
      'XSS 는 사용자 브라우저에서 스크립트가 실행되는 공격, CSRF 는 사용자의 권한을 이용한 요청 위조다',
    ],
    questions: [
      {
        id: 'q1',
        prompt: '미국 표준으로 128 · 192 · 256 비트 키를 쓰는 대칭키 블록 암호 알고리즘은?',
        answer: 'AES',
        ignoreCase: true,
        explain: 'DES 를 대체한 Advanced Encryption Standard 다.',
      },
      {
        id: 'q2',
        prompt: '10명이 서로 대칭키 암호로 통신할 때 필요한 키의 총 개수는? (숫자만 입력)',
        answer: '45',
        explain: 'n(n−1)/2 = 10 × 9 / 2 = 45.',
      },
      {
        id: 'q3',
        prompt: '소인수분해의 어려움에 기반한 대표적인 공개키(비대칭키) 암호 알고리즘은?',
        answer: 'RSA',
        ignoreCase: true,
        explain: 'RSA 는 암호화와 전자서명에 모두 쓰이는 공개키 알고리즘이다.',
      },
      {
        id: 'q4',
        prompt: '다음처럼 입력값이 SQL 조건을 항상 참으로 만들어 인증을 우회하는 공격은?',
        lang: 'python',
        code: code`
uid = "' OR '1'='1"
q = "SELECT * FROM users WHERE id='" + uid + "'"
# q = SELECT * FROM users WHERE id='' OR '1'='1'`,
        answer: 'SQL 인젝션',
        alt: ['sql injection', 'sql 삽입', 'sql인젝션', '에스큐엘 인젝션'],
        ignoreCase: true,
        explain: "id='' OR '1'='1' 에서 '1'='1' 이 항상 참이라 모든 행이 조회된다. 방어는 Prepared Statement.",
      },
    ],
  },
];

/**
 * 입력이 문항의 정답(또는 같은 뜻의 표기 `alt`)과 맞는지. 공백·줄바꿈 차이는 grading 의 규칙대로 무시하고,
 * `ignoreCase` 문항은 대소문자도 무시한다(용어 문제). 출력값 문제는 대소문자를 구분한다.
 */
export function matchesLessonAnswer(question, input) {
  const norm = (t) => (question.ignoreCase ? String(t).toLowerCase() : String(t));
  return [question.answer, ...(question.alt ?? [])].some((a) => matchesExpectedOutput(norm(input), norm(a)) === true);
}

export const lessonByDay = (d) => LESSONS.find((l) => l.d === Number(d)) ?? null;
export const lessonById = (id) => LESSONS.find((l) => l.id === id) ?? null;
