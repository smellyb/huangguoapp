import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface InitPlayerOptions {
  streamUrl: string;
  autoPlay?: boolean;
  startSeconds?: number;
  headers?: Record<string, string>;
}

export interface PlaybackStateEvent {
  state: 'idle' | 'buffering' | 'ready' | 'ended';
}

export interface IsPlayingEvent {
  isPlaying: boolean;
}

export interface TimeUpdateEvent {
  currentTime: number;
  duration: number;
  bufferedPosition: number;
}

export interface VideoSizeEvent {
  width: number;
  height: number;
}

export interface PlayerErrorEvent {
  message: string;
  errorCode: number;
}

export interface Media3PlayerPlugin {
  initPlayer(options: InitPlayerOptions): Promise<{ success: boolean; streamUrl: string }>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(options: { seconds: number }): Promise<void>;
  setSpeed(options: { speed: number }): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  setResizeMode(options: { mode: 'fit' | 'zoom' | 'fill' }): Promise<void>;
  preload(options: { streamUrl: string }): Promise<void>;
  setVisibility(options: { visible: boolean }): Promise<void>;
  destroy(): Promise<void>;

  addListener(
    eventName: 'playbackStateChanged',
    listenerFunc: (event: PlaybackStateEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'isPlayingChanged',
    listenerFunc: (event: IsPlayingEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'timeUpdate',
    listenerFunc: (event: TimeUpdateEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'videoSizeChanged',
    listenerFunc: (event: VideoSizeEvent) => void
  ): Promise<PluginListenerHandle>;

  addListener(
    eventName: 'playerError',
    listenerFunc: (event: PlayerErrorEvent) => void
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}

const Media3Player = registerPlugin<Media3PlayerPlugin>('Media3Player', {
  web: () => ({
    initPlayer: async () => ({ success: false, streamUrl: '' }),
    play: async () => {},
    pause: async () => {},
    seekTo: async () => {},
    setSpeed: async () => {},
    setVolume: async () => {},
    setResizeMode: async () => {},
    preload: async () => {},
    setVisibility: async () => {},
    destroy: async () => {},
    addListener: async () => ({ remove: async () => {} }),
    removeAllListeners: async () => {},
  }),
});

/**
 * Checks if native Media3 (ExoPlayer) plugin is available on the current platform.
 */
export function isNativeMedia3Available(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android' &&
    Capacitor.isPluginAvailable('Media3Player')
  );
}

export default Media3Player;
