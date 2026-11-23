export type DramaCategory = '全部' | '短剧' | '漫剧' | 'AI换脸' | 'AI魔改' | '黄果原创' | '专题' | '排行榜';

export type DramaGenre = string;

export interface OfficialTagItem {
  id: number;
  name: string;
  slug: string;
  isHot?: boolean;
  hotScore?: number;
}

export interface OfficialTagCategory {
  id: number;
  name: string;
  code: string;
  tags: OfficialTagItem[];
}

export interface OfficialCategory {
  id: number;
  name: string;
  route: string;
}

export const OFFICIAL_CATEGORIES: OfficialCategory[] = [
  { id: 24, name: '短剧', route: 'ai-duanju' },
  { id: 25, name: '漫剧', route: 'ai-manju' },
  { id: 26, name: 'AI换脸', route: 'ai-huanlian' },
  { id: 27, name: 'AI魔改', route: 'ai-mogai' },
  { id: 101, name: '黄果原创', route: 'original' },
  { id: 102, name: '专题', route: 'topics' },
  { id: 103, name: '排行榜', route: 'ranks' },
];

/**
 * 官方首页 20 个热门标签（按 huangguoai.com 热门标签栏完全对齐，共 20 个）
 */
export const POPULAR_TAGS: DramaGenre[] = [
  '都市',
  '古风',
  '奇幻',
  '现代',
  '职场',
  '逆袭',
  '校园',
  '绿帽',
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

export interface TagCatalogResult {
  tagName: string;
  tagSlug: string;
  totalCount?: number;
  intro?: string;
  dramas: Drama[];
}

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
  rating?: number;
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
