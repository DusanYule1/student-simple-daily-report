import os
import time
from datetime import datetime, timedelta

from backend.smtp import send_daily_report


def parse_target_time(env_time: str) -> tuple[int, int]:
    try:
        parts = env_time.strip().split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
        return hour, minute
    except Exception:
        return 0, 10  # 默认为 00:10


def seconds_until_next_target(hour: int, minute: int) -> float:
    now = datetime.now()
    today_target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now < today_target:
        target = today_target
    else:
        target = today_target + timedelta(days=1)
    return (target - now).total_seconds()


def main():
    report_time_str = os.getenv("REPORT_TIME", "00:10")
    hour, minute = parse_target_time(report_time_str)
    # 首次启动先等待到目标时间
    while True:
        sleep_seconds = max(1.0, seconds_until_next_target(hour, minute))
        time.sleep(sleep_seconds)
        try:
            send_daily_report()
        except Exception as exc:
            print(f"❌ 发送日报失败: {exc}")
        # 发送后再次等待到下一天的目标时间
        # 简化为睡眠 24 小时，避免时钟漂移可再次计算下一目标
        # 这里选择再次计算以更准确
        continue


if __name__ == "__main__":
    main()


