#!/usr/bin/env python3
"""
数据库迁移脚本：为 Progress 表添加索引
运行方式：python backend/migrate_add_indexes.py
"""
import sqlite3
import os
from backend.config import Config

def migrate_add_indexes():
    """为 Progress 表添加索引以优化查询性能"""
    db_path = Config.DB_PATH
    
    if not os.path.exists(db_path):
        print(f"数据库文件不存在: {db_path}")
        print("首次运行时会自动创建索引，无需手动迁移")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 检查索引是否已存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_progress_date'")
        date_index_exists = cursor.fetchone() is not None
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_progress_student_id'")
        student_id_index_exists = cursor.fetchone() is not None
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_student_date'")
        composite_index_exists = cursor.fetchone() is not None
        
        # 添加 date 字段索引（如果不存在）
        if not date_index_exists:
            print("正在创建 date 字段索引...")
            cursor.execute("CREATE INDEX ix_progress_date ON progress(date)")
            print("✓ date 字段索引创建成功")
        else:
            print("✓ date 字段索引已存在")
        
        # 添加 student_id 字段索引（如果不存在）
        if not student_id_index_exists:
            print("正在创建 student_id 字段索引...")
            cursor.execute("CREATE INDEX ix_progress_student_id ON progress(student_id)")
            print("✓ student_id 字段索引创建成功")
        else:
            print("✓ student_id 字段索引已存在")
        
        # 添加复合索引（如果不存在）
        if not composite_index_exists:
            print("正在创建复合索引 (student_id, date)...")
            cursor.execute("CREATE INDEX idx_student_date ON progress(student_id, date)")
            print("✓ 复合索引创建成功")
        else:
            print("✓ 复合索引已存在")
        
        conn.commit()
        print("\n✅ 数据库索引迁移完成！")
        
        # 显示当前索引信息
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='progress'")
        indexes = cursor.fetchall()
        print(f"\nProgress 表的索引列表：")
        for idx in indexes:
            print(f"  - {idx[0]}")
            
    except Exception as e:
        conn.rollback()
        print(f"❌ 迁移失败: {e}")
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    migrate_add_indexes()

