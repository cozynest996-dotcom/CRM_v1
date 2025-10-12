
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.middleware.auth import get_current_user
from app.db.models import User
from app.services.google_sheets import GoogleSheetsService
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/google-sheets", tags=["Google Sheets"])

@router.get("/spreadsheets")
async def list_spreadsheets(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """列出当前用户可访问的所有 Google Spreadsheets"""
    try:
        service = GoogleSheetsService(db, current_user.id)
        spreadsheets = await service.list_spreadsheets()
        return spreadsheets
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Failed to list spreadsheets for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list Google Spreadsheets")

@router.get("/{spreadsheet_id}/tabs")
async def get_sheet_tabs(spreadsheet_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """获取指定 Google Spreadsheet 的所有工作表 (tabs)"""
    try:
        service = GoogleSheetsService(db, current_user.id)
        tabs = await service.get_sheet_tabs(spreadsheet_id)
        return tabs
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Failed to get tabs for spreadsheet {spreadsheet_id} for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get sheet tabs")

@router.get("/{spreadsheet_id}/sheet_data")
async def get_sheet_data(
    spreadsheet_id: str,
    sheet_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """从指定的 Google Spreadsheet 和工作表获取数据"""
    try:
        service = GoogleSheetsService(db, current_user.id)
        data = await service.read_sheet_data(spreadsheet_id, sheet_name)
        return data
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Failed to read sheet data from {spreadsheet_id}/{sheet_name} for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to read sheet data")

@router.post("/{spreadsheet_id}/{knowledge_type}/import")
async def import_sheet_data(
    spreadsheet_id: str,
    knowledge_type: str,
    sheet_name: str,
    column_mapping: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """从 Google Sheet 导入数据到知识库"""
    try:
        service = GoogleSheetsService(db, current_user.id)
        # Read data from Google Sheet
        sheet_data_response = await service.read_sheet_data(spreadsheet_id, sheet_name)
        sheet_data = sheet_data_response.get("data", [])

        # Map and import data based on knowledge_type
        # This logic needs to be implemented in GoogleSheetsService or a dedicated knowledge base service
        # For now, we'll just return a success message
        # TODO: Implement actual data import to database based on knowledge_type and column_mapping
        logger.info(f"Simulating import of {len(sheet_data)} rows to {knowledge_type} for user {current_user.id}")
        return {"message": f"Data import to {knowledge_type} initiated successfully."}

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Failed to import data from sheet {spreadsheet_id}/{sheet_name} to {knowledge_type} for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to import data")

@router.post("/{spreadsheet_id}/{knowledge_type}/export")
async def export_sheet_data(
    spreadsheet_id: str,
    knowledge_type: str,
    sheet_name: str,
    column_mapping: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """从知识库导出数据到 Google Sheet"""
    try:
        service = GoogleSheetsService(db, current_user.id)
        # Read data from database based on knowledge_type
        # This logic needs to be implemented in GoogleSheetsService or a dedicated knowledge base service
        # For now, we'll just return a success message
        # TODO: Implement actual data export from database based on knowledge_type and column_mapping
        logger.info(f"Simulating export of data from {knowledge_type} to sheet {spreadsheet_id}/{sheet_name} for user {current_user.id}")
        return {"message": f"Data export from {knowledge_type} initiated successfully."}

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Failed to export data from {knowledge_type} to sheet {spreadsheet_id}/{sheet_name} for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to export data")
