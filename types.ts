export interface Tag {
  id: string;
  timestamp: number;
  label?: string;
  createdAt: number;
}

export interface VideoState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  isMuted: boolean;
}

export interface ArtResult {
  tagId: string;
  timestamp: number;
  originalImage: string; // Base64
  generatedImage: string | null; // Base64
  status: 'pending' | 'generating' | 'completed' | 'error';
}