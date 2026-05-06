# 前端 Dockerfile
FROM node:20

# 设置工作目录
WORKDIR /app/frontend

# 复制前端代码
COPY frontend/ ./

# 无需安装依赖，已经传入
# RUN cd frontend && npm install axios react-table react-datepicker

# 启动前端应用
CMD ["npm", "start"]
