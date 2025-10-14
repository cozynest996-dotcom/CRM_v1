from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class MediaFileBase(BaseModel):
    filename: str
    folder: Optional[str] = None
    file_type: Optional[str] = None
    size: Optional[int] = None

class MediaFileCreate(MediaFileBase):
    pass

class FolderCreate(BaseModel):
    folder_name: str = Field(..., description="The name of the folder to create")

class FolderRename(BaseModel):
    new_folder_name: str = Field(..., description="The new name for the folder")

class MediaFileRename(BaseModel):
    new_filename: str = Field(..., description="The new name for the media file")

class MediaFileResponse(MediaFileBase):
    id: UUID = Field(..., example="a1b2c3d4-e5f6-7890-1234-567890abcdef")
    user_id: int
    filepath: str
    file_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    media_type: Optional[str] = None  # 例如: "image", "video", "document"

    class Config:
        from_attributes = True

class FolderResponse(BaseModel):
    name: str = Field(..., description="文件夹名称")  # 文件夹名称，对于未分类的媒体，将使用特定字符串表示
    media_count: int = Field(..., description="Number of media files in this folder")

class MediaListResponse(BaseModel):
    media: List[MediaFileResponse]
    folders: List[FolderResponse]
