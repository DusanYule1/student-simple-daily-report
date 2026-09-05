#!/usr/bin/env python3
# 一次性导入旧系统 SQLite（progress.db）日报到 Supabase：
# - 只读打开 SQLite，按 username 映射当前库 active students
# - work_time/effective_time 拼进 today_summary 开头；自评固定 other；other_notes=difficulty
# - 跳过当前库不存在的学生（如 zjz）；幂等：导入前清空目标日期范围内既有日报
# 用法：python3 scripts/import-progress-db.py <progress.db 路径> [--dry-run]
import json
import sqlite3
import sys
from pathlib import Path

import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def load_env():
    env = {}
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env


def rest(env, path, init=None):
    url = f"{env['SUPABASE_URL']}{path}"
    req = urllib.request.Request(url, **{
        "method": (init or {}).get("method", "GET"),
        "headers": {
            "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
            **(init or {}).get("headers", {}),
        },
        "data": (init or {}).get("body"),
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.read().decode("utf-8"), res.status
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{path} → HTTP {e.code}: {e.read().decode('utf-8')}") from e


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("用法：python3 scripts/import-progress-db.py <progress.db 路径> [--dry-run]")
        sys.exit(1)
    db_path = args[0]
    if not Path(db_path).exists():
        print(f"文件不存在：{db_path}")
        sys.exit(1)

    env = load_env()
    if not env.get("SUPABASE_URL") or not env.get("SUPABASE_SERVICE_ROLE_KEY"):
        print("缺 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（.env）")
        sys.exit(1)

    sqlite_conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    old_students = {
        row[0]: (row[1], row[2])
        for row in sqlite_conn.execute("SELECT id, name, username FROM students")
    }

    body, _ = rest(env, "/rest/v1/students?select=id,name,username&status=eq.active")
    current_students = {s["username"]: s for s in json.loads(body)}

    now = datetime_utc_iso()
    rows = []
    skipped_by_user = {}
    for student_id, date, work_time, effective_time, main_work, difficulty in sqlite_conn.execute(
        "SELECT student_id, date, work_time, effective_time, main_work, difficulty "
        "FROM progress ORDER BY date, student_id"
    ):
        old_student = old_students.get(student_id)
        if not old_student:
            continue
        target = current_students.get(old_student[1])
        if not target:
            key = f"{old_student[0]}({old_student[1]})"
            skipped_by_user[key] = skipped_by_user.get(key, 0) + 1
            continue
        hours = f"学习 {work_time}h/有效 {effective_time}h"
        summary = f"{hours}\n{main_work.strip()}" if (main_work or "").strip() else hours
        rows.append({
            "student_id": target["id"],
            "report_date": date,
            "self_evaluation": "other",
            "today_summary": summary,
            "tomorrow_plan": "",
            "other_notes": (difficulty or "").strip(),
            "created_at": now,
            "updated_at": now,
        })

    total_old = sqlite_conn.execute("SELECT COUNT(*) FROM progress").fetchone()[0]
    print(f"旧库日报 {total_old} 份 → 可导入 {len(rows)} 份")
    for name, count in skipped_by_user.items():
        print(f"  跳过 {name}: {count} 份")

    for sample in (rows[0], rows[len(rows) // 2], rows[-1]):
        preview = json.dumps(sample, ensure_ascii=False)[:200]
        print(f"样例 → {preview}")
    if dry_run:
        print("（干跑结束，未写入）")
        return

    dates = [r["report_date"] for r in rows]
    min_date, max_date = min(dates), max(dates)
    rest(env, f"/rest/v1/daily_reports?report_date=gte.{min_date}&report_date=lte.{max_date}", {"method": "DELETE"})
    print(f"已清空 {min_date}~{max_date} 范围内既有日报（幂等）")

    batch = 500
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        rest(env, "/rest/v1/daily_reports", {
            "method": "POST",
            "headers": {"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"},
            "body": json.dumps(chunk).encode("utf-8"),
        })
        print(f"已插入 {min(i + batch, len(rows))}/{len(rows)}")

    # PostgREST 单请求默认最多 1000 行，分年分段统计
    imported = 0
    for year, start, end in [
        (int(min_date[:4]), min_date, f"{min_date[:4]}-12-31"),
        (int(max_date[:4]), f"{max_date[:4]}-01-01", max_date),
    ]:
        if start > end:
            continue
        seg_body, _ = rest(env, f"/rest/v1/daily_reports?select=id&report_date=gte.{start}&report_date=lte.{end}",
                           {"headers": {"Range": "0-100000", "Prefer": "count=exact"}})
        imported += len(json.loads(seg_body))
    print(f"验证：库里 {min_date}~{max_date} 共 {imported} 行（预期 {len(rows)}）"
          f"{'✓' if imported == len(rows) else '✗ 不一致!'}")
    if imported != len(rows):
        sys.exit(1)
    print("导入完成并通过校验。")


def datetime_utc_iso():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


if __name__ == "__main__":
    main()