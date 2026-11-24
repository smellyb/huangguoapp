package com.huangguo.app.plugins;

import android.content.Context;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.CacheWriter;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@UnstableApi
@CapacitorPlugin(name = "Media3Player")
public class Media3PlayerPlugin extends Plugin {

    private static final String TAG = "Media3PlayerPlugin";
    private static SimpleCache sDownloadCache;

    private ExoPlayer mPlayer;
    private PlayerView mPlayerView;
    private final Handler mProgressHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService mExecutor = Executors.newFixedThreadPool(2);
    private boolean mIsProgressRunning = false;
    private CacheDataSource.Factory mCacheDataSourceFactory;

    private static synchronized SimpleCache getCache(Context context) {
        if (sDownloadCache == null) {
            File cacheDir = new File(context.getCacheDir(), "media3_video_cache");
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }
            sDownloadCache = new SimpleCache(
                cacheDir,
                new LeastRecentlyUsedCacheEvictor(100 * 1024 * 1024), // 100MB
                new StandaloneDatabaseProvider(context)
            );
        }
        return sDownloadCache;
    }

    private final Runnable mProgressRunnable = new Runnable() {
        @Override
        public void run() {
            if (mPlayer != null && mPlayer.isPlaying()) {
                JSObject ret = new JSObject();
                double currentSec = mPlayer.getCurrentPosition() / 1000.0;
                double durationSec = mPlayer.getDuration() > 0 ? mPlayer.getDuration() / 1000.0 : 0.0;
                double bufferedSec = mPlayer.getBufferedPosition() / 1000.0;

                ret.put("currentTime", currentSec);
                ret.put("duration", durationSec);
                ret.put("bufferedPosition", bufferedSec);
                notifyListeners("timeUpdate", ret);

                mProgressHandler.postDelayed(this, 250);
            } else {
                mIsProgressRunning = false;
            }
        }
    };

    private void startProgressTimer() {
        if (!mIsProgressRunning) {
            mIsProgressRunning = true;
            mProgressHandler.post(mProgressRunnable);
        }
    }

    private void stopProgressTimer() {
        mIsProgressRunning = false;
        mProgressHandler.removeCallbacks(mProgressRunnable);
    }

    @PluginMethod
    public void initPlayer(PluginCall call) {
        String streamUrl = call.getString("streamUrl");
        if (streamUrl == null || streamUrl.trim().isEmpty()) {
            call.reject("streamUrl is required");
            return;
        }

        final boolean autoPlay = call.getBoolean("autoPlay", true);
        final double startSeconds = call.getDouble("startSeconds", 0.0);
        final JSObject headers = call.getObject("headers");

        getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();

                // 1. Setup Cache & Data Source
                DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(10000)
                    .setReadTimeoutMs(10000);

                if (headers != null) {
                    Map<String, String> headerMap = new HashMap<>();
                    Iterator<String> it = headers.keys();
                    while (it.hasNext()) {
                        String key = it.next();
                        headerMap.put(key, headers.getString(key));
                    }
                    httpDataSourceFactory.setDefaultRequestProperties(headerMap);
                }

                mCacheDataSourceFactory = new CacheDataSource.Factory()
                    .setCache(getCache(context))
                    .setUpstreamDataSourceFactory(httpDataSourceFactory)
                    .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);

                // 2. Destroy previous player if exists
                if (mPlayer != null) {
                    mPlayer.release();
                    mPlayer = null;
                }
                stopProgressTimer();

                // 3. Setup Hardware-Accelerated Renderer & Player
                DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(context)
                    .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
                    .setEnableDecoderFallback(true);

                mPlayer = new ExoPlayer.Builder(context, renderersFactory).build();

                // 4. Setup View hierarchy: place PlayerView UNDER the transparent WebView
                String initialResizeMode = call.getString("resizeMode", "fit");
                int targetResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;
                if ("zoom".equalsIgnoreCase(initialResizeMode)) {
                    targetResizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
                } else if ("fill".equalsIgnoreCase(initialResizeMode)) {
                    targetResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FILL;
                }

                if (mPlayerView == null) {
                    mPlayerView = new PlayerView(context);
                    mPlayerView.setUseController(false);
                    mPlayerView.setResizeMode(targetResizeMode);
                    mPlayerView.setShutterBackgroundColor(Color.TRANSPARENT);
                    mPlayerView.setKeepContentOnPlayerReset(true);
                    mPlayerView.setBackgroundColor(Color.TRANSPARENT);

                    ViewGroup parent = (ViewGroup) getBridge().getWebView().getParent();
                    if (parent != null) {
                        int webViewIndex = parent.indexOfChild(getBridge().getWebView());
                        getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
                        parent.addView(mPlayerView, webViewIndex, new ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        ));
                    }
                } else {
                    mPlayerView.setResizeMode(targetResizeMode);
                    mPlayerView.setShutterBackgroundColor(Color.TRANSPARENT);
                    mPlayerView.setKeepContentOnPlayerReset(true);
                    mPlayerView.setBackgroundColor(Color.TRANSPARENT);
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
                    }
                }

                mPlayerView.setPlayer(mPlayer);
                mPlayerView.setVisibility(android.view.View.VISIBLE);

                // 5. Setup Listeners
                mPlayer.addListener(new Player.Listener() {
                    @Override
                    public void onPlaybackStateChanged(int playbackState) {
                        JSObject stateObj = new JSObject();
                        String stateStr = "idle";
                        switch (playbackState) {
                            case Player.STATE_IDLE:
                                stateStr = "idle";
                                stopProgressTimer();
                                break;
                            case Player.STATE_BUFFERING:
                                stateStr = "buffering";
                                break;
                            case Player.STATE_READY:
                                stateStr = "ready";
                                if (mPlayer != null && mPlayer.isPlaying()) {
                                    startProgressTimer();
                                }
                                break;
                            case Player.STATE_ENDED:
                                stateStr = "ended";
                                stopProgressTimer();
                                break;
                        }
                        stateObj.put("state", stateStr);
                        notifyListeners("playbackStateChanged", stateObj);
                    }

                    @Override
                    public void onIsPlayingChanged(boolean isPlaying) {
                        JSObject playObj = new JSObject();
                        playObj.put("isPlaying", isPlaying);
                        notifyListeners("isPlayingChanged", playObj);

                        if (isPlaying) {
                            startProgressTimer();
                        } else {
                            stopProgressTimer();
                        }
                    }

                    @Override
                    public void onPlayerError(PlaybackException error) {
                        Log.e(TAG, "Media3 Player Error: " + error.getMessage(), error);
                        JSObject errObj = new JSObject();
                        errObj.put("message", error.getMessage());
                        errObj.put("errorCode", error.errorCode);
                        notifyListeners("playerError", errObj);
                        stopProgressTimer();
                    }

                    @Override
                    public void onVideoSizeChanged(VideoSize videoSize) {
                        JSObject sizeObj = new JSObject();
                        sizeObj.put("width", videoSize.width);
                        sizeObj.put("height", videoSize.height);
                        notifyListeners("videoSizeChanged", sizeObj);
                    }
                });

                // 6. Build MediaSource
                MediaSource mediaSource;
                Uri videoUri = Uri.parse(streamUrl);
                if (streamUrl.contains(".m3u8") || streamUrl.contains("hls")) {
                    mediaSource = new HlsMediaSource.Factory(mCacheDataSourceFactory)
                        .setAllowChunklessPreparation(true)
                        .createMediaSource(MediaItem.fromUri(videoUri));
                } else {
                    mediaSource = new ProgressiveMediaSource.Factory(mCacheDataSourceFactory)
                        .createMediaSource(MediaItem.fromUri(videoUri));
                }

                mPlayer.setMediaSource(mediaSource);
                if (startSeconds > 0) {
                    mPlayer.seekTo((long) (startSeconds * 1000));
                }
                mPlayer.prepare();
                mPlayer.setPlayWhenReady(autoPlay);

                JSObject res = new JSObject();
                res.put("success", true);
                res.put("streamUrl", streamUrl);
                call.resolve(res);
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize Media3 Player", e);
                call.reject("Failed to initialize Media3 Player: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (mPlayer != null) {
                mPlayer.play();
                startProgressTimer();
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (mPlayer != null) {
                mPlayer.pause();
                stopProgressTimer();
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        });
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        Double seconds = call.getDouble("seconds");
        if (seconds == null) {
            call.reject("seconds parameter is required");
            return;
        }

        getActivity().runOnUiThread(() -> {
            if (mPlayer != null) {
                mPlayer.seekTo((long) (seconds * 1000));
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        });
    }

    @PluginMethod
    public void setSpeed(PluginCall call) {
        Double speed = call.getDouble("speed", 1.0);
        getActivity().runOnUiThread(() -> {
            if (mPlayer != null) {
                mPlayer.setPlaybackParameters(new PlaybackParameters(speed.floatValue()));
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double volume = call.getDouble("volume", 1.0);
        getActivity().runOnUiThread(() -> {
            if (mPlayer != null) {
                mPlayer.setVolume(volume.floatValue());
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        });
    }

    @PluginMethod
    public void setResizeMode(PluginCall call) {
        String mode = call.getString("mode", "fit");
        getActivity().runOnUiThread(() -> {
            if (mPlayerView != null) {
                if ("zoom".equalsIgnoreCase(mode)) {
                    mPlayerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_ZOOM);
                } else if ("fill".equalsIgnoreCase(mode)) {
                    mPlayerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL);
                } else {
                    mPlayerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                }
                call.resolve();
            } else {
                call.reject("Player view not initialized");
            }
        });
    }

    @PluginMethod
    public void preload(PluginCall call) {
        String streamUrl = call.getString("streamUrl");
        if (streamUrl == null || streamUrl.trim().isEmpty()) {
            call.reject("streamUrl is required");
            return;
        }

        mExecutor.execute(() -> {
            try {
                Context context = getContext();
                DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(8000)
                    .setReadTimeoutMs(8000);

                CacheDataSource cacheDataSource = new CacheDataSource.Factory()
                    .setCache(getCache(context))
                    .setUpstreamDataSourceFactory(httpFactory)
                    .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
                    .createDataSource();

                // Prefetch first 800KB (manifest + first HLS transport stream segment)
                DataSpec dataSpec = new DataSpec.Builder()
                    .setUri(Uri.parse(streamUrl))
                    .setPosition(0)
                    .setLength(800 * 1024)
                    .build();

                CacheWriter cacheWriter = new CacheWriter(cacheDataSource, dataSpec, null, null);
                cacheWriter.cache();
                Log.d(TAG, "Preloaded first 800KB for episode: " + streamUrl);
            } catch (Exception e) {
                Log.w(TAG, "Preload failed for: " + streamUrl + ": " + e.getMessage());
            }
        });

        call.resolve();
    }

    @PluginMethod
    public void setVisibility(PluginCall call) {
        boolean visible = call.getBoolean("visible", true);
        getActivity().runOnUiThread(() -> {
            if (mPlayerView != null) {
                mPlayerView.setVisibility(visible ? android.view.View.VISIBLE : android.view.View.GONE);
                if (!visible) {
                    getBridge().getWebView().setBackgroundColor(Color.parseColor("#0B0C10"));
                } else {
                    getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
                }
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setOrientation(PluginCall call) {
        String orientation = call.getString("orientation", "portrait");
        if (getActivity() == null) {
            call.reject("Activity is not available");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                if ("landscape".equalsIgnoreCase(orientation)) {
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                } else if ("portrait".equalsIgnoreCase(orientation)) {
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                } else if ("sensor".equalsIgnoreCase(orientation) || "auto".equalsIgnoreCase(orientation)) {
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
                } else {
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                }
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Failed to set requested orientation: " + e.getMessage(), e);
                call.reject("Failed to set requested orientation: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void getOrientation(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity is not available");
            return;
        }

        int current = getActivity().getRequestedOrientation();
        String name = "portrait";
        if (current == ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE ||
            current == ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE ||
            current == ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE ||
            current == ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE) {
            name = "landscape";
        }
        JSObject ret = new JSObject();
        ret.put("orientation", name);
        call.resolve(ret);
    }

    @PluginMethod
    public void destroy(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopProgressTimer();
            if (getActivity() != null) {
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            }
            if (mPlayer != null) {
                mPlayer.stop();
                mPlayer.release();
                mPlayer = null;
            }
            if (mPlayerView != null) {
                ViewGroup parent = (ViewGroup) mPlayerView.getParent();
                if (parent != null) {
                    parent.removeView(mPlayerView);
                }
                mPlayerView = null;
            }
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setBackgroundColor(Color.parseColor("#0B0C10"));
            }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        stopProgressTimer();
        if (getActivity() != null) {
            getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
        if (mPlayer != null) {
            mPlayer.release();
            mPlayer = null;
        }
        if (mExecutor != null && !mExecutor.isShutdown()) {
            mExecutor.shutdown();
        }
    }
}
