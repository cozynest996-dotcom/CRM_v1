from supabase import create_client, Client
from app.core.config import settings
from typing import Optional, List, Dict


# Supabase 客户端初始化
# 在生产环境一般使用 service_role_key 执行后端操作；此处使用 service key 来保证权限
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


async def upload_file_to_storage(
    user_id: str,
    folder: Optional[str],
    file_name: str,
    file_content: bytes,
    content_type: str,
) -> str:
    """Upload a file to Supabase Storage.

    Path format: `user_id[/folder]/file_name`.
    Returns the storage path (not a signed URL).
    """
    path_segments = [user_id]
    if folder:
        path_segments.append(folder)
    path_segments.append(file_name)
    file_path_in_storage = "/".join(path_segments)

    try:
        response = supabase.storage.from_(settings.SUPABASE_BUCKET).upload(
            path=file_path_in_storage,
            file=file_content,
            file_options={"content-type": content_type},
        )

        # UploadResponse has full_path attribute containing the complete storage path
        if not hasattr(response, 'full_path') or not response.full_path:
            raise Exception("Supabase upload response did not contain expected full_path data.")

        # Return the full storage path (e.g., "media/1/filename.png")
        # Ensure the returned path starts with the bucket name for consistency.
        # The full_path from Supabase includes the bucket name already.
        return response.full_path
    except Exception as exc:
        print(f"Error uploading file to Supabase Storage: {exc}")
        raise


async def list_files_in_storage(user_id: str, folder: Optional[str]) -> List[Dict]:
    """List files in a user's storage folder and attach signed URLs."""
    path = user_id if not folder else f"{user_id}/{folder}"

    try:
        response = supabase.storage.from_(settings.SUPABASE_BUCKET).list(path=path)

        if not isinstance(response, list):
            raise Exception("Supabase list files response was not a list.")

        # Filter only files
        files = [f for f in response if f.get("type") == "file"]

        signed_files: List[Dict] = []
        for file_data in files:
            file_path_in_storage = f"{path}/{file_data.get('name')}"
            signed_url_response = supabase.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
                path=file_path_in_storage, expires_in=3600
            )

            if signed_url_response.get("error"):
                print(
                    f"Warning: Failed to create signed URL for {file_path_in_storage}: {signed_url_response['error'].get('message')}"
                )
                file_data["signed_url"] = None
            else:
                # Supabase JS/py SDKs may differ; defensively check keys
                file_data["signed_url"] = signed_url_response.get("signedURL") or signed_url_response.get("signed_url")

            signed_files.append(file_data)

        return signed_files
    except Exception as exc:
        print(f"Error listing files from Supabase Storage: {exc}")
        raise


async def delete_file_from_storage(user_id: str, file_path_in_storage: str) -> bool:
    """Delete a file from storage; ensures file is inside user's folder."""
    print(f"DEBUG: delete_file_from_storage called. User ID: {user_id}, Filepath in storage: {file_path_in_storage}")
    # 确保文件路径是以 user_id 开头的，因为 file_path_in_storage 已经不包含 bucket 名称
    expected_prefix_for_check = f"{user_id}"
    if not file_path_in_storage.startswith(expected_prefix_for_check):
        raise Exception(f"Attempt to delete file outside of user's directory or incorrect path format. Expected prefix: {expected_prefix_for_check}, Got: {file_path_in_storage}")
        
    try:
        response = supabase.storage.from_(settings.SUPABASE_BUCKET).remove(
            paths=[file_path_in_storage]
        )

        # Supabase remove method usually returns data on success, or raises an exception on error.
        # If no exception is raised and response.data exists, we consider it successful.
        if getattr(response, "data", None) is None:
            # This case might indicate an unexpected empty response for a successful operation
            print(f"Warning: Supabase remove returned no data for {file_path_in_storage}. Assuming successful deletion.")

        print(f"DEBUG: Supabase remove response: {response}")
        return True
    except Exception as exc:
        print(f"ERROR: Exception during delete_file_from_storage: {exc}")
        raise


async def get_signed_url_for_file(file_path_in_storage: str, expires_in: int = 3600) -> Optional[str]:
    """
    为给定文件路径生成一个签名 URL。
    """
    path_to_sign = file_path_in_storage
    # 如果 file_path_in_storage 包含 bucket 名称作为前缀，我们需要移除它
    # 因为 create_signed_url 期望的是相对于 bucket 根目录的路径
    if path_to_sign.startswith(f"{settings.SUPABASE_BUCKET}/"):
        path_to_sign = path_to_sign.replace(f"{settings.SUPABASE_BUCKET}/", "", 1)

    try:
        response = supabase.storage.from_(settings.SUPABASE_BUCKET).create_signed_url(
            path=path_to_sign,
            expires_in=expires_in
        )

        # Response shape may vary; check commonly used keys
        signed_url = None
        if isinstance(response, dict):
            signed_url = response.get("signedURL") or response.get("signed_url")
        else:
            signed_url = getattr(response, "data", None) and getattr(response.data, "signedURL", None)

        if not signed_url:
            raise Exception("Supabase signed URL response did not contain expected data.")

        return signed_url
    except Exception as exc:
        print(f"Error generating signed URL for {file_path_in_storage}: {exc}")
        raise

