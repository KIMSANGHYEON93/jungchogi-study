# Day 7 - 코드 종합 복습 (C + Java + Python 혼합 트레이싱)

> **권장 학습 시간**: 20:00~22:00 *(재일이 청모 후 저녁)*
> **목표**: C/Java/Python/SQL 혼합 실전형 15문제 트레이싱 → 약점 파악
> **출처**: 15문제 모두 이 앱에서 새로 만든 문제입니다. 정답은 실제로 실행해 확인했습니다.
> **학습 후 체크**: [ ] 15문제 풀기  [ ] 오답 5개 이내  [ ] 약점 기록

---

## 출제 비중 요약 (시험 20문항 중)

| 언어 | 예상 문항 | 핵심 유형 |
|------|-----------|-----------|
| **C** | 2~3문항 | 포인터, 배열, 구조체, 재귀, 스코프 |
| **Java** | 2~3문항 | 상속, 오버라이딩, 생성자체이닝, static |
| **Python** | 1~2문항 | 슬라이싱, 리스트, set, lambda, 클래스 |
| **SQL** | 2~3문항 | JOIN, GROUP BY, DDL, 서브쿼리 |

> **코드 문제 = 전체의 약 50%! → 여기서 틀리면 합격 불가능**

---

## 실전 모의 트레이싱 15문제

### ⏱ 제한시간: 문제당 3~5분, 전체 60분 이내

---

### 문제 1 (C - 변수 스코프) ★★★★

```c
#include <stdio.h>
int g = 1;
void add(int g) { g += 100; }
void inc() { g += 10; }
int main() {
    int a = 4;
    {
        int a = 9;
        g = a + g;
    }
    add(g);
    inc();
    printf("%d %d\n", a, g);
    return 0;
}
```

**트레이싱:**
```
전역: g=1 / main: a=4
블록: a=9(새 지역변수), g = a + g → g=___
add(g): 매개변수 g 는 지역변수 → 전역 g 는 ___
inc(): 전역 g += 10 → g=___
printf → a=___ (블록의 a 는 이미 사라짐)

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `4 20`**
- 블록 안 a=9 는 블록이 끝나면 사라진다 → main 의 a=4
- g = 9 + 1 = 10 (전역 g)
- `add(int g)` 의 g 는 매개변수라 전역 g 를 가린다 → 전역은 그대로 10
- inc() → 전역 g = 20

</details>

---

### 문제 2 (C - 포인터 + 배열) ★★★★★

```c
#include <stdio.h>
int main() {
    int a[] = {3, 6, 9, 12, 15};
    int *p = a + 1;
    printf("%d ", *p + 1);
    printf("%d ", *(p + 1));
    p += 2;
    printf("%d ", *p--);
    printf("%d ", *p);
    printf("%d\n", (int)(p - a));
    return 0;
}
```

**트레이싱:**
```
p = a + 1 → a[1]=6
*p + 1     = ___   ← 값에 +1
*(p + 1)   = a[___] = ___
p += 2     → p = &a[___]
*p--       = ___, 그다음 p 는 a[___]
*p         = ___
p - a      = ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `7 9 12 9 2`**
- `*p + 1` = 6 + 1 = 7 (주소 이동 아님)
- `*(p + 1)` = a[2] = 9
- p += 2 → a[3]
- `*p--` 는 a[3]=12 를 쓰고 나서 p 를 a[2] 로 옮긴다
- `*p` = 9, `p - a` = 2 (포인터 뺄셈 = 칸 수)

</details>

---

### 문제 3 (C - 재귀함수) ★★★★★

```c
#include <stdio.h>
int h(int n) {
    if (n == 0) return 0;
    return n % 10 + h(n / 10);
}
int main() {
    printf("%d %d\n", h(4729), h(105));
    return 0;
}
```

