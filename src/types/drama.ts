export type DramaCategory = 'AI短剧' | '原创短剧' | 'AI漫剧';

export type DramaGenre = '科幻' | '古风' | '悬疑' | '都市' | '机甲' | '国风';

export type RankingType = 'hot' | 'new' | 'comic';

export type AppTab = 'discover' | 'theater' | 'search' | 'profile';

export type PlaybackRate = 0.75 | 1 | 1.25 | 1.5 | 2;

export type QualityPreference = 'auto' | '1080p' | '720p' | '480p';

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface QualityOption {
  label: string;
  value: QualityPreference;
  url?: string;
  bitrateKbps?: number;
}

export interface Episode {
  number: number;
  title: string;
  hook: string;
  durationSeconds: number;
  hlsUrl?: string;
  videoUrl?: string;
  posterUrl?: string;
  qualities?: QualityOption[];
  storyboardImages?: string[];
  subtitles: SubtitleCue[];
}

export interface Drama {
  id: string;
  title: string;
  tagline: string;
  category: DramaCategory;
  genres: DramaGenre[];
  posterUrl: string;
  heroUrl?: string;
  status: '连载中' | '已完结';
  totalEpisodes: number;
  updatedEpisodes: number;
  heatScore: number;
  playCountLabel: string;
  likesBase: number;
  releaseYear: string;
  studio: string;
  synopsis: string;
  topicIds: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  episodes: Episode[];
}

export interface Topic {
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  dramaIds: string[];
  accentNote: string;
}

export interface WatchHistoryEntry {
  dramaId: string;
  episodeNumber: number;
  progressSeconds: number;
  durationSeconds: number;
  updatedAt: number;
}

export interface ApiConfig {
  mode: 'demo' | 'custom';
  baseUrl: string;
  preferredQuality: QualityPreference;
}

export interface UserLibraryState {
  followedIds: string[];
  likedEpisodeKeys: string[];
  watchHistory: WatchHistoryEntry[];
  searchHistory: string[];
  apiConfig: ApiConfig;
}
