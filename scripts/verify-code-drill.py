#!/usr/bin/env python3
"""코드 트레이싱 드릴 md 의 C · Java · Python · SQL 문제를 실제로 실행해 적힌 정답과 맞는지 확인한다.

    python3 scripts/verify-code-drill.py

필요: gcc, javac/java, python3 (SQL 은 내장 sqlite3). 문제를 고치거나 새로 넣은 뒤 돌린다.
md 를 그대로 읽으므로 별도의 정답 사본이 없다 — 문서와 검증이 어긋날 수 없다.
S-05 는 정답 DDL 이 실행되는지, S-08(GRANT/REVOKE)은 sqlite 가 지원하지 않아 건너뛴다.
"""
import os, re, sqlite3, subprocess, sys, tempfile

PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', '정처기_코드트레이싱_드릴.md')
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
    lines = [l for l in text.strip().splitlines() if l.startswith('|')]
    cells = [[c.strip() for c in l.strip('|').split('|')] for l in lines]
    return cells[0], [tuple(r) for r in cells[2:]]

def value(v):
    if v == 'NULL':
        return None
    return int(v) if v.lstrip('-').isdigit() else v

def main():
    md = open(PATH, encoding='utf-8').read()
    md = md[:md.index('## Part 5.')]
    checked, bad = 0, []
    for sec in re.split(r'\n(?=### [CJPS]-\d{2}\.)', md)[1:]:
        pid = re.match(r'### ([CJPS]-\d{2})\.', sec).group(1)
        question, answer = sec.split('<details>', 1)
        if pid[0] in 'CJP':
            lang, code = re.search(r'```(c|java|python)\n(.*?)\n```', question, re.S).groups()
            want = re.search(r'\n출력:[ \t]*\n?(.*?)\n```', answer, re.S).group(1)
            got = run_code(lang, code)
        elif '```sql' in question:
            con = sqlite3.connect(':memory:')
            for t, tbl in re.findall(r'테이블: (\w+)\(.*?\)\n((?:\|.*\n)+)', question):
                cols, rows = parse_md_table(tbl)
                con.execute(f'CREATE TABLE {t} ({", ".join(cols)})')
                con.executemany(f'INSERT INTO {t} VALUES ({",".join("?" * len(cols))})',
                                [tuple(value(v) for v in r) for r in rows])
            sql = re.search(r'```sql\n(.*?)\n```', question, re.S).group(1)
            stmts = [s for s in (x.strip() for x in sql.split(';')) if s]
            for s in stmts[:-1]:
                con.execute(s)
            cur = con.execute(stmts[-1])
            got = ([d[0] for d in cur.description],
                   [tuple('NULL' if v is None else str(v) for v in r) for r in cur.fetchall()])
            cols, rows = parse_md_table(answer.split('결과:', 1)[1].split('```', 1)[0])
            want = (cols, list(rows))
        elif 'CREATE TABLE' in answer:
            con = sqlite3.connect(':memory:')
            con.execute('CREATE TABLE 출판사 (출판사번호 INT PRIMARY KEY)')
            con.executescript(re.search(r'```sql\n(.*?)\n```', answer, re.S).group(1))
            got = want = 'DDL 실행됨'
        else:
            continue
        checked += 1
        if got != want:
            bad.append((pid, want, got))
    for b in bad:
        print('불일치', b)
    print(f'{checked}문제 확인, 불일치 {len(bad)}')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
