import argparse
import os
import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


def get_color(work_time, effective_time):
    # 保持和日报统计一致
    if work_time is None and effective_time is None:
        return "lightgrey"

    work_time = work_time or 0
    effective_time = effective_time or 0

    if work_time >= 8 and effective_time >= 8:
        return "green"
    if work_time >= 8 and effective_time >= 5:
        return "lightgreen"
    if work_time >= 8 and effective_time >= 3:
        return "yellow"
    if work_time >= 4 and effective_time >= 2:
        return "#ffcccc"
    return "red"


@dataclass
class ScoreRule:
    non_red_score: float = 1.0
    red_score: float = 0.5
    streak_days: int = 6
    streak_bonus: float = 1.0
    streak_mode: str = "per_block"


def resolve_db_path(cli_db_path: str | None) -> Path:
    if cli_db_path:
        return Path(cli_db_path).expanduser().resolve()

    env_db_path = os.getenv("DB_PATH")
    if env_db_path:
        env_path = Path(env_db_path)
        if env_path.exists():
            return env_path.resolve()

    project_root = Path(__file__).resolve().parent.parent
    candidates = [
        project_root / "instance" / "progress.db",
        project_root / "backend" / "instance" / "progress.db",
    ]
    for path in candidates:
        if path.exists():
            return path.resolve()

    return candidates[0].resolve()


def load_data(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT s.id, s.name, s.username, p.date, p.work_time, p.effective_time
        FROM students s
        LEFT JOIN progress p ON p.student_id = s.id
        ORDER BY s.name, p.date
        """
    )
    rows = cursor.fetchall()
    conn.close()
    return rows


def calculate_scores(rows, rule: ScoreRule):
    people = defaultdict(
        lambda: {
            "name": "",
            "username": "",
            "records": [],
        }
    )

    for row in rows:
        people[row["id"]]["name"] = row["name"]
        people[row["id"]]["username"] = row["username"]
        if row["date"] is not None:
            people[row["id"]]["records"].append(
                {
                    "date": date.fromisoformat(row["date"]),
                    "work_time": row["work_time"],
                    "effective_time": row["effective_time"],
                }
            )

    results = []
    for student_id, info in people.items():
        base_score = 0.0
        non_red_days = 0
        red_days = 0
        dates = []

        for record in info["records"]:
            dates.append(record["date"])
            color = get_color(record["work_time"], record["effective_time"])
            if color == "red":
                red_days += 1
                base_score += rule.red_score
            else:
                non_red_days += 1
                base_score += rule.non_red_score

        streak_blocks, max_streak = calculate_streak_bonus(dates, rule)
        bonus_score = streak_blocks * rule.streak_bonus

        results.append(
            {
                "student_id": student_id,
                "name": info["name"],
                "username": info["username"],
                "report_days": len(info["records"]),
                "non_red_days": non_red_days,
                "red_days": red_days,
                "base_score": base_score,
                "streak_blocks": streak_blocks,
                "bonus_score": bonus_score,
                "total_score": base_score + bonus_score,
                "max_streak": max_streak,
            }
        )

    results.sort(
        key=lambda item: (-item["total_score"], -item["base_score"], item["name"])
    )
    return results


def calculate_streak_bonus(dates, rule: ScoreRule):
    unique_dates = sorted(set(dates))
    if not unique_dates:
        return 0, 0

    streak_lengths = []
    start = unique_dates[0]
    prev = unique_dates[0]

    for current in unique_dates[1:]:
        if current == prev + timedelta(days=1):
            prev = current
            continue
        streak_lengths.append((prev - start).days + 1)
        start = current
        prev = current

    streak_lengths.append((prev - start).days + 1)
    max_streak = max(streak_lengths)

    if rule.streak_mode == "once":
        streak_blocks = sum(1 for length in streak_lengths if length >= rule.streak_days)
    else:
        streak_blocks = sum(length // rule.streak_days for length in streak_lengths)

    return streak_blocks, max_streak


def print_results(results, rule: ScoreRule, db_path: Path):
    print(f"数据库: {db_path}")
    print(
        "规则: "
        f"非红={rule.non_red_score}, "
        f"红={rule.red_score}, "
        f"连续{rule.streak_days}天奖励={rule.streak_bonus}, "
        f"模式={rule.streak_mode}"
    )
    print(
        "说明: 当前库里没有单独的上课时间字段, 默认视为已计入 work_time, 不重复加分。"
    )
    print()
    print(
        "姓名\t用户名\t总分\t基础分\t连续奖励\t非红天数\t红色天数\t最长连续\t日报天数"
    )

    for item in results:
        print(
            f"{item['name']}\t"
            f"{item['username']}\t"
            f"{item['total_score']:.1f}\t"
            f"{item['base_score']:.1f}\t"
            f"{item['streak_blocks']}\t"
            f"{item['non_red_days']}\t"
            f"{item['red_days']}\t"
            f"{item['max_streak']}\t"
            f"{item['report_days']}"
        )


def build_parser():
    parser = argparse.ArgumentParser(description="统计每个人的日报积分")
    parser.add_argument("--db", help="数据库路径, 默认自动查找 progress.db")
    parser.add_argument("--non-red-score", type=float, default=1.0, help="非红日报分值")
    parser.add_argument("--red-score", type=float, default=0.5, help="红色日报分值")
    parser.add_argument("--streak-days", type=int, default=6, help="连续天数门槛")
    parser.add_argument("--streak-bonus", type=float, default=1.0, help="连续奖励分值")
    parser.add_argument(
        "--streak-mode",
        choices=["per_block", "once"],
        default="per_block",
        help="per_block 表示每满一段连续天数就奖励一次, once 表示每段连续只奖励一次",
    )
    return parser


def main():
    args = build_parser().parse_args()
    rule = ScoreRule(
        non_red_score=args.non_red_score,
        red_score=args.red_score,
        streak_days=args.streak_days,
        streak_bonus=args.streak_bonus,
        streak_mode=args.streak_mode,
    )
    db_path = resolve_db_path(args.db)
    rows = load_data(db_path)
    results = calculate_scores(rows, rule)
    print_results(results, rule, db_path)


if __name__ == "__main__":
    main()
