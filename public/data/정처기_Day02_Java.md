# Day 2 - Java 클래스, 상속, 오버라이딩

> **권장 학습 시간**: 14:00~19:00
> **목표**: Java 객체지향 핵심 + 코드 트레이싱 연습
> **학습 후 체크**: [ ] 이론 이해  [ ] 연습 8문제  [ ] 오답 정리

---

## PART 1: 클래스와 객체 핵심

### 1-1. 클래스 기본 구조

```java
class Student {
    String name;
    int score;

    Student(String name, int score) {
        this.name = name;
        this.score = score;
    }

    void display() {
        System.out.println(name + " : " + score);
    }
}

Student s = new Student("Kim", 90);
s.display();   // Kim : 90
```

### 1-2. 접근 제어자

| 제어자 | 같은 클래스 | 같은 패키지 | 자식 클래스 | 전체 |
|--------|:-----------:|:-----------:|:-----------:|:----:|
| `public` | O | O | O | O |
| `protected` | O | O | O | X |
| `(default)` | O | O | X | X |
| `private` | O | X | X | X |

> **시험 포인트**: `private` 멤버는 자식 클래스에서도 직접 접근 불가!

### 1-3. static 키워드

```java
class Counter {
    static int count = 0;    // 클래스 변수 (모든 객체 공유)
    int id;                  // 인스턴스 변수 (객체마다 별도)

    static int getCount() {
        return count;
        // return id;  ← 에러! static에서 인스턴스 변수 접근 불가
    }
}
```

> **시험 함정**: `static` 메서드에서 인스턴스 변수/메서드 접근 → **컴파일 에러!**

---

## PART 2: 상속 핵심

### 2-1. 상속 기본

```java
class Parent {
    int x = 10;
    void show() { System.out.println("Parent: " + x); }
}

class Child extends Parent {
    int y = 20;
    void display() { System.out.println("Child: " + x + ", " + y); }
}
```

### 2-2. super 키워드

```java
super(값)       // 부모 생성자 호출 (반드시 생성자 첫 줄!)
super.메서드()   // 부모 메서드 호출
super.변수      // 부모 변수 접근
```

### 2-3. 생성자 호출 순서 (최빈출!)

```
new Child()
  → Child() → this(5000)
    → Child(5000) → 암묵적 super()
      → Parent() → this(500)
        → Parent(500) → Parent.x = 500
    → Child.x = 5000

결론: 부모와 자식의 같은 이름 변수는 별개!
getX()가 Parent 소속이면 → Parent.x 반환
```

### 2-4. this vs super 비교

| 키워드 | 의미 | 사용 |
|--------|------|------|
| `this` | 현재 객체 | `this.변수`, `this()` |
| `super` | 부모 객체 | `super.변수`, `super()` |

---

## PART 3: 오버라이딩 vs 오버로딩

### 3-1. 비교 정리

| 구분 | 오버라이딩 (Overriding) | 오버로딩 (Overloading) |
|------|------------------------|----------------------|
| 의미 | 부모 메서드 **재정의** | 같은 이름, **다른 매개변수** |
| 관계 | 상속 관계 필요 | 같은 클래스 내 |
| 메서드명 | 동일 | 동일 |
| 매개변수 | **동일** | **다름** |
| 리턴타입 | 동일 | 무관 |

### 3-2. 다형성 핵심 규칙

```java
Parent obj = new Child();  // 부모 타입, 자식 객체
```

| 호출 대상 | 결과 |
|-----------|------|
| 오버라이딩된 메서드 | **자식** 메서드 실행 |
| 오버라이딩 안 된 메서드 | 부모 메서드 실행 |
| 자식에만 있는 메서드 | **컴파일 에러** |
| 같은 이름 변수 | **부모** 변수 사용 |

---

## PART 4: 추상 클래스와 인터페이스

### 4-1. 추상 클래스

```java
abstract class Shape {
    abstract double area();    // 구현부 없음 → 자식이 반드시 구현
    void show() { }            // 일반 메서드도 가능
}
```

### 4-2. 인터페이스

```java
interface Printable {
    void print();              // public abstract 생략
}
class Doc implements Printable {
    public void print() { System.out.println("출력"); }
}
```

### 4-3. 비교

| 구분 | 추상 클래스 | 인터페이스 |
|------|------------|-----------|
| 키워드 | `extends` | `implements` |
| 상속 | 단일 상속 | 다중 구현 가능 |
| 변수 | 모든 변수 가능 | 상수(final)만 |
| 메서드 | 추상+일반 | 추상 중심 |

---

## PART 5: 코드 트레이싱 연습 (직접 풀어보기!)

> 기출에 자주 나온 **개념**을 이 앱에서 새로 만든 문제입니다. 정답은 javac 로 컴파일 · 실행해 확인했습니다.

---

### 문제 1 (오버라이딩 + 재귀) ★★★★★

```java
class Base {
    int calc(int n) {
        if (n <= 0) return 1;
        return calc(n - 1) + n;
    }
}
class Derived extends Base {
    int calc(int n) {
        if (n <= 0) return 1;
        return calc(n - 2) * 2;
    }
}
public class Main {
    public static void main(String[] args) {
        Base obj = new Derived();
        System.out.print(obj.calc(5));
    }
}
```

