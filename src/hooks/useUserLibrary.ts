import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiConfig, UserLibraryState, WatchHistoryEntry } from '../types/drama';

const STORAGE_KEY = 'huangguo_drama_user_library_v1';
const MAX_HISTORY_ITEMS = 30;
const MAX_SEARCH_HISTORY = 10;

const envApiBase = (import.meta.env.VITE_DRAMA_API_BASE_URL as string | undefined)?.trim() ?? '';

const DEFAULT_STATE: UserLibraryState = {
  followedIds: ['time-fold-2049', 'shan-hai-qingluan'],
  likedEpisodeKeys: ['time-fold-2049::1'],
  watchHistory: [
    {
      dramaId: 'time-fold-2049',
      episodeNumber: 1,
      progressSeconds: 26,
      durationSeconds: 72,
      updatedAt: Date.now() - 1000 * 60 * 18,
    },
  ],
  searchHistory: ['时序折叠', 'AI漫剧'],
  apiConfig: {
    mode: envApiBase ? 'custom' : 'demo',
    baseUrl: envApiBase,
    preferredQuality: 'auto',
  },
};

function readPersistedState(): UserLibraryState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<UserLibraryState>;
    return {
      followedIds: Array.isArray(parsed.followedIds)
        ? parsed.followedIds
        : DEFAULT_STATE.followedIds,
      likedEpisodeKeys: Array.isArray(parsed.likedEpisodeKeys)
        ? parsed.likedEpisodeKeys
        : DEFAULT_STATE.likedEpisodeKeys,
      watchHistory: Array.isArray(parsed.watchHistory)
        ? parsed.watchHistory
        : DEFAULT_STATE.watchHistory,
      searchHistory: Array.isArray(parsed.searchHistory)
        ? parsed.searchHistory
        : DEFAULT_STATE.searchHistory,
      apiConfig: {
        mode:
          parsed.apiConfig?.mode === 'demo' && !parsed.apiConfig?.baseUrl
            ? (envApiBase ? 'custom' : 'demo')
            : (parsed.apiConfig?.mode ?? (envApiBase ? 'custom' : 'demo')),
        baseUrl:
          typeof parsed.apiConfig?.baseUrl === 'string' && parsed.apiConfig.baseUrl.trim()
            ? parsed.apiConfig.baseUrl
            : envApiBase,
        preferredQuality: parsed.apiConfig?.preferredQuality ?? 'auto',
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function episodeLikeKey(dramaId: string, episodeNumber: number): string {
  return `${dramaId}::${episodeNumber}`;
}

export function useUserLibrary() {
  const [state, setState] = useState<UserLibraryState>(readPersistedState);
  const lastProgressWriteRef = useRef<number>(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota or sandbox restrictions
    }
  }, [state]);

  const toggleFollow = useCallback((dramaId: string): boolean => {
    let added = false;
    setState((prev) => {
      const exists = prev.followedIds.includes(dramaId);
      added = !exists;
      return {
        ...prev,
        followedIds: exists
          ? prev.followedIds.filter((id) => id !== dramaId)
          : [dramaId, ...prev.followedIds],
      };
    });
    return added;
  }, []);

  const toggleLikeEpisode = useCallback((dramaId: string, episodeNumber: number): boolean => {
    const key = episodeLikeKey(dramaId, episodeNumber);
    let liked = false;
    setState((prev) => {
      const exists = prev.likedEpisodeKeys.includes(key);
      liked = !exists;
      return {
        ...prev,
        likedEpisodeKeys: exists
          ? prev.likedEpisodeKeys.filter((item) => item !== key)
          : [key, ...prev.likedEpisodeKeys],
      };
    });
    return liked;
  }, []);

  const recordProgress = useCallback(
    (
      dramaId: string,
      episodeNumber: number,
      progressSeconds: number,
      durationSeconds: number,
      immediate = false
    ) => {
      const now = Date.now();
      if (!immediate && now - lastProgressWriteRef.current < 3000) {
        return;
      }
      lastProgressWriteRef.current = now;

      const safeDuration = Math.max(durationSeconds, 1);
      const safeProgress = Math.min(Math.max(0, Math.floor(progressSeconds)), safeDuration);

      const entry: WatchHistoryEntry = {
        dramaId,
        episodeNumber,
        progressSeconds: safeProgress,
        durationSeconds: safeDuration,
        updatedAt: now,
      };

      setState((prev) => {
        const rest = prev.watchHistory.filter((item) => item.dramaId !== dramaId);
        return {
          ...prev,
          watchHistory: [entry, ...rest].slice(0, MAX_HISTORY_ITEMS),
        };
      });
    },
    []
  );

  const removeHistoryItem = useCallback((dramaId: string) => {
    setState((prev) => ({
      ...prev,
      watchHistory: prev.watchHistory.filter((item) => item.dramaId !== dramaId),
    }));
  }, []);

  const clearHistory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      watchHistory: [],
    }));
  }, []);

  const addSearchTerm = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setState((prev) => ({
      ...prev,
      searchHistory: [
        trimmed,
        ...prev.searchHistory.filter((item) => item !== trimmed),
      ].slice(0, MAX_SEARCH_HISTORY),
    }));
  }, []);

  const removeSearchTerm = useCallback((term: string) => {
    setState((prev) => ({
      ...prev,
      searchHistory: prev.searchHistory.filter((item) => item !== term),
    }));
  }, []);

  const clearSearchHistory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      searchHistory: [],
    }));
  }, []);

  const updateApiConfig = useCallback((patch: Partial<ApiConfig>) => {
    setState((prev) => ({
      ...prev,
      apiConfig: {
        ...prev.apiConfig,
        ...patch,
      },
    }));
  }, []);

  return {
    state,
    toggleFollow,
    toggleLikeEpisode,
    recordProgress,
    removeHistoryItem,
    clearHistory,
    addSearchTerm,
    removeSearchTerm,
    clearSearchHistory,
    updateApiConfig,
  };
}