async def list_all_user_files_from_storage(user_id: str) -> List[Dict]:
    """List all files (excluding .keep files and folders) for a given user directly from Supabase Storage."""
    try:
        all_items = supabase.storage.from_(settings.SUPABASE_BUCKET).list(path=user_id, options={'deep': True})
        # print(f"DEBUG: Raw Supabase list response for user {user_id}: {all_items}") # 移除调试日志

        if not isinstance(all_items, list):
            raise Exception("Supabase list response was not a list.")

        files_in_storage = []
        for item in all_items:
            item_name = item.get("name")
            item_type = item.get("type")
            # print(f"DEBUG: Processing item - Name: {item_name}, Type: {item_type}") # 移除调试日志

            # 识别文件的更健壮的逻辑：
            # 1. 如果 item_type 明确是 "file"
            # 2. 或者 item_type 是 None (常见于 Supabase 中直接上传的文件，而非通过创建文件夹后的文件)，并且名称包含文件扩展名
            if (item_type == "file" or (item_type is None and '.' in item_name)) and item_name != ".keep":
                full_path_in_storage = f"{user_id}/{item_name}"
                # 从 metadata 中提取 mimetype 和 size
                metadata = item.get("metadata", {})
                mimetype = metadata.get("mimetype", "application/octet-stream")
                size = metadata.get("size", 0)

                files_in_storage.append({"name": item_name, "full_path": full_path_in_storage, "content_type": mimetype, "size": size})
        return files_in_storage
    except Exception as exc:
        print(f"ERROR: Exception during list_all_user_files_from_storage for user {user_id}: {exc}")
        raise

async def delete_folder_from_storage(user_id: str, folder: str) -> bool:
    """Delete all files within a specific folder in Supabase Storage for a given user."""
    # 确保文件夹路径是正确的，不允许删除用户根目录
    if not folder or folder.strip() == '':
        raise ValueError("Folder name cannot be empty for folder deletion.")
    
    try:
        # 列出文件夹中的所有文件和子目录（深度遍历）
        # Supabase 的 list 方法不直接支持递归删除整个目录结构。我们需要列出所有文件和子文件夹，然后逐一删除。
        all_items_in_folder = supabase.storage.from_(settings.SUPABASE_BUCKET).list(path=f"{user_id}/{folder}", options={'deep': True})

        if not isinstance(all_items_in_folder, list):
            raise Exception("Supabase list files response was not a list during folder deletion attempt.")

        if not all_items_in_folder:
            print(f"DEBUG: Folder '{folder}' for user {user_id} is already empty or does not exist in Supabase.")
            return True # 文件夹已经是空的，视为成功删除

        paths_to_remove = []
        for item_data in all_items_in_folder:
            item_name = item_data.get("name")
            item_type = item_data.get("type")

            # 构建完整路径。Supabase list 的 name 是相对于 path 的，所以需要拼接
            full_path_to_item = f"{user_id}/{folder}/{item_name}"

            # 如果是文件，或者被我们视为文件夹的空目录（type is None 且没有扩展名）
            # Supabase 的 remove API 也可以接受文件夹路径来删除空文件夹
            paths_to_remove.append(full_path_to_item) # 直接添加所有找到的路径进行删除

        if not paths_to_remove:
            print(f"DEBUG: No files or identifiable empty folders found to delete in Supabase for folder '{folder}'.")
            return True

        print(f"DEBUG: Attempting to delete items from Supabase: {paths_to_remove}")

        response = supabase.storage.from_(settings.SUPABASE_BUCKET).remove(
            paths=paths_to_remove
        )

        if getattr(response, "data", None) is None:
            print(f"Warning: Supabase remove returned no data for folder deletion in {folder}. Assuming successful deletion.")

        print(f"DEBUG: Supabase folder remove response: {response}")
        return True
    except Exception as exc:
        print(f"ERROR: Exception during delete_folder_from_storage for folder '{folder}': {exc}")
        raise