**트레이싱:**
```
h(4729) = 9 + h(472)
h(472)  = ___ + h(47)
h(47)   = ___ + h(4)
h(4)    = ___ + h(0)
h(0)    = 0
→ h(4729) = ___

h(105) = 5 + h(10) = 5 + 0 + h(1) = ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `22 6`**
- n % 10 은 마지막 자리, n / 10 은 마지막 자리를 뗀 수
- h 는 각 자리 숫자의 합: 4+7+2+9 = 22, 1+0+5 = 6

</details>

---

### 문제 4 (C - 구조체 포인터) ★★★★

```c
#include <stdio.h>
struct node {
    int v;
    struct node *next;
};
int main() {
    struct node c = {30, NULL};
    struct node b = {20, &c};
    struct node a = {10, &b};
    struct node *p = &a;
    int sum = 0;
    while (p != NULL) {
        sum += p->v;
        p = p->next;
    }
    a.next->v += 5;
    printf("%d %d %d\n", sum, b.v, a.next->next->v);
    return 0;
}
```

**트레이싱:**
```
연결: a(10) → b(20) → c(30) → NULL
while: sum = ___ + ___ + ___ = ___
a.next      = &b → b.v = ___
a.next->next = &c → c.v = ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `60 25 30`**
- p 가 next 를 따라 a → b → c 로 이동하며 합: 60
- `a.next->v` 는 b.v → 25
- `a.next->next->v` 는 c.v → 30 (바뀌지 않음)

</details>

---

### 문제 5 (C - 2차원 배열 + 포인터) ★★★★★

```c
#include <stdio.h>
int main() {
    int m[3][3] = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
    int *p = &m[0][0];
    int i, s = 0;
    for (i = 0; i < 9; i += 4)
        s += *(p + i);
    printf("%d %d %d\n", s, *(m[1] + 2), *(*(m + 2) + 1));
    return 0;
}
```

**트레이싱:**
```
2차원 배열은 메모리에 한 줄로: 1 2 3 4 5 6 7 8 9
i = 0, 4, 8 → *(p+0)=___, *(p+4)=___, *(p+8)=___ → s=___
*(m[1] + 2)     = m[1][2] = ___
*(*(m + 2) + 1) = m[2][1] = ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `15 6 8`**
- p+4 는 5번째 칸 = m[1][1] = 5, p+8 = m[2][2] = 9 → 대각선 합 15
- `*(m[i] + j)` 와 `*(*(m + i) + j)` 는 모두 m[i][j]

</details>

---

### 문제 6 (Java - 상속 + 오버라이딩) ★★★★★

```java
class A {
    String name() { return "A"; }
    String hello() { return "hi " + name(); }
}
class B extends A {
    String name() { return "B"; }
}
class C extends B {
    String hello() { return super.hello() + "!"; }
}
public class Main {
    public static void main(String[] args) {
        A x = new C();
        A y = new B();
        System.out.println(x.hello() + " / " + y.hello());
    }
}
```

**트레이싱:**
```
x = new C()
x.hello()   → C 의 hello → super.hello() = ___ 의 hello
            → "hi " + name() → name() 은 실제 객체(C) 기준 → ___ 의 name
            → ___
y = new B()
y.hello()   → ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `hi B! / hi B`**
- C 는 name() 을 재정의하지 않았으므로 B 의 name() "B" 를 물려받는다
- 부모(A)의 hello() 안에서 부른 name() 도 실제 객체 기준으로 결정된다 (동적 바인딩)

</details>

---

### 문제 7 (Java - 생성자 + super) ★★★★★

```java
class P {
    P() { System.out.print("p "); }
    P(String s) { this(); System.out.print(s + " "); }
}
class K extends P {
    K() { super("x"); System.out.print("k "); }
    K(int n) { this(); System.out.print(n); }
}
public class Main {
    public static void main(String[] args) {
        new K(7);
        System.out.println();
    }
}
```

