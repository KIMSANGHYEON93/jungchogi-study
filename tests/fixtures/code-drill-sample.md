# 코드 트레이싱 & SQL 집중 드릴 (40문제)

> **목적**: 시험에서 가장 배점 높고 실수 잦은 코드/SQL 문제 집중 훈련
> **방법**: 문제 → 손으로 변수 추적표 작성 → 정답 확인 → 함정 포인트 체크
> **출처**: 이 앱에서 새로 만든 문제입니다. 모든 코드 정답은 실제로 실행해 확인했습니다.
> **목표 시간**: 코드 1문제 3~5분, SQL 1문제 2~3분

---

## Part 1. C언어 (10문제)

### C-01. 포인터 기본

```c
#include <stdio.h>
int main() {
    int x = 4, y = 9;
    int *p = &y;
    *p = *p - x;
    p = &x;
    *p = *p * y;
    printf("%d %d", x, y);
    return 0;
}
```

<details>
<summary>정답 및 풀이</summary>

```
x=4, y=9, p=&y
*p = *p - x → y = 9 - 4 = 5
p = &x      → p 가 x 를 가리킴
*p = *p * y → x = 4 * 5 = 20   (y 는 이미 5)

출력: 20 5
```
**함정**: `*p` 는 "지금 p 가 가리키는 변수"다. p 를 옮긴 뒤에는 다른 변수를 바꾼다
</details>

---

## Part 2. Java (10문제)

### J-01. 상속 + 오버라이딩

```java
class P {
    int v = 1;
    String who() { return "P"; }
}
class Q extends P {
    int v = 2;
    String who() { return "Q"; }
}
public class Main {
    public static void main(String[] args) {
        P obj = new Q();
        System.out.println(obj.v + " " + obj.who());
    }
}
```

<details>
<summary>정답 및 풀이</summary>

```
P obj = new Q()
obj.v     → 필드는 변수 타입(P) 기준 = 1
obj.who() → 메서드는 실제 객체(Q) 기준 = "Q"

출력: 1 Q
```
**함정**: 필드는 오버라이딩되지 않는다 — 변수 타입을 따른다
</details>

---

## Part 4. SQL (10문제)

### S-01. GROUP BY + HAVING

```
테이블: 주문(고객, 상품, 금액)
| 고객 | 상품 | 금액 |
|------|------|------|
| 김 | 펜 | 300 |
| 이 | 책 | 1200 |
| 김 | 책 | 900 |
| 박 | 컵 | 500 |
| 이 | 펜 | 300 |
| 김 | 컵 | 600 |
```

```sql
SELECT 고객, COUNT(*) AS 건수, SUM(금액) AS 합계
FROM 주문
GROUP BY 고객
HAVING SUM(금액) >= 1000
ORDER BY 합계 DESC;
```

<details>
<summary>정답 및 풀이</summary>

```
① GROUP BY 고객:
   김: 300 + 900 + 600 = 1800 (3건)
   이: 1200 + 300 = 1500 (2건)
   박: 500 (1건)
② HAVING 합계 >= 1000 → 박 제외
③ 합계 내림차순

결과:
| 고객 | 건수 | 합계 |
|------|------|------|
| 김 | 3 | 1800 |
| 이 | 2 | 1500 |
```
**함정**: 집계 함수로 거르는 조건은 WHERE 가 아니라 HAVING
</details>

---

### S-05. DDL 작성

```
다음 조건에 맞는 CREATE TABLE 문을 작성하시오:
- 테이블명: 도서
- 도서번호(INT): 기본키
- 제목(VARCHAR(50)): NOT NULL
- 가격(INT): 0 이상만 허용
- 분류(VARCHAR(10)): 기본값 '일반'
- 출판사번호(INT): 출판사 테이블의 출판사번호를 참조(외래키)
```

<details>
<summary>정답</summary>

```sql
CREATE TABLE 도서 (
    도서번호 INT PRIMARY KEY,
    제목 VARCHAR(50) NOT NULL,
    가격 INT CHECK (가격 >= 0),
    분류 VARCHAR(10) DEFAULT '일반',
    출판사번호 INT,
    FOREIGN KEY (출판사번호) REFERENCES 출판사(출판사번호)
);
```
**체크**: PRIMARY KEY / NOT NULL / CHECK / DEFAULT / FOREIGN KEY … REFERENCES 를 구분
</details>

---
