#!/bin/sh
set -eu

# 环境变量（默认 06:00 发送, 东八区）
REPORT_TIME="${REPORT_TIME:-06:00}"
TIMEZONE="${TIMEZONE:-Asia/Shanghai}"

# 验证时间格式（HH:MM）
if ! echo "$REPORT_TIME" | grep -Eq '^[0-2][0-9]:[0-5][0-9]$'; then
  echo "Invalid REPORT_TIME: $REPORT_TIME, fallback to 00:10"
  REPORT_TIME="00:10"
fi

# 将目标时区时间转换为 UTC 时间（用于 crontab）
# crontab 的时间通常按照系统时区（UTC）解析，所以需要转换
# 如果目标时区是 Asia/Shanghai (UTC+8)，06:00 CST = 22:00 UTC (前一天)
convert_to_utc_time() {
  local target_tz="$1"
  local target_hour="$2"
  local target_min="$3"
  
  # 使用 Python 进行时区转换
  python3 <<EOF
from datetime import datetime
from zoneinfo import ZoneInfo

target_tz = "$target_tz"
target_hour = int("$target_hour")
target_min = int("$target_min")

# 创建目标时区的今天指定时间
now_cst = datetime.now(ZoneInfo(target_tz))
target_dt_cst = now_cst.replace(hour=target_hour, minute=target_min, second=0, microsecond=0)

# 转换为 UTC
target_dt_utc = target_dt_cst.astimezone(ZoneInfo("UTC"))
print(f"{target_dt_utc.hour:02d}:{target_dt_utc.minute:02d}")
EOF
}

# 转换时间（转换为 UTC）
UTC_TIME=$(convert_to_utc_time "$TIMEZONE" "$(echo "$REPORT_TIME" | cut -d: -f1)" "$(echo "$REPORT_TIME" | cut -d: -f2)")
CRON_HOUR="$(echo "$UTC_TIME" | cut -d: -f1)"
CRON_MIN="$(echo "$UTC_TIME" | cut -d: -f2)"

echo "Target time: $REPORT_TIME ($TIMEZONE) -> UTC time: $CRON_HOUR:$CRON_MIN (will execute at Asia/Shanghai $REPORT_TIME)"

# 生成 crontab，并注入容器环境变量；显式指定时区为东八区
CRON_LINE="$CRON_MIN $CRON_HOUR * * * cd /app && TZ=$TIMEZONE /usr/local/bin/python -u -m backend.smtp >> /var/log/cron.log 2>&1"

# 写入临时 crontab 文件，先写必要的环境变量
CRON_TMP="$(mktemp)"
# 显式设置 SHELL 和 PATH，避免 cron 环境过于精简
printf "SHELL=/bin/sh\n" >> "$CRON_TMP"
printf "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n" >> "$CRON_TMP"

# 需要传递给任务的应用环境变量
for VAR in DB_PATH SMTP_SERVER SMTP_PORT EMAIL_ADDRESS EMAIL_PASSWORD; do
  if printenv "$VAR" >/dev/null 2>&1; then
    VALUE="$(printenv "$VAR")"
    # 按 cron 的环境行语法 name=value 原样写入（不做 shell 展开）
    printf "%s=%s\n" "$VAR" "$VALUE" >> "$CRON_TMP"
  fi
done
printf "TZ=%s\n" "$TIMEZONE" >> "$CRON_TMP"

# 最后一行写入定时任务
printf "%s\n" "$CRON_LINE" >> "$CRON_TMP"

echo "Installing crontab for daily report at UTC $CRON_HOUR:$CRON_MIN (Asia/Shanghai $REPORT_TIME)"
crontab "$CRON_TMP"
rm -f "$CRON_TMP"

# 启动 cron 并前台输出日志
touch /var/log/cron.log

# 兼容 Debian/Alpine 的守护进程名称
if command -v cron >/dev/null 2>&1; then
  cron
elif command -v crond >/dev/null 2>&1; then
  crond
else
  echo "No cron daemon found"
  exit 1
fi

tail -n+1 -F /var/log/cron.log