**트레이싱:**
```
new K(7)
→ K(int) 의 this() → K()
  → super("x") → P(String)
    → this() → P() → "___" 출력
    → "___" 출력
  → "___" 출력
→ "___" 출력

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `p x k 7`**
- 생성자 본문은 호출한 생성자가 끝난 뒤에 실행된다 → 가장 안쪽 P() 부터 출력
- this() 를 부른 생성자는 super() 를 따로 부르지 않는다

</details>

---

### 문제 8 (Java - static + 인스턴스) ★★★★

```java
class Counter {
    static int total = 0;
    int mine = 0;
    void hit(int n) {
        total += n;
        mine += n;
    }
}
public class Main {
    public static void main(String[] args) {
        Counter a = new Counter();
        Counter b = new Counter();
        a.hit(2);
        b.hit(5);
        a.hit(3);
        Counter c = new Counter();
        c.hit(1);
        System.out.println(a.mine + " " + b.mine + " " + c.mine + " " + Counter.total);
    }
}
```

**트레이싱:**
```
total 은 static → 모든 객체가 공유, mine 은 객체마다 따로
a.hit(2): total=___, a.mine=___
b.hit(5): total=___, b.mine=___
a.hit(3): total=___, a.mine=___
c.hit(1): total=___, c.mine=___   ← 새 객체여도 total 은 이어진다

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `5 5 1 11`**
- static 필드는 나중에 만든 객체(c)에서도 같은 값을 이어 쓴다
- total = 2 + 5 + 3 + 1 = 11

</details>

---

### 문제 9 (Java - 추상클래스 + 다형성) ★★★★

```java
abstract class Animal {
    abstract String sound();
    String speak(int n) {
        String r = "";
        for (int i = 0; i < n; i++) r += sound();
        return r;
    }
}
class Cat extends Animal {
    String sound() { return "mi"; }
}
class Dog extends Animal {
    String sound() { return "wo"; }
    String speak(int n) { return super.speak(n - 1) + "!"; }
}
public class Main {
    public static void main(String[] args) {
        Animal[] arr = { new Cat(), new Dog() };
        System.out.println(arr[0].speak(2) + " " + arr[1].speak(3));
    }
}
```

