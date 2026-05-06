# daily_report.py
import sqlite3
import smtplib
import ssl
import csv
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from backend.config import Config
# ================== 配置区 ==================


# 从 CSV 文件加载收件人邮箱地址
def load_recipients_from_csv(file_path):
    recipients = []
    try:
        with open(file_path, newline='', encoding='utf-8') as f:
            # 判定是否包含表头，并优先识别名为 email 的列
            sample = f.read(1024)
            f.seek(0)
            first_line = sample.splitlines()[0].lower() if sample else ""
            if "email" in first_line:
                reader = csv.DictReader(f)
                for row in reader:
                    addr = (row.get('email') or '').strip()
                    if addr:
                        recipients.append(addr)
            else:
                reader = csv.reader(f)
                for row in reader:
                    if not row:
                        continue
                    addr = (row[0] or '').strip()
                    if addr:
                        recipients.append(addr)
    except FileNotFoundError:
        print(f"❌ 未找到收件人 CSV 文件: {file_path}")
    except Exception as e:
        print(f"❌ 读取收件人 CSV 失败: {e}")

    # 去重，保持顺序
    unique_recipients = []
    seen = set()
    for addr in recipients:
        if addr not in seen:
            unique_recipients.append(addr)
            seen.add(addr)
    return unique_recipients

def get_color(work_time, effective_time):
    # 将 None 视为 0，避免比较时报错
    if work_time is None and effective_time is None:
        return "lightgrey"
    work_time = work_time or 0
    effective_time = effective_time or 0
    if work_time >= 8 and effective_time >= 8:
        return "green"
    elif work_time >= 8 and effective_time >= 5:
        return "lightgreen"
    elif work_time >= 8 and effective_time >= 3:
        return "yellow"
    elif work_time >= 4 and effective_time >= 2:
        return "#ffcccc"
    else:
        return "red"

def send_daily_report():
    # 以 3:00 为切分，计算“上一天”的归属日期
    # 以东八区时间进行计算
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    adjusted_today = (now.date() - timedelta(days=1)) if now.hour < 3 else now.date()
    target_date = (adjusted_today - timedelta(days=1))  # 上一个完整窗口
    target_str = target_date.isoformat()
    print(target_str)
    
    # 读取收件人
    recipients = load_recipients_from_csv(Config.RECIPIENTS_CSV)
    if not recipients:
        print("⚠️ 未配置任何收件人，跳过发送。")
        return
    # 连接数据库
    conn = sqlite3.connect(Config.DB_PATH)
    conn.row_factory = sqlite3.Row  # 便于按列名访问
    cursor = conn.cursor()

    # 查询昨天所有进度记录（包含学生姓名和用户名）
    query = """
    SELECT 
        s.name, s.username,
        p.work_time, p.effective_time,
        p.main_work, p.difficulty
    FROM progress p
    JOIN students s ON p.student_id = s.id
    WHERE p.date = ?
    ORDER BY s.name
    """
    print(query)
    cursor.execute(query, (target_str,))
    records = cursor.fetchall()
    conn.close()
    print(records)
    # 统计颜色
    color_count = {
        "green": 0,
        "lightgreen": 0,
        "yellow": 0,
        "#ffcccc": 0,
        "red": 0,
        "lightgrey": 0
    }
    # 构建 HTML 邮件正文
    body = f"""
    <h2>📅 {target_str} 学习进度日报</h2>
    <p>今天有 {len(records)} 人提交了进度。</p>
    <a href="https://dxy.kldrgon.com">详情可以查看 dxy.kldrgon.com 的进展看板。</a>
    """

    if not records:
        body += "<p>⚠️ 昨天没有学生提交进度。</p>"
    else:
        # 统计颜色
        for row in records:
            color = get_color(row['work_time'], row['effective_time'])
            color_count[color] += 1
        print(color_count)
        # 颜色统计
        body += "<h3>📊 颜色分布</h3><ul>"
        for color, count in color_count.items():
            if count > 0:
                body += f"<li><span style='color:{color}; font-weight:bold;'>{color}</span>: {count} 人</li>"
        body += "</ul>"

        # 详细信息
        body += "<h3>👥 详细情况</h3><ul>"
        for row in records:
            color = get_color(row['work_time'], row['effective_time'])
            work_time_val = row['work_time'] if row['work_time'] is not None else 0
            effective_time_val = row['effective_time'] if row['effective_time'] is not None else 0
            raw_main = row['main_work'] or ''
            separator = '\n------\n'
            if separator in raw_main:
                idx = raw_main.index(separator)
                main_work_val = raw_main[:idx] or '无'
                tomorrow_plan_val = raw_main[idx + len(separator):] or '无'
            else:
                main_work_val = raw_main or '无'
                tomorrow_plan_val = '无'
            difficulty_val = row['difficulty'] or '无'
            body += f"""
            <li style='background-color:{color};'>
                <strong>{row['name']} ({row['username']})</strong><br>
                工作时长: {effective_time_val} ／ {work_time_val} 小时<br>
                主要工作: {main_work_val}<br>
                明日计划: {tomorrow_plan_val}<br>
                遇到的困难: {difficulty_val}<br>
            </li><br>
            """
        body += "</ul>"

    body += "<p><em>—— 自动化日报系统</em></p>"

    # 发送邮件
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"📊 {target_str} 学习进度报告"
    msg["From"] = Config.EMAIL_ADDRESS
    msg["To"] = ", ".join(recipients)
    
    part = MIMEText(body, "html", "utf-8")
    msg.attach(part)

    try:
        smtp_host = Config.SMTP_SERVER
        smtp_port = int(Config.SMTP_PORT)
        tls_context = ssl.create_default_context()

        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=tls_context) as server:
                server.login(Config.EMAIL_ADDRESS, Config.EMAIL_PASSWORD)
                server.sendmail(Config.EMAIL_ADDRESS, recipients, msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
                server.ehlo()
                server.starttls(context=tls_context)
                server.ehlo()
                server.login(Config.EMAIL_ADDRESS, Config.EMAIL_PASSWORD)
                server.sendmail(Config.EMAIL_ADDRESS, recipients, msg.as_string())
        print(f"✅ 成功发送 {target_str} 的日报邮件。")
    except Exception as e:
        print(f"❌ 邮件发送失败: {e}")

if __name__ == "__main__":
    # RECIPIENT_EMAILS=["duxy@njust.edu.cn","kldrgon@qq.com"]
    send_daily_report()