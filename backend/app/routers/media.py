from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.db import models
from app.schemas.media import MediaFileResponse, MediaFileCreate, MediaListResponse, FolderCreate, FolderRename, MediaFileRename  # 需要创建这个 Pydantic schema
from app.services import supabase as supabase_service
from app.core.config import settings # Import settings
from app.core.security import get_current_user
import uuid
import mimetypes
import os # 导入 os 模块用于处理文件扩展名

router = APIRouter()

@router.post("/media/upload", response_model=MediaFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    folder: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    上传媒体文件到 Supabase Storage 并记录到数据库。
    """
    # 1. 验证文件类型
    content_type = file.content_type
    if not content_type or not (
        content_type.startswith(("image/", "video/")) or
        content_type == "application/pdf" or
        content_type == "application/msword" or # .doc
        content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or # .docx
        content_type == "application/vnd.ms-excel" or # .xls
        content_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" or # .xlsx
        content_type == "text/plain" # .txt
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")

    # 2. 生成唯一的 filename 和 filepath
    original_filename = file.filename
    file_extension = mimetypes.guess_extension(content_type) or ".bin"
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    
    try:
        # 3. 读取文件内容
        file_content = await file.read()
        file_size = len(file_content)

        # 4. 上传到 Supabase Storage
        # supabase_service.upload_file_to_storage 已经处理了路径拼接
        supabase_full_path = await supabase_service.upload_file_to_storage(
            user_id=str(current_user.id),
            folder=folder,
            file_name=unique_filename,
            file_content=file_content,
            content_type=content_type
        )

        # 5. 生成签名 URL (用于私有 bucket)
        # 注意：这里我们使用 supabase_full_path 来生成签名 URL
        file_url = await supabase_service.get_signed_url_for_file(supabase_full_path)
        if not file_url:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate signed URL")

        # 6. 保存文件元数据到数据库
        db_media_file = models.MediaFile(
            user_id=current_user.id,
            filename=original_filename,
            filepath=supabase_full_path, # 保存完整的 Supabase 存储路径
            file_url=file_url,
            file_type=content_type,
            folder=folder,
            size=file_size
        )
        db.add(db_media_file)
        db.commit()
        db.refresh(db_media_file)

        return db_media_file
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to upload media: {e}")

@router.get("/media", response_model=MediaListResponse) # 修改返回模型
async def list_media(
    folder: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    列出当前用户上传的媒体文件，可按文件夹过滤。
    """

    # 1. 从 Supabase Storage 获取所有实际存在的文件
    supabase_files = await supabase_service.list_all_user_files_from_storage(str(current_user.id))
    # print(f"DEBUG: Supabase files retrieved: {[s['full_path'] for s in supabase_files]}") # 移除调试日志

    # 2. 从数据库获取所有媒体文件记录
    db_media_records = db.query(models.MediaFile).filter(models.MediaFile.user_id == current_user.id).all()
    db_file_paths = {f.filepath: f for f in db_media_records}

    # 3. 同步：在数据库中创建 Supabase 中存在但数据库中没有的文件记录
    for s_file in supabase_files:
        full_path_in_storage = f"{settings.SUPABASE_BUCKET}/{s_file['full_path']}"
        if full_path_in_storage not in db_file_paths:
            # 尝试从 full_path 中解析 folder
            relative_path_segments = s_file['full_path'].split('/')
            file_user_id = relative_path_segments[0] # 理论上应该是 current_user.id
            file_name_only = relative_path_segments[-1]
            file_folder = None
            if len(relative_path_segments) > 2: # user_id/folder/filename
                file_folder = relative_path_segments[1]
            
            # 生成签名 URL
            file_url = await supabase_service.get_signed_url_for_file(s_file['full_path'])

            new_db_media_file = models.MediaFile(
                user_id=current_user.id,
                filename=file_name_only,
                filepath=full_path_in_storage,
                file_url=file_url,
                file_type=s_file.get("content_type", "application/octet-stream"),
                folder=file_folder,
                size=s_file.get("size", 0) # 使用从 Supabase 获取到的实际文件大小
            )
            db.add(new_db_media_file)
            db.commit()
            db.refresh(new_db_media_file)
            db_media_records.append(new_db_media_file) # 将新创建的记录添加到当前会话的媒体记录中

    # 重新加载 media_files，以包含新添加的或更新的记录
    # 这段逻辑也可以直接使用 db_media_records 并进行过滤
    # 为了简化，我们直接从 db_media_records 中过滤并继续
    all_media_files_for_filtering = db_media_records

    query = [f for f in all_media_files_for_filtering if f.user_id == current_user.id]
    if folder:
        query = [f for f in query if f.folder == folder]
    else:
        # 如果是 "所有媒体" 视图 (folder is None)，只显示根目录下的文件 (folder is None)
        query = [f for f in query if f.folder is None]

    # print(f"DEBUG: Filtered query before final assignment: {[f.filename for f in query]}") # 移除调试日志
    media_files = query

    # 过滤掉 .keep 文件
    media_files = [f for f in media_files if f.filename != ".keep"]

    # 调试：打印每个 media_file 的 filename 和 folder
    for f in media_files:
        pass # 移除调试打印

    # 刷新签名 URL
    for media_file in media_files:
        # 从完整的 filepath 中移除 bucket 名称，因为 get_signed_url_for_file 期望相对路径
        relative_filepath = media_file.filepath.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)
        media_file.file_url = await supabase_service.get_signed_url_for_file(relative_filepath)

    # 将 SQLAlchemy 对象转换为 Pydantic 对象列表，并映射 media_type
    def get_media_type(file_type: str) -> str:
        """将 file_type 转换为简化的 media_type"""
        if not file_type:
            return "unknown"
        if file_type.startswith("image/"):
            return "image"
        elif file_type.startswith("video/"):
            return "video"
        elif file_type.startswith("audio/"):
            return "audio"
        elif file_type in ["application/pdf", "application/msword", 
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                          "application/vnd.ms-excel",
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          "text/plain"]:
            return "document"
        else:
            return "document"
    
    media_response = []
    for file in media_files:
        file_dict = {
            "id": file.id,
            "user_id": file.user_id,
            "filename": file.filename,
            "filepath": file.filepath,
            "file_url": file.file_url,
            "file_type": file.file_type,
            "folder": file.folder,
            "size": file.size,
            "created_at": file.created_at,
            "updated_at": file.updated_at,
            "media_type": get_media_type(file.file_type)
        }
        media_response.append(MediaFileResponse(**file_dict))

    # 1. 从 Supabase Storage 获取所有实际存在的文件夹
    folders_from_storage = await supabase_service.list_user_folders_from_storage(str(current_user.id))

    # 2. 从数据库获取所有媒体文件，计算文件夹中的文件数量
    # 这里我们需要重新查询，因为前面的 db_media_records 可能不包含新添加的文件
    all_user_media_db_for_counts = db.query(models.MediaFile).filter(models.MediaFile.user_id == current_user.id).all()

    folder_counts = {}
    for medi_item in all_user_media_db_for_counts:
        # 排除 .keep 文件在文件夹计数中
        if medi_item.filename == ".keep":
            continue
        folder_name = medi_item.folder if medi_item.folder else '未分类'
        folder_counts[folder_name] = folder_counts.get(folder_name, 0) + 1
    
    # 定义保留的文件夹名称，这些不应该出现在文件夹列表中
    reserved_folder_names = {'action-create-folder', 'create-folder'}
    
    # 3. 合并 Supabase Storage 中的文件夹和数据库中的文件夹计数
    # 构建一个包含所有活跃文件夹名称的集合，优先从数据库中获取最新状态
    all_active_folders = set()
    # 从数据库中的媒体文件获取文件夹名称
    for medi_item in all_user_media_db_for_counts:
        # NOTE: 不再排除 `.keep`，因为我们需要基于数据库判断空文件夹也应显示
        folder_name = medi_item.folder if medi_item.folder else '未分类'
        if folder_name not in reserved_folder_names:
            all_active_folders.add(folder_name)
    
    # 此外，也将 Supabase Storage 返回的文件夹（可能是空文件夹，或者没有媒体文件的文件夹）加入考虑
    # 但要确保过滤掉保留名称
    for folder_name in folders_from_storage:
        if folder_name not in reserved_folder_names:
            all_active_folders.add(folder_name)

    # 特殊处理 '未分类' 文件夹，确保它总是被包含（如果存在任何未分类文件）
    if '未分类' in folder_counts:
        all_active_folders.add('未分类')

    folders_response = []
    for name in sorted(list(all_active_folders)): # 排序以便前端显示一致
        count = folder_counts.get(name, 0) # 使用之前计算的文件夹计数
        folders_response.append({"name": name, "media_count": count})

    # print(f"DEBUG: Final media_response being sent: {media_files}")
    # print(f"DEBUG: Final folders_response being sent: {folders_response}")
    return {"media": media_response, "folders": folders_response}

@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    删除媒体文件及其数据库记录。
    """
    db_media_file = db.query(models.MediaFile).filter(
        models.MediaFile.id == media_id,
        models.MediaFile.user_id == current_user.id
    ).first()

    if not db_media_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found or not owned by user")

    try:
        # 从 Supabase Storage 删除文件
        # 从完整的 filepath 中移除 bucket 名称，因为 delete_file_from_storage 期望相对路径
        relative_filepath_for_delete = db_media_file.filepath.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)
        await supabase_service.delete_file_from_storage(
            user_id=str(current_user.id),
            file_path_in_storage=relative_filepath_for_delete
        )
        
        # 从数据库删除记录
        db.delete(db_media_file)
        db.commit()
        return {"detail": "Media file deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete media: {e}")

@router.post("/media/create-folder", status_code=status.HTTP_201_CREATED)
async def create_folder(
    folder: FolderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    在 Supabase Storage 中为当前用户创建一个新的文件夹（通过上传一个占位文件来模拟）。
    """
    folder_name = folder.folder_name.strip()

    if not folder_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder name cannot be empty.")

    # 检查文件夹是否已经存在 (通过检查是否存在该文件夹下的任何文件)
    existing_medi_in_folder = db.query(models.MediaFile).filter(
        models.MediaFile.user_id == current_user.id,
        models.MediaFile.folder == folder_name
    ).first()

    if existing_medi_in_folder:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Folder already exists.")

    try:
        # 上传一个零字节的占位文件来模拟文件夹创建
        placeholder_filename = ".keep"
        file_content = b""  # 零字节内容
        content_type = "application/octet-stream"

        supabase_full_path = await supabase_service.upload_file_to_storage(
            user_id=str(current_user.id),
            folder=folder_name,
            file_name=placeholder_filename,
            file_content=file_content,
            content_type=content_type
        )

        # 记录占位文件到数据库（可选，但有助于跟踪空文件夹）
        db_media_file = models.MediaFile(
            user_id=current_user.id,
            filename=placeholder_filename,
            filepath=supabase_full_path,
            file_url=None, # 占位文件通常不需要URL
            file_type=content_type,
            folder=folder_name,
            size=0
        )
        db.add(db_media_file)
        db.commit()
        db.refresh(db_media_file)

        return {"detail": f"Folder '{folder_name}' created successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create folder: {e}")

@router.delete("/media/folder/{folder_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_name: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    删除指定文件夹及其所有内容。
    """
    if not folder_name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Folder name cannot be empty.")
    
    try:
        # 1. 从 Supabase Storage 删除所有文件
        await supabase_service.delete_folder_from_storage(
            user_id=str(current_user.id),
            folder=folder_name
        )

        # 2. 从数据库删除所有相关的 MediaFile 记录
        # Explicitly fetch and delete to ensure session is aware of deletions
        media_files_to_delete = db.query(models.MediaFile).filter(
            models.MediaFile.user_id == current_user.id,
            models.MediaFile.folder == folder_name
        ).all()

        for media_file in media_files_to_delete:
            db.delete(media_file)
        db.commit()

        return {"detail": f"Folder '{folder_name}' and its contents deleted successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete folder: {e}")

@router.put("/media/folder/{old_folder_name}/rename", status_code=status.HTTP_200_OK)
async def rename_folder(
    old_folder_name: str,
    folder_rename_data: FolderRename,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    重命名文件夹及其所有内容。
    """
    new_folder_name = folder_rename_data.new_folder_name.strip()

    if not old_folder_name.strip() or not new_folder_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Old and new folder names cannot be empty.")
    
    if old_folder_name == new_folder_name:
        return {"detail": "Folder name is the same, no rename needed."} # 没有实际的重命名操作

    # 检查新文件夹名称是否与保留关键字冲突
    reserved_names = {'action-create-folder', 'create-folder', 'uncategorized'}
    if new_folder_name in reserved_names:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Folder name '{new_folder_name}' is a reserved keyword.")

    # 检查新文件夹是否已经存在
    existing_new_folder = db.query(models.MediaFile).filter(
        models.MediaFile.user_id == current_user.id,
        models.MediaFile.folder == new_folder_name
    ).first()
    if existing_new_folder:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Folder '{new_folder_name}' already exists.")

    try:
        # 1. 在 Supabase Storage 中重命名文件夹
        moved_paths = await supabase_service.rename_folder_in_storage(
            user_id=str(current_user.id),
            old_folder_name=old_folder_name,
            new_folder_name=new_folder_name
        )

        # 2. 更新数据库中所有相关的 MediaFile 记录
        # 如果 Supabase 返回了移动的路径列表，使用这些路径来准确更新 filepath
        if isinstance(moved_paths, list) and moved_paths:
            # 生成从旧相对路径到新相对路径的映射
            # moved_paths 元素示例: '1/new_folder/filename.png'
            mapping_old_to_new = {}
            for new_full in moved_paths:
                # derive old path by replacing new_folder_name with old_folder_name in the path
                old_full = new_full.replace(f"/{new_folder_name}/", f"/{old_folder_name}/")
                mapping_old_to_new[old_full] = new_full

            # 查询 DB 中对应的记录并更新
            for old_rel, new_rel in mapping_old_to_new.items():
                # old_rel and new_rel are like '1/old_folder/filename.png'
                old_filepath_with_bucket = f"{settings.SUPABASE_BUCKET}/{old_rel}"
                new_filepath_with_bucket = f"{settings.SUPABASE_BUCKET}/{new_rel}"
                media_record = db.query(models.MediaFile).filter(
                    models.MediaFile.user_id == current_user.id,
                    models.MediaFile.filepath == old_filepath_with_bucket
                ).first()
                if media_record:
                    # update folder and filepath
                    media_record.folder = new_folder_name
                    media_record.filepath = new_filepath_with_bucket
                    db.add(media_record)
            db.commit()
        else:
            # fallback: update by pattern replace for any records pointing to old_folder_name
            media_files_to_update = db.query(models.MediaFile).filter(
                models.MediaFile.user_id == current_user.id,
                models.MediaFile.folder == old_folder_name
            ).all()

            for media_file in media_files_to_update:
                media_file.folder = new_folder_name
                old_folder_path_segment = f"{current_user.id}/{old_folder_name}"
                new_folder_path_segment = f"{current_user.id}/{new_folder_name}"
                media_file.filepath = media_file.filepath.replace(
                    f"{settings.SUPABASE_BUCKET}/{old_folder_path_segment}",
                    f"{settings.SUPABASE_BUCKET}/{new_folder_path_segment}"
                )
                db.add(media_file) # Mark object as dirty for update
            db.commit()

        return {"detail": f"Folder '{old_folder_name}' renamed to '{new_folder_name}' successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to rename folder: {e}")

@router.put("/media/{medi_id}/rename", response_model=MediaFileResponse, status_code=status.HTTP_200_OK)
async def rename_media_file(
    medi_id: str,
    media_rename_data: MediaFileRename,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    重命名媒体文件。
    """
    db_media_file = db.query(models.MediaFile).filter(
        models.MediaFile.id == medi_id,
        models.MediaFile.user_id == current_user.id
    ).first()

    if not db_media_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found or not owned by user")
    
    new_filename = media_rename_data.new_filename.strip()
    if not new_filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New filename cannot be empty.")

    if new_filename == db_media_file.filename:
        return db_media_file # 文件名相同，无需重命名
    
    # 提取旧文件扩展名并构建新文件名
    old_name, old_ext = os.path.splitext(db_media_file.filename)
    new_name, new_ext = os.path.splitext(new_filename)

    # 如果新文件名没有提供扩展名，则保留旧的扩展名
    # 如果提供了新的扩展名，则使用新的扩展名
    final_new_filename = f"{new_name}{new_ext or old_ext}"

    # 构建旧文件和新文件的完整存储路径
    old_full_path_in_storage = db_media_file.filepath.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)
    
    # 确定新文件的存储路径（保持在同一个文件夹中）
    folder_path = ""
    if db_media_file.folder:
        folder_path = f"{db_media_file.folder}/"
    new_full_path_in_storage = f"{str(current_user.id)}/{folder_path}{uuid.uuid4()}{os.path.splitext(final_new_filename)[1]}"

    try:
        # 1. 在 Supabase Storage 中重命名文件
        await supabase_service.rename_file_in_storage(
            user_id=str(current_user.id),
            old_file_path=old_full_path_in_storage,
            new_file_path=new_full_path_in_storage
        )

        # 2. 更新数据库记录
        db_media_file.filename = final_new_filename
        db_media_file.filepath = f"{settings.SUPABASE_BUCKET}/{new_full_path_in_storage}" # 更新完整路径
        db.commit()
        db.refresh(db_media_file)

        # 刷新签名 URL
        db_media_file.file_url = await supabase_service.get_signed_url_for_file(new_full_path_in_storage)
        
        return db_media_file
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to rename media file: {e}")