**트레이싱:**
```
arr[0] = Cat → speak(2) → sound() 를 ___ 번 → ___
arr[1] = Dog → Dog 의 speak(3) → super.speak(___) + "!"
             → 부모 speak 안의 sound() 는 ___ 의 것 → ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `mimi wowo!`**
- Dog 의 speak(3) 은 부모 speak(2) 를 부른다 — 반복 횟수가 1 줄어든다
- 부모 메서드 안의 sound() 는 실제 객체(Dog)의 "wo"

</details>

---

### 문제 10 (Python - 리스트 + 조건) ★★★★

```python
nums = [5, 12, 7, 20, 9, 14, 3]
out = []
for n in nums:
    if n > 10:
        out.append(n // 2)
    elif n % 3 == 0:
        out.append(-n)
    else:
        continue
    if len(out) == 4:
        break
print(out, len(nums) - len(out))
```

**트레이싱:**
```
n=5:  10 이하, 3의 배수 아님 → continue
n=12: > 10 → append(___)
n=7:  → ___
n=20: → append(___)
n=9:  → append(___)
n=14: → append(___) → len(out)=___ → break
n=3 은 ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `[6, 10, -9, 7] 3`**
- `//` 는 몫(정수 나눗셈)
- continue 는 아래의 break 검사까지 건너뛴다
- 4개가 차면 break → 3 은 보지 않는다, 7 - 4 = 3

</details>

---

### 문제 11 (Python - 딕셔너리 + 반복문) ★★★★

```python
words = ["db", "api", "db", "os", "api", "db"]
cnt = {}
for w in words:
    cnt[w] = cnt.get(w, 0) + 1
best = max(cnt, key=cnt.get)
print(cnt)
print(best, sum(v for k, v in cnt.items() if k != best))
```

**트레이싱:**
```
get(w, 0): 처음 보는 단어는 0 에서 시작
cnt = {'db': ___, 'api': ___, 'os': ___}   (처음 넣은 순서 유지)
max(cnt, key=cnt.get) → 값이 가장 큰 키 = ___
best 를 뺀 값의 합 = ___

출력:
___
___
```

<details><summary>정답 확인</summary>

**정답:**

```
{'db': 3, 'api': 2, 'os': 1}
db 3
```
- 딕셔너리는 키를 처음 넣은 순서대로 출력된다
- `max(d, key=d.get)` 는 값이 아니라 키를 돌려준다
- db 를 뺀 합: 2 + 1 = 3

</details>

---

### 문제 12 (Python - 클래스 상속) ★★★★★

```python
class Account:
    rate = 2
    def __init__(self, money):
        self.money = money
    def total(self):
        return self.money * self.rate

class Vip(Account):
    rate = 3
    def total(self):
        return super().total() + 100

a = Account(50)
v = Vip(50)
Account.rate = 4
print(a.total(), v.total())
```

**트레이싱:**
```
rate 는 클래스 변수
Account.rate = 4 로 바꿈 → a.rate = ___
Vip 는 자기 rate = 3 이 있음 → v.rate = ___
a.total() = 50 * ___ = ___
v.total() = super().total() + 100 = 50 * ___ + 100 = ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `200 250`**
- 객체 생성 뒤에 클래스 변수를 바꿔도 객체는 바뀐 값을 읽는다
- Vip 는 rate 를 따로 가지므로 Account.rate 변경의 영향을 받지 않는다
- super().total() 안의 self.rate 는 Vip 객체 기준 = 3

</details>

---

### 문제 13 (Python - 문자열 + 리스트 컴프리헨션) ★★★★

```python
s = "information processing"
words = s.split()
caps = [w[0].upper() + w[-1] for w in words]
vowels = [c for c in s if c in "aeiou"]
print(caps, len(vowels), "".join(sorted(set(words[0])))[:4])
```

**트레이싱:**
```
words = ['information', 'processing']
caps: 첫 글자 대문자 + 마지막 글자 → [___, ___]
모음: information → ___ 개, processing → ___ 개 → 합 ___
set('information') → 중복 제거 후 정렬 → 앞 4글자 = ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `['In', 'Pg'] 8 afim`**
- `w[-1]` 은 마지막 글자
- information 의 모음 i·o·a·i·o 5개 + processing 의 o·e·i 3개 = 8
- set 으로 중복을 지운 뒤 sorted → a f i m n o r t → 앞 4글자 afim

</details>

---

### 문제 14 (C - 증감연산자 종합) ★★★★★

```c
#include <stdio.h>
int main() {
    int a = 5, b = 3, c;
    c = a++ + ++b;
    a += b--;
    c -= --a - b++;
    printf("%d %d %d\n", a, b, c);
    return 0;
}
```

**트레이싱:**
```
a=5, b=3
c = a++ + ++b  → ___ + ___ = ___  (그 뒤 a=___, b=___)
a += b--       → a = ___ (그 뒤 b=___)
c -= --a - b++ → --a=___, b++ 는 ___ 를 쓰고 b=___
               → c = ___ - ___ = ___

출력: ___
```

<details><summary>정답 확인</summary>

**정답: `9 4 3`**
- c = 5 + 4 = 9 (a=6, b=4)
- a = 6 + 4 = 10 (b=3)
- c = 9 - (9 - 3) = 3, 마지막에 b=4

</details>

---

### 문제 15 (SQL - 종합) ★★★★★

**테이블: 강좌**

| 강좌명 | 분야 | 수강료 | 정원 |
|------|------|------|------|
| 자바 | 개발 | 300 | 20 |
| 파이썬 | 개발 | 250 | 30 |
| 엑셀 | 사무 | 100 | 40 |
| 회계 | 사무 | 200 | 10 |
| 리액트 | 개발 | 350 | 15 |
| 보안 | 보안 | 400 | 12 |

```sql
SELECT 분야, COUNT(*) AS 강좌수, SUM(정원) AS 총정원
FROM 강좌
WHERE 수강료 >= 200
GROUP BY 분야
HAVING SUM(정원) >= 12
ORDER BY 총정원 DESC;
```

**트레이싱:**
```
WHERE 수강료 >= 200:
  자바 ___, 파이썬 ___, 엑셀(100) ___, 회계 ___, 리액트 ___, 보안 ___

GROUP BY 분야:
  개발: 강좌수=___, 총정원=___
  사무: 강좌수=___, 총정원=___
  보안: 강좌수=___, 총정원=___

HAVING SUM(정원) >= 12:
  ___ 통과, ___ 탈락

결과:
| 분야 | 강좌수 | 총정원 |
|------|--------|--------|
| ___  | ___    | ___    |
| ___  | ___    | ___    |
```

<details><summary>정답 확인</summary>

**정답:**

| 분야 | 강좌수 | 총정원 |
|------|------|------|
| 개발 | 3 | 65 |
| 보안 | 1 | 12 |

- WHERE 에서 엑셀(100)이 먼저 빠져 사무는 회계 1개(정원 10)만 남는다
- 개발 20 + 30 + 15 = 65, 보안 12 → HAVING >= 12 는 "이상"이라 보안도 통과
- 사무(10)는 탈락

</details>

---

## 약점 자가 진단표

풀고 나서 체크하세요:

| 번호 | 유형 | 맞음 | 틀림 | 약점 메모 |
|------|------|:----:|:----:|-----------|
| 1 | C 스코프 | | | |
| 2 | C 포인터 | | | |
| 3 | C 재귀 | | | |
| 4 | C 구조체 | | | |
| 5 | C 2차원배열 | | | |
| 6 | Java 다형성 | | | |
| 7 | Java 생성자 | | | |
| 8 | Java static | | | |
| 9 | Java 추상클래스 | | | |
| 10 | Python 조건 | | | |
| 11 | Python 딕셔너리 | | | |
| 12 | Python 클래스 | | | |
| 13 | Python 컴프리헨션 | | | |
| 14 | C 증감연산자 | | | |
| 15 | SQL 종합 | | | |

**결과:** ___/15 맞음

| 정답 수 | 판정 | 대응 |
|---------|------|------|
| 13~15 | 우수 | 이론 용어 집중! |
| 10~12 | 양호 | 틀린 유형 Day1~4 복습 |
| 7~9 | 보통 | 코드 유형 집중 반복 필요 |
| ~6 | 위험 | Day1~4 처음부터 재학습 |

---

## Day 7 학습 완료 체크리스트

- [ ] 15문제 타이머 맞춰서 풀기 (60분)
- [ ] 채점 후 약점 진단표 작성
- [ ] 틀린 문제 관련 Day 학습자료 재확인
- [ ] 가장 약한 유형 3개 메모 → 주말에 집중 복습

---

> **내일 Day 8 예고**: 이론 용어 총정리 (기출 빈출 약어 + 핵심 개념 150선)
>
> **참고 링크**:
> - [C언어 기출변형 문제](https://fullmoon-system.com/%EC%A0%95%EB%B3%B4%EC%B2%98%EB%A6%AC%EA%B8%B0%EC%82%AC-%EC%8B%A4%EA%B8%B0-c%EC%96%B8%EC%96%B4-%EC%BD%94%EB%94%A9-%EA%B8%B0%EC%B6%9C%EB%B3%80%ED%98%95-%EB%AC%B8%EC%A0%9C-1/)
> - [시나공 기출](https://www.sinagong.co.kr/pds/001001002/past-exams)
> - [뉴비티 CBT](https://newbt.kr/시험/정보처리기사%20실기)
