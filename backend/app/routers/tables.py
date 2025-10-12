from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.db import models
from app.schemas.tables import TableOut, TableBase, RecordBase, RecordOut

router = APIRouter(prefix="/tables", tags=["tables"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ====================
# 创建新表格定义
# ====================
@router.post("/create", response_model=TableOut)
def create_table(payload: TableBase, db: Session = Depends(get_db)):
    table = models.Table(
        name=payload.name,
        description=payload.description,
        fields=payload.fields
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return table

# ====================
# 获取所有表格定义
# ====================
@router.get("/", response_model=list[TableOut])
def list_tables(db: Session = Depends(get_db)):
    return db.query(models.Table).all()

# ====================
# 插入一条数据
# ====================
@router.post("/record/add", response_model=RecordOut)
def add_record(payload: RecordBase, db: Session = Depends(get_db)):
    table = db.query(models.Table).filter(models.Table.id == payload.table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    record = models.Record(table_id=payload.table_id, data=payload.data)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

# ====================
# 获取某表格的数据
# ====================
@router.get("/record/list/{table_id}", response_model=list[RecordOut])
def list_records(table_id: int, db: Session = Depends(get_db)):
    return db.query(models.Record).filter(models.Record.table_id == table_id).all()