async def rename_folder_in_storage(user_id: str, old_folder_name: str, new_folder_name: str) -> list:
    """Rename a folder in Supabase Storage by copying files to a new path and deleting the old path."""
    if not old_folder_name.strip() or not new_folder_name.strip():
        raise ValueError("Old and new folder names cannot be empty for folder renaming.")
    
    if old_folder_name == new_folder_name:
        return True # 没有实际的重命名操作

    try:
        # 1. 列出旧文件夹中的所有文件
        files_to_rename_metadata = supabase.storage.from_(settings.SUPABASE_BUCKET).list(path=f"{user_id}/{old_folder_name}", options={'deep': True})

        if not isinstance(files_to_rename_metadata, list):
            raise Exception("Supabase list files response was not a list during folder renaming attempt.")

        old_paths_to_delete = []
        moved_new_paths = []
        for file_data in files_to_rename_metadata:
            original_file_name = file_data.get("name") # item_name in current context refers to the path relative to the listed folder
            # Supabase list returns name relative to the path. Reconstruct full path for both old and new.
            old_full_path_for_item = f"{user_id}/{old_folder_name}/{original_file_name}"
            new_full_path_for_item = f"{user_id}/{new_folder_name}/{original_file_name}"

            # Handle both regular files and .keep files (which may not have type="file")
            if file_data.get("type") == "file" or original_file_name == ".keep":
                # Supabase Storage 的 move 操作实际是 copy + delete
                response = supabase.storage.from_(settings.SUPABASE_BUCKET).move(old_full_path_for_item, new_full_path_for_item)
                
                if response.get("error"):
                    raise Exception(f"Failed to move file {original_file_name}: {response.get('error').get('message')}")
                moved_new_paths.append(new_full_path_for_item)
            elif file_data.get("type") is None and '.' not in original_file_name: # 识别空目录
                # 如果是空目录，也将其路径添加到待删除列表，因为 move 无法处理空目录。
                # 注意：这里的 original_file_name 已经是相对路径，不需要再次拼接 folder name
                empty_folder_path = f"{user_id}/{old_folder_name}/{original_file_name}" # 确保路径正确
                old_paths_to_delete.append(empty_folder_path)
                # represent empty dir as new path as well
                moved_new_paths.append(f"{user_id}/{new_folder_name}/{original_file_name}")

        # 在所有文件/子目录路径添加完毕后，再添加旧的顶层文件夹本身的路径，以确保其被删除
        # 只有在旧文件夹确实为空时（即没有实际文件但可能有一个 .keep 文件或者是一个虚拟文件夹），才需要额外删除这个路径
        # 但为了稳妥起见，我们可以尝试将其添加到删除列表中，即使它可能不存在或在删除其他文件时已被隐含删除。
        # 考虑到 Supabase list(deep=True) 可能返回 type=None 的目录项，这些项的 name 可能就是子目录的名称
        # 理论上，如果 old_folder_name 本身也作为一个 "path" 传给 remove，它应该能删除空的顶层虚拟文件夹
        # old_paths_to_delete.append(f"{user_id}/{old_folder_name}") # 尝试删除顶层旧文件夹本身

        # 3. 删除旧文件夹中的所有文件和空目录
        if old_paths_to_delete:
            response = supabase.storage.from_(settings.SUPABASE_BUCKET).remove(
                paths=old_paths_to_delete
            )

            if getattr(response, "data", None) is None:
                print(f"Warning: Supabase remove returned no data for old folder '{old_folder_name}' during rename. Assuming successful deletion.")
        
        return moved_new_paths
    except Exception as exc:
        raise


async def rename_file_in_storage(user_id: str, old_file_path: str, new_file_path: str) -> bool:
    """Rename a single file in Supabase Storage."""
    if not old_file_path.strip() or not new_file_path.strip():
        raise ValueError("Old and new file paths cannot be empty for file renaming.")

    # 确保文件路径是以 user_id 开头的
    expected_prefix = f"{user_id}/"
    if not old_file_path.startswith(expected_prefix) or not new_file_path.startswith(expected_prefix):
        raise ValueError("Attempt to rename file outside of user's directory or incorrect path format.")
    
    try:
        response = supabase.storage.from_(settings.SUPABASE_BUCKET).move(old_file_path, new_file_path)

        if response.get("error"):
            raise Exception(f"Failed to move file {old_file_path} to {new_file_path}: {response.get('error').get('message')}")
        
        print(f"DEBUG: File '{old_file_path}' renamed to '{new_file_path}' successfully.")
        return True
    except Exception as exc:
        print(f"ERROR: Exception during rename_file_in_storage from '{old_file_path}' to '{new_file_path}': {exc}")
        raise

async def list_user_folders_from_storage(user_id: str) -> List[str]:
    """List all top-level folders for a given user directly from Supabase Storage."""
    try:
        all_items = supabase.storage.from_(settings.SUPABASE_BUCKET).list(path=user_id, options={'deep': True})
        # print(f"DEBUG: Raw Supabase list response (deep) for user {user_id}: {all_items}") # 移除临时调试日志

        if not isinstance(all_items, list):
            raise Exception("Supabase list response was not a list.")

        found_folders = set()
        for item in all_items:
            item_name = item.get("name")
            item_type = item.get("type")

            if item_type == "folder":
                found_folders.add(item_name)
            elif item_type == "file":
                if '/' in item_name:
                    first_slash_index = item_name.find('/')
                    folder_name = item_name[:first_slash_index]
                    found_folders.add(folder_name)
            elif item_type is None and '.' not in item_name: # 尝试识别 Supabase 将文件夹列为 type=None 的情况
                found_folders.add(item_name)

        final_folders = sorted(list(found_folders))
        print(f"DEBUG: Processed folders from Supabase Storage for user {user_id}: {final_folders}")
        return final_folders
    except Exception as exc:
        print(f"ERROR: Exception during list_user_folders_from_storage for user {user_id}: {exc}")
        raise