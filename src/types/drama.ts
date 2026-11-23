export type DramaCategory = '短剧' | '漫剧' | 'AI换脸' | 'AI魔改';

export type DramaGenre =
  | '全部'
  | '都市'
  | '古风'
  | '奇幻'
  | '现代'
  | '职场'
  | '逆袭'
  | '校园'
  | '熟女'
  | '母子'
  | '乱伦'
  | '系统'
  | '仙侠'
  | '后宫'
  | '大男主'
  | '性转'
  | '脑洞'
  | '悬疑'
  | 'NTR'
  | '武侠'
  | '科幻'
  | '机甲'
  | '国风'
  | '恋爱';

export interface OfficialCategory {
  id: number;
  name: DramaCategory;
  route: string;
}

export const OFFICIAL_CATEGORIES: OfficialCategory[] = [
  { id: 24, name: '短剧', route: 'ai-duanju' },
  { id: 25, name: '漫剧', route: 'ai-manju' },
  { id: 26, name: 'AI换脸', route: 'ai-huanlian' },
  { id: 27, name: 'AI魔改', route: 'ai-mogai' },
];

export const POPULAR_TAGS: DramaGenre[] = [
  '全部',
  '都市',
  '古风',
  '奇幻',
  '现代',
  '职场',
  '逆袭',
  '校园',
  '熟女',
  '母子',
  '乱伦',
  '系统',
  '仙侠',
  '后宫',
  '大男主',
  '性转',
  '脑洞',
  '悬疑',
  'NTR',
  '武侠',
];

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

export interface CdnAuthConfig {
  m3u8Enabled?: boolean;
  otherEnabled?: boolean;
  authKey?: string;
  authValue?: string;
  app?: string;
  imgEnabled?: boolean;
  imgAuthKey?: string;
  imgAuthValue?: string;
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
  cdn?: CdnAuthConfig;
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