**트레이싱:**
```
obj 의 실제 객체는 ______ → calc 는 ______ 의 것이 불린다 (재귀 호출도 마찬가지)

calc(5) = calc(___) * 2
calc(3) = calc(___) * 2
calc(1) = calc(___) * 2
calc(-1) = ___

출력: ___
```

---

### 문제 2 (super 생성자 + super 메서드) ★★★

```java
class Animal {
    protected String name;
    public Animal(String name) {
        this.name = name;
        System.out.println("Animal(" + name + ")");
    }
    public void speak() { System.out.println("..."); }
}
class Dog extends Animal {
    public Dog(String name) {
        super(name);
        System.out.println("Dog(" + name + ")");
    }
    public void speak() {
        super.speak();
        System.out.println(name + ": bark");
    }
}
public class Main {
    public static void main(String[] args) {
        Animal a = new Dog("Max");
        a.speak();
    }
}
```

**나의 답:**
```
___________
___________
___________
___________
```

---

### 문제 3 (추상 클래스 + 오버로딩) ★★★★

```java
abstract class Shape {
    String label;
    abstract String describe(int scale);
    String describe() {
        return "Shape " + label;
    }
}
class Circle extends Shape {
    Circle(String label) { this.label = label; }
    String describe(int scale) {
        return "Circle " + label + " x" + scale;
    }
}
public class Main {
    public static void main(String[] args) {
        Shape s = new Circle("C1");
        System.out.println(s.describe());
        System.out.println(s.describe(3));
    }
}
```

**포인트: 매개변수 없는 `describe()` 는 누가 가지고 있나?**

나의 답:
```
___________________________
___________________________
```

---

### 문제 4 (생성자 체이닝 + 필드 숨김) ★★★★★

```java
class Parent {
    int v = 1;
    Parent() { this(20); System.out.print("P "); }
    Parent(int v) { this.v = v; System.out.print("P(" + v + ") "); }
    int getV() { return v; }
}
class Child extends Parent {
    int v = 300;
    Child() { this(400); System.out.print("C "); }
    Child(int v) { this.v = v; System.out.print("C(" + v + ") "); }
}
public class Main {
    public static void main(String[] args) {
        Child obj = new Child();
        System.out.println();
        System.out.println(obj.getV() + obj.v);
    }
}
```

**트레이싱:**
```
Child() → this(400) → Child(400)
  → 암묵적 super() → Parent() → this(20) → Parent(20)
      → Parent.v = ___ , 출력 "_____"
    → Parent() 나머지, 출력 "_____"
  → Child.v = ___ , 출력 "_____"
→ Child() 나머지, 출력 "_____"

getV() 는 Parent 의 메서드 → Parent.v = ___
obj.v 는 Child 타입 변수로 접근 → Child.v = ___

출력 (2줄): ____________ / ___
```

---

### 문제 5 (싱글톤) ★★★★

```java
class Counter {
    private static Counter instance;
    private static int created = 0;
    private int hits = 0;
    private Counter() { created++; }
    static Counter getInstance() {
        if (instance == null) instance = new Counter();
        return instance;
    }
    void hit() { hits++; }
    int getHits() { return hits; }
    static int getCreated() { return created; }
}
public class Main {
    public static void main(String[] args) {
        Counter a = Counter.getInstance();
        a.hit();
        Counter b = Counter.getInstance();
        b.hit();
        b.hit();
        System.out.println(a.getHits() + " " + Counter.getCreated() + " " + (a == b));
    }
}
```

**a 와 b 는 같은 객체? ___ → 출력: ___________**

---

### 문제 6 (오버라이딩 안에서 super.메서드) ★★★★

```java
class Calc {
    int op(int x, int y) { return x * y; }
}
class SubCalc extends Calc {
    int op(int x, int y) {
        return super.op(x, y) - (x + y);
    }
}
public class Main {
    public static void main(String[] args) {
        Calc c1 = new Calc();
        Calc c2 = new SubCalc();
        System.out.println(c1.op(4, 5) + c2.op(4, 5));
    }
}
```

**트레이싱:**
```
c1.op(4,5) = ___
c2.op(4,5) = super.op(4,5) - (4+5) = ___ - ___ = ___
합계: ___
```

---

### 문제 7 (String 메서드) ★★★

```java
public class Main {
    public static void main(String[] args) {
        String str = "Engineering";
        System.out.println(str.length());
        System.out.println(str.charAt(5));
        System.out.println(str.substring(3, 7));
        System.out.println(str.indexOf("ee"));
        System.out.println(str.lastIndexOf('n'));
    }
}
```

**인덱스: E(0) n(1) g(2) i(3) n(4) e(5) e(6) r(7) i(8) n(9) g(10)**

나의 답:
```
___
___
___
___
___
```

---

### 문제 8 (비단락 논리 연산 | & ^) ★★★★

