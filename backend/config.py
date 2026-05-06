# backend/config.py
import os

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or "hard-to-guess-secret-key"
    # 允许通过环境变量覆盖数据库文件路径，默认放在 instance 目录下
    DB_PATH = os.environ.get("DB_PATH") or "instance/progress.db"
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{DB_PATH}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # 邮件配置（请替换为你的邮箱设置）
    SMTP_SERVER = os.environ.get("SMTP_SERVER") or "smtp.exmail.qq.com"       
    SMTP_PORT = os.environ.get("SMTP_PORT") or 465
    EMAIL_ADDRESS = os.environ.get("EMAIL_ADDRESS")
    EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD")

    # 收件人 CSV 文件路径（容器内路径），例如：/app/instance/recipients.csv
    RECIPIENTS_CSV = os.environ.get("RECIPIENTS_CSV") or "instance/recipients.csv"

