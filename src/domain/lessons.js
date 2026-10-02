// 로드맵 일차별 레슨 — 개념 요약 · 예제 코드 · 확인 퀴즈.
//
// 1단계(D-24 ~ D-17)의 8개 일차를 담는다. D-16 은 점검일이라 레슨 대신 연습·오답노트를 쓴다.
// 예제의 출력·퀴즈 정답은 직접 실행해 확인했다(C 는 gcc, Java 는 javac, Python 은 python3, SQL 은 SQLite).
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
];

export const lessonByDay = (d) => LESSONS.find((l) => l.d === Number(d)) ?? null;
export const lessonById = (id) => LESSONS.find((l) => l.id === id) ?? null;
