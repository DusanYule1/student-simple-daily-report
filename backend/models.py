# backend/models.py
from datetime import date
from backend.database import db

class Student(db.Model):
    __tablename__ = 'students'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)  # 存储哈希值

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'username': self.username
        }

class Progress(db.Model):
    __tablename__ = 'progress'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('students.id'), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)  # 添加索引，优化日期范围查询
    work_time = db.Column(db.Integer, nullable=False)
    effective_time = db.Column(db.Integer, nullable=False)
    main_work = db.Column(db.Text, nullable=True)
    difficulty = db.Column(db.Text, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'date'),
        db.Index('idx_student_date', 'student_id', 'date'),  # 复合索引，优化按学生和日期的查询
    )

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'date': self.date.isoformat(),
            'work_time': self.work_time,
            'effective_time': self.effective_time,
            'main_work': self.main_work,
            'difficulty': self.difficulty
        }