```java
public class Main {
    public static void main(String[] args) {
        int x = 6, y = 3, z = 6, w = 2;
        if ((x == y | x == z) & !(y < w) & (x > z ^ y != w)) {
            x = y * w;
            if (x == z ^ y > w) {
                System.out.println(x + y);
            } else {
                System.out.println(x - w);
            }
        } else {
            System.out.println(z);
        }
    }
}
```

**트레이싱:**
```
| → OR (양쪽 모두 평가)   & → AND (양쪽 모두 평가)   ^ → XOR (다르면 true)

(x==y | x==z)    = (___ | ___) = ___
!(y<w)           = !(___)      = ___
(x>z ^ y!=w)     = (___ ^ ___) = ___
전체 = ___ → ___ 블록

x = y*w = ___
(x==z ^ y>w) = (___ ^ ___) = ___ → ___ 블록
출력: ___
```

---

## PART 6: 정답 & 해설

<details>

### 문제 1 정답: `8`
- 실제 객체가 Derived 이므로 **재귀 안의 calc 도 Derived 의 것**이 불린다 (동적 바인딩)
- calc(-1) = 1 → calc(1) = 1×2 = 2 → calc(3) = 2×2 = 4 → calc(5) = 4×2 = **8**
- 함정: Base 의 `calc(n-1) + n` 으로 계산하면 틀린다

### 문제 2 정답
```
Animal(Max)
Dog(Max)
...
Max: bark
```
- 생성: `super(name)` 이 먼저 → Animal 생성자 출력 → 그다음 Dog 생성자 출력
- `a.speak()`: 실제 객체 Dog 의 speak → `super.speak()` 로 "..." → 이어서 "Max: bark"

### 문제 3 정답
```
Shape C1
Circle C1 x3
```
- 매개변수 없는 `describe()` 는 Circle 이 재정의하지 않았다 → **Shape 의 것**이 그대로 쓰인다
- `describe(3)` 은 추상 메서드라 **Circle 의 구현**이 불린다 (오버로딩: 이름은 같고 매개변수가 다름)

### 문제 4 정답
```
P(20) P C(400) C 
420
```
- 생성자 순서: Child() → Child(400) → (super) Parent() → Parent(20). 출력은 **안쪽부터** 끝나므로 P(20) → P → C(400) → C
- `getV()` 는 Parent 의 메서드라 **Parent.v = 20**, `obj.v` 는 Child 타입 변수라 **Child.v = 400** (필드는 오버라이딩되지 않는다)
- 20 + 400 = **420**

### 문제 5 정답: `3 1 true`
- getInstance 는 처음 한 번만 객체를 만든다 → **같은 객체**, created = **1**
- hit() 을 a 로 1번, b 로 2번 → 같은 객체의 hits = **3**

### 문제 6 정답: `31`
- c1.op(4,5) = 4×5 = **20**
- c2.op(4,5) = super.op(4,5) − (4+5) = 20 − 9 = **11** (실제 객체 SubCalc)
- 20 + 11 = **31**

### 문제 7 정답
```
11
e
inee
5
9
```
- `substring(3, 7)`: 인덱스 3 ~ **6** (끝 번호는 포함하지 않음) → i n e e
- `indexOf("ee")`: 처음 나오는 위치 5 / `lastIndexOf('n')`: 마지막 n 은 인덱스 9

### 문제 8 정답: `4`
- (F | T) = T, !(F) = T, (F ^ T) = T → 전체 **T** → 첫 블록
- x = 3×2 = 6 → (6==6 ^ 3>2) = (T ^ T) = **F** → else
- x − w = 6 − 2 = **4**
- 함정: `|` `&` 는 단락 평가를 하지 않아 양쪽을 모두 계산한다 (`||` `&&` 와 다름)

</details>

---

## Day 2 학습 완료 체크리스트

- [ ] PART 1~4 이론 읽기 완료
- [ ] PART 5 문제 8개 종이에 직접 풀기
- [ ] 틀린 문제 해설 확인 + 오답 원인 메모
- [ ] 핵심 암기: 오버라이딩 vs 오버로딩
- [ ] 핵심 암기: `Parent obj = new Child()` 다형성 규칙
- [ ] 핵심 암기: 생성자 호출 순서 (this → super)
- [ ] 핵심 암기: `static` 제약사항

---

> **내일 Day 3 예고**: Python 기초 + SQL 기본 (SELECT, JOIN)
>
> **참고 링크**:
> - [김테드 Java 기출 모음](https://idkim97.github.io/2024-03-28-%EC%A0%95%EB%B3%B4%EC%B2%98%EB%A6%AC%EA%B8%B0%EC%82%AC%20%EC%8B%A4%EA%B8%B0%20Java%20%EB%AC%B8%EC%A0%9C%20%EB%AA%A8%EC%9D%8C/)
> - [Velog Java 기출 (2020~2023)](https://velog.io/@mjieun/정보처리기사-프로그래밍-언어-기출-문제-모음2020년-1회-2023년-1회-자바)
> - [시나공 기출](https://www.sinagong.co.kr/pds/001001002/past-exams)
> - [뉴비티 CBT](https://newbt.kr/시험/정보처리기사%20실기)
