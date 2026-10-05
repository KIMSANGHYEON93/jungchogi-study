#!/usr/bin/env python3
"""모의고사 md(Day09 · Day11)와 Day07 실전 트레이싱의 코드 · SQL 문항을 실제로 실행해 적힌 정답과 맞는지 확인한다.

    python3 scripts/verify-mock-exams.py

필요: gcc, javac/java, python3 (SQL 은 내장 sqlite3). 문항을 고치거나 새로 넣은 뒤 돌린다.
md 를 그대로 읽으므로 별도의 정답 사본이 없다 — 문서와 검증이 어긋날 수 없다.
"""
import os, re, sqlite3, subprocess, sys, tempfile

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
FILES = ['정처기_Day07_코드종합복습.md', '정처기_Day09_모의고사1회.md', '정처기_Day11_모의고사2회.md']
ENV = {k: v for k, v in os.environ.items() if k != 'JAVA_TOOL_OPTIONS'}

def run_code(lang, code):
    d = tempfile.mkdtemp()
    if lang == 'c':
        open(f'{d}/m.c', 'w').write(code)
        subprocess.run(['gcc', '-o', f'{d}/m', f'{d}/m.c'], check=True, capture_output=True)
        return subprocess.run([f'{d}/m'], capture_output=True, text=True, check=True).stdout.rstrip('\n')
    if lang == 'java':
        open(f'{d}/Main.java', 'w').write(code)
        subprocess.run(['javac', 'Main.java'], cwd=d, check=True, capture_output=True, env=ENV)
        return subprocess.run(['java', 'Main'], cwd=d, capture_output=True, text=True, check=True, env=ENV).stdout.rstrip('\n')
    if lang == 'python':
        return subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, check=True).stdout.rstrip('\n')
    raise ValueError(lang)

def parse_md_table(text):
    # 처음 나오는 표 하나만 읽는다 (뒤에 이어지는 진단표 등은 정답이 아니다)
    lines = []
    for l in text.strip().splitlines():
        if l.startswith('|'):
            lines.append(l)
        elif lines:
            break
    cells = [[c.strip() for c in l.strip('|').split('|')] for l in lines]
    return cells[0], [tuple(r) for r in cells[2:]]

def written_answer(section):
    m = re.search(r'\*\*정답: `(.*?)`\*\*', section)
    if m:
        return m.group(1)
    m = re.search(r'\*\*정답:\*\*\n\n```\n(.*?)\n```', section, re.S)
    return m.group(1) if m else None

def main():
    checked, bad = 0, []
    for name in FILES:
        md = open(os.path.join(ROOT, name), encoding='utf-8').read()
        for sec in re.split(r'\n(?=### 문제 \d+[. ])', md)[1:]:
            no = re.match(r'### 문제 (\d+)', sec).group(1)
            head = sec.split('\n', 1)[0]
            # Day07 은 헤딩이 `### 문제 1 (C - 변수 스코프)` 꼴이다
            if '프로그램의 출력' in head or re.search(r'\((C|Java|Python) - ', head):
                lang, code = re.search(r'```(c|java|python)\n(.*?)\n```', sec, re.S).groups()
                got, want = run_code(lang, code), written_answer(sec)
            elif 'SQL문의 실행 결과' in head or '(SQL - ' in head:
                con = sqlite3.connect(':memory:')
                for t, tbl in re.findall(r'\*\*테이블: (\w+)\*\*\n\n((?:\|.*\n)+)', sec):
                    cols, rows = parse_md_table(tbl)
                    con.execute(f'CREATE TABLE {t} ({", ".join(cols)})')
                    con.executemany(f'INSERT INTO {t} VALUES ({",".join("?" * len(cols))})',
                                    [tuple(int(v) if v.lstrip('-').isdigit() else v for v in r) for r in rows])
                sql = re.search(r'```sql\n(.*?)\n```', sec, re.S).group(1)
                cur = con.execute(sql)
                got = ([d[0] for d in cur.description], [tuple(str(v) for v in r) for r in cur.fetchall()])
                ans = sec.split('<summary>정답 확인</summary>', 1)[1]
                want = parse_md_table(ans.split('```', 1)[0])
                want = (want[0], list(want[1]))
            else:
                continue
            checked += 1
            if got != want:
                bad.append((name, no, want, got))
    for b in bad:
        print('불일치', b)
    print(f'{checked}문항 확인, 불일치 {len(bad)}')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
