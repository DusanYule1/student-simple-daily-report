# 后端 Dockerfile
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 安装依赖
RUN apt-get update \
    && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir flask flask-sqlalchemy flask-cors

# 复制后端代码
COPY backend/ ./backend/
RUN chmod +x backend/cron_entry.sh



# 初始化数据库（仅第一次运行）
# RUN cd backend && flask init-db

# 设置环境变量
ENV FLASK_APP=backend/app.py

# 暴露端口
EXPOSE 5000

# 启动 Flask 应用
CMD ["flask", "run", "--host=0.0.0.0"]
