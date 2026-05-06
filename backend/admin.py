from flask import Flask, request, redirect, url_for, render_template_string
from werkzeug.security import generate_password_hash

from backend.config import Config
from backend.database import db
from backend.models import Student, Progress


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    if not app.secret_key:
        app.secret_key = Config.SECRET_KEY
    db.init_app(app)

    TEMPLATE = """
    <!doctype html>
    <html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>用户管理</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; margin: 24px; }
            h1 { margin-bottom: 16px; }
            section { margin-bottom: 24px; }
            form { margin: 0; }
            input { padding: 6px 8px; margin-right: 8px; }
            button { padding: 6px 10px; cursor: pointer; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; }
            th { background: #f5f5f5; text-align: left; }
            .row-actions form { display: inline; margin-right: 8px; }
            .msg { padding: 8px 10px; background: #eef6ff; border: 1px solid #cde3ff; color: #1e6bd6; margin-bottom: 12px; border-radius: 4px; }
            .error { background: #fff2f2; border-color: #ffd6d6; color: #d93025; }
        </style>
    </head>
    <body>
        <h1>用户管理</h1>

        {% if message %}
        <div class="msg {{ 'error' if error else '' }}">{{ message }}</div>
        {% endif %}

        <section>
            <h2>添加用户</h2>
            <form method="post" action="{{ url_for('add_user') }}">
                <input name="username" placeholder="用户名(唯一)" required />
                <input name="name" placeholder="姓名" required />
                <input type="password" name="password" placeholder="初始密码" required />
                <button type="submit">添加</button>
            </form>
        </section>

        <section>
            <h2>用户列表 ({{ users|length }})</h2>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>姓名</th>
                        <th>用户名</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                {% for u in users %}
                    <tr>
                        <td>{{ u.id }}</td>
                        <td>{{ u.name }}</td>
                        <td>{{ u.username }}</td>
                        <td class="row-actions">
                            <form method="post" action="{{ url_for('delete_user', user_id=u.id) }}" onsubmit="return confirm('确认删除用户 {{ u.username }} ? 此操作不可恢复') && confirm('再次确认删除 {{ u.username }} ?');">
                                <button type="submit">删除</button>
                            </form>
                            <form method="post" action="{{ url_for('change_password', user_id=u.id) }}">
                                <input type="password" name="password" placeholder="新密码" required />
                                <button type="submit">改密</button>
                            </form>
                        </td>
                    </tr>
                {% endfor %}
                </tbody>
            </table>
        </section>
    </body>
    </html>
    """

    @app.route("/admin", methods=["GET"])
    def admin_index():
        message = request.args.get("msg")
        error = request.args.get("err") == "1"
        users = Student.query.order_by(Student.id.asc()).all()
        return render_template_string(TEMPLATE, users=users, message=message, error=error)

    @app.route("/admin/add", methods=["POST"])
    def add_user():
        username = (request.form.get("username") or "").strip()
        name = (request.form.get("name") or "").strip()
        password = (request.form.get("password") or "").strip()

        if not username or not name or not password:
            return redirect(url_for("admin_index", msg="字段不能为空", err=1))

        existing = Student.query.filter_by(username=username).first()
        if existing:
            return redirect(url_for("admin_index", msg="用户名已存在", err=1))

        student = Student(name=name, username=username, password=generate_password_hash(password))
        db.session.add(student)
        db.session.commit()
        return redirect(url_for("admin_index", msg=f"已添加用户 {username}"))

    @app.route("/admin/delete/<int:user_id>", methods=["POST"])
    def delete_user(user_id: int):
        user = Student.query.get(user_id)
        if not user:
            return redirect(url_for("admin_index", msg="用户不存在", err=1))

        # 先删除该用户的进展数据以避免外键约束问题
        Progress.query.filter_by(student_id=user_id).delete()
        db.session.delete(user)
        db.session.commit()
        return redirect(url_for("admin_index", msg=f"已删除用户 {user.username}"))

    @app.route("/admin/passwd/<int:user_id>", methods=["POST"])
    def change_password(user_id: int):
        user = Student.query.get(user_id)
        if not user:
            return redirect(url_for("admin_index", msg="用户不存在", err=1))

        new_password = (request.form.get("password") or "").strip()
        if not new_password:
            return redirect(url_for("admin_index", msg="新密码不能为空", err=1))

        user.password = generate_password_hash(new_password)
        db.session.commit()
        return redirect(url_for("admin_index", msg=f"已更新密码: {user.username}"))

    return app


app = create_app()


if __name__ == "__main__":
    app.run(port=5001, debug=True)


