import axios from 'axios';
import { getAuthToken } from '../utils/auth'; // 假设存在一个用于获取 JWT token 的工具函数

// API 基础 URL 配置
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Media {
  id: string;
  user_id: number; // 对应后端 int
  filename: string;
  filepath: string;
  file_url?: string; // 可公开访问的 URL (签名 URL)
  file_type?: string; // 例如: 'image/jpeg', 'video/mp4'
  folder?: string; // 自定义文件夹名称
  size?: number; // 文件大小 (字节)
  created_at: string; // ISO 格式日期字符串
  updated_at: string; // ISO 格式日期字符串
}

export interface Folder {
  name: string;
  media_count: number;
}

export const uploadMedia = async (file: File, folder: string | null = null): Promise<Media> => {
  const token = getAuthToken();
  if (!token) {
    console.warn('uploadMedia aborted: no auth token found');
    throw new Error('User not authenticated. Please log in to upload media.');
  }

  const formData = new FormData();
  formData.append('file', file);
  if (folder) {
    formData.append('folder', folder);
  }

  try {
    const response = await axios.post<Media>(`${API_BASE_URL}/api/media/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${token}`
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Error uploading media:', error);
    // Normalize error message
    if (error?.response?.data) {
      throw new Error(error.response.data.detail || error.response.data || String(error));
    }
    throw error;
  }
};

export const getMediaList = async (folder: string | null = null): Promise<{ media: Media[], folders: Folder[] }> => {
  const token = getAuthToken();
  if (!token) {
    console.warn('getMediaList aborted: no auth token found');
    throw new Error('User not authenticated. Please log in to view media.');
  }

  try {
    const params = folder ? { folder } : {};
    const response = await axios.get<{ media: Media[], folders: Folder[] }>(`${API_BASE_URL}/api/media`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: params,
    });
    return response.data; // 直接返回后端数据
  } catch (error: any) {
    console.error('Error fetching media list:', error);
    if (error?.response?.data) {
      throw new Error(error.response.data.detail || String(error));
    }
    throw error;
  }
};

export const deleteMedia = async (mediaId: string): Promise<void> => {
  const token = getAuthToken();
  if (!token) {
    console.warn('deleteMedia aborted: no auth token found');
    throw new Error('User not authenticated. Please log in to delete media.');
  }

  try {
    await axios.delete(`${API_BASE_URL}/api/media/${mediaId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
    });
  } catch (error: any) {
    console.error('Error deleting media:', error);
    if (error?.response?.data) {
      throw new Error(error.response.data.detail || String(error));
    }
    throw error;
  }
};

export const createFolder = async (folderName: string): Promise<{ detail: string }> => {
    const token = getAuthToken();
    if (!token) {
        console.warn('createFolder aborted: no auth token found');
        throw new Error('User not authenticated. Please log in to create folders.');
    }

    try {
        const response = await axios.post<{ detail: string }>(`${API_BASE_URL}/api/media/create-folder`, { folder_name: folderName }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
        });
        return response.data;
    } catch (error: any) {
        console.error('Error creating folder:', error);
        if (error?.response?.data) {
            throw new Error(error.response.data.detail || String(error));
        }
        throw error;
    }
};

export const deleteFolder = async (folderName: string): Promise<{ detail: string }> => {
    const token = getAuthToken();
    if (!token) {
        console.warn('deleteFolder aborted: no auth token found');
        throw new Error('User not authenticated. Please log in to delete folders.');
    }

    try {
        console.log("Attempting to delete folder with name:", folderName);
        const response = await axios.delete<{ detail: string }>(`${API_BASE_URL}/api/media/folder/${folderName}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            },
        });
        return response.data;
    } catch (error: any) {
        console.error('Error deleting folder:', error);
        if (error?.response?.data) {
            throw new Error(error.response.data.detail || String(error));
        }
        throw error;
    }
};

export const renameFolder = async (oldFolderName: string, newFolderName: string): Promise<{ detail: string }> => {
    const token = getAuthToken();
    if (!token) {
        console.warn('renameFolder aborted: no auth token found');
        throw new Error('User not authenticated. Please log in to rename folders.');
    }

    try {
        const response = await axios.put<{ detail: string }>(`${API_BASE_URL}/api/media/folder/${oldFolderName}/rename`, { new_folder_name: newFolderName }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
        });
        return response.data;
    } catch (error: any) {
        console.error('Error renaming folder:', error);
        if (error?.response?.data) {
            throw new Error(error.response.data.detail || String(error));
        }
        throw error;
    }
};

export const renameMedia = async (mediaId: string, newFilename: string): Promise<Media> => {
    const token = getAuthToken();
    if (!token) {
        console.warn('renameMedia aborted: no auth token found');
        throw new Error('User not authenticated. Please log in to rename media files.');
    }

    try {
        const response = await axios.put<Media>(`${API_BASE_URL}/api/media/${mediaId}/rename`, { new_filename: newFilename }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
        });
        return response.data;
    } catch (error: any) {
        console.error('Error renaming media file:', error);
        if (error?.response?.data) {
            throw new Error(error.response.data.detail || String(error));
        }
        throw error;
    }
};
