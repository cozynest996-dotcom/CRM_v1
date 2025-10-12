export interface Media {
  id: string;
  name: string;
  type: string; // e.g., 'image', 'video', 'document'
  url: string;
  thumbnail_url?: string; // For images/videos
  folder?: string; // Optional folder name
  size?: number; // File size in bytes
  created_at?: string;
}

export interface Folder {
  name: string;
  media_count: number;
}

export const uploadMedia = async (file: File, folder: string = 'root', userId: string): Promise<Media> => {
  console.log(`Uploading ${file.name} to folder ${folder} for user ${userId}`);
  // Placeholder for actual API call
  return new Promise(resolve => setTimeout(() => {
    resolve({
      id: 'mock-id-' + Date.now(),
      name: file.name,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      url: URL.createObjectURL(file),
      thumbnail_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      folder: folder,
      size: file.size,
      created_at: new Date().toISOString(),
    });
  }, 1000));
};

export const getMediaList = async (folder: string = 'root', userId: string): Promise<{ media: Media[], folders: Folder[] }> => {
  console.log(`Fetching media list for folder ${folder} for user ${userId}`);
  // Placeholder for actual API call
  return new Promise(resolve => setTimeout(() => {
    resolve({
      media: [],
      folders: [{ name: 'root', media_count: 0 }],
    });
  }, 500));
};

export const deleteMedia = async (mediaId: string, userId: string): Promise<void> => {
  console.log(`Deleting media ${mediaId} for user ${userId}`);
  // Placeholder for actual API call
  return new Promise(resolve => setTimeout(() => resolve(), 500));
};
