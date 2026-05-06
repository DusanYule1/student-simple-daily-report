# backend/app.py
from flask import Flask, request, jsonify, session
from flask_cors import CORS  # 新增：导入 CORS
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
import os

from backend.models import db, Student, Progress
from backend.database import init_db
from backend.config import Config



app = Flask(__name__)
app.config.from_object(Config)

# ✅ 必须设置 secret_key，否则 session 无法加密保存
if not app.secret_key:
    app.secret_key = Config.SECRET_KEY  # 或直接写字符串（仅测试用）

# 启用 CORS
# 当前配置为全部允许，便于本地开发、局域网调试和临时部署联调；生产环境建议按实际域名收紧。
CORS(
    app,
    origins="*",
    supports_credentials=True,
    allow_headers=["Content-Type"],
    methods=["GET", "POST", "OPTIONS"]
)

# 初始化数据库
init_db(app)

# ----------------------------
# 工具函数：获取颜色
# ----------------------------
def get_color(work_time, effective_time):
    if work_time is None:
        return "lightgrey"
    if work_time >= 8 and effective_time >= 8:
        return "green"
    elif work_time >= 8 and effective_time >= 5:
        return "lightgreen"
    elif work_time >= 8 and effective_time >= 3:
        return "yellow"
    elif work_time >= 4 and effective_time >= 2:
        return "lightred"
    else:
        return "red"

# ----------------------------
# 工具函数：3:00 切分的“今天”日期
# ----------------------------
def get_adjusted_today() -> date:
    # 使用东八区时间进行 3:00 切分
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    # 小于3点，归属前一天
    if now.hour < 3:
        return (now.date() - timedelta(days=1))
    return now.date()

# ----------------------------
# 用户登录/登出
# ----------------------------
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    student = Student.query.filter_by(username=username).first()
    if student and check_password_hash(student.password, password):
        session['student_id'] = student.id
        return jsonify({
            'success': True,
            'student': student.to_dict()
        })
    return jsonify({'success': False, 'message': '用户名或密码错误'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('student_id', None)
    return jsonify({'success': True})

@app.route('/api/session', methods=['GET'])
def get_session():
    student_id = session.get('student_id')
    if student_id:
        student = Student.query.get(student_id)
        return jsonify({'logged_in': True, 'student': student.to_dict()})
    return jsonify({'logged_in': False})

# ----------------------------
# 获取所有学生列表
# ----------------------------
@app.route('/api/students', methods=['GET'])
def get_students():
    students = Student.query.all()
    return jsonify([s.to_dict() for s in students])

# ----------------------------
# 获取所有进展数据（用于表格）- 轻量级版本，不包含main_work和difficulty
# ----------------------------
@app.route('/api/progress', methods=['GET'])
def get_progress():
    # 获取日期范围参数（可选）
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    
    # 构建查询
    query = Progress.query
    
    # 如果提供了日期范围，则过滤数据
    if start_date_str:
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            query = query.filter(Progress.date >= start_date)
        except ValueError:
            pass  # 忽略无效的日期格式
    
    if end_date_str:
        try:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            query = query.filter(Progress.date <= end_date)
        except ValueError:
            pass  # 忽略无效的日期格式
    
    # 如果没有提供日期范围，默认返回最近三周的数据
    if not start_date_str and not end_date_str:
        today = get_adjusted_today()
        # 计算三周前的日期（20天前）
        start_date = today - timedelta(days=20)  # 包含今天共21天
        query = query.filter(Progress.date >= start_date, Progress.date <= today)
    
    # 使用 with_entities 只查询需要的字段，避免加载 main_work 和 difficulty（优化查询性能）
    progresses = query.with_entities(
        Progress.student_id,
        Progress.date,
        Progress.work_time,
        Progress.effective_time
    ).all()
    
    progress_map = {}
    for p in progresses:
        key = f"{p.student_id}_{p.date.isoformat()}"
        # 只返回表格显示需要的字段，不包含main_work和difficulty（减少数据传输量）
        progress_map[key] = {
            'student_id': p.student_id,
            'date': p.date.isoformat(),
            'work_time': p.work_time,
            'effective_time': p.effective_time,
            'color': get_color(p.work_time, p.effective_time)
        }
    return jsonify(progress_map)

# ----------------------------
# 获取某学生某天的进展（用于详情）
# ----------------------------
@app.route('/api/progress/<int:student_id>/<string:date_str>', methods=['GET'])
def get_progress_by_date(student_id, date_str):
    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    progress = Progress.query.filter_by(student_id=student_id, date=target_date).first()
    if not progress:
        return jsonify({'error': 'No data'}), 404
    return jsonify({
        **progress.to_dict(),
        'color': get_color(progress.work_time, progress.effective_time)
    })

# ----------------------------
# 提交当天进展（仅限当天，且仅限本人）
# ----------------------------
@app.route('/api/progress', methods=['POST'])
def submit_progress():
    if 'student_id' not in session:
        return jsonify({'error': '未登录'}), 401

    data = request.get_json()
    student_id = session['student_id']

    work_time = data.get('work_time', 0)
    effective_time = data.get('effective_time', 0)
    main_work = data.get('main_work', '')
    difficulty = data.get('difficulty', '')

    # 参数校验
    if not isinstance(work_time, (int, float)) or not isinstance(effective_time, (int, float)):
        return jsonify({'error': '时间必须是数字'}), 400
    if not (0 <= work_time <= 24 and 0 <= effective_time <= 24):
        return jsonify({'error': '时间必须在0-24之间'}), 400

    # 使用 3:00 切分后的“今天”
    today = get_adjusted_today()

    # ✅ 检查是否已存在
    existing = Progress.query.filter_by(student_id=student_id, date=today).first()

    if existing:
        # ✅ 存在：更新
        existing.work_time = work_time
        existing.effective_time = effective_time
        existing.main_work = main_work
        existing.difficulty = difficulty
        message = "更新成功"
        status_code = 200
    else:
        # ✅ 不存在：创建
        new_progress = Progress(
            student_id=student_id,
            date=today,
            work_time=work_time,
            effective_time=effective_time,
            main_work=main_work,
            difficulty=difficulty
        )
        db.session.add(new_progress)
        message = "提交成功"
        status_code = 201

    try:
        db.session.commit()

        # 返回统一格式
        progress_data = {
            'student_id': student_id,
            'date': today.isoformat(),
            'work_time': work_time,
            'effective_time': effective_time,
            'main_work': main_work,
            'difficulty': difficulty,
            'color': get_color(work_time, effective_time)
        }

        return jsonify({
            'success': True,
            'message': message,
            'progress': progress_data
        }), status_code

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': '数据库错误: ' + str(e)}), 500
"""
def submit_progress():
    if 'student_id' not in session:
        return jsonify({'error': '未登录'}), 401

    data = request.get_json()
    student_id = session['student_id']

    work_time = data.get('work_time', 0)
    effective_time = data.get('effective_time', 0)
    main_work = data.get('main_work', '')
    difficulty = data.get('difficulty', '')

    if not (0 <= work_time <= 24 and 0 <= effective_time <= 24):
        return jsonify({'error': '时间必须在0-24之间'}), 400

    today = date.today()

    # 检查是否已存在
    existing = Progress.query.filter_by(student_id=student_id, date=today).first()
    if existing:
        return jsonify({'error': '今日记录已存在，不可重复提交'}), 400

    new_progress = Progress(
        student_id=student_id,
        date=today,
        work_time=work_time,
        effective_time=effective_time,
        main_work=main_work,
        difficulty=difficulty
    )
    db.session.add(new_progress)
    db.session.commit()

    return jsonify({
        'success': True,
        'progress': {**new_progress.to_dict(), 'color': get_color(work_time, effective_time)}
    }), 201
"""
# ----------------------------
# 初始化测试数据（仅首次运行）
# ----------------------------
@app.cli.command("init-db")
def init_db_command():
    """初始化数据库并添加测试学生"""
    db.drop_all()
    db.create_all()

    # 添加测试学生（密码均为 123456）
    students = [
        Student(name="张三", username="zhangsan", password=generate_password_hash("123456")),
        Student(name="李四", username="lisi", password=generate_password_hash("123456")),
        Student(name="王五", username="wangwu", password=generate_password_hash("123456")),
    ]
    db.session.add_all(students)
    db.session.commit()
    print("数据库初始化完成！")

if __name__ == '__main__':
    app.run(port=5000, debug=True)
