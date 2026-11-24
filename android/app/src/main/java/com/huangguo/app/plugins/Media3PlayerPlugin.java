package com.huangguo.app.plugins;

import android.content.Context;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.View;
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

    // Dual-Player Pool (Slot 0 and Slot 1) for 0ms zero-latency seamless episode switching
    private final ExoPlayer[] mPlayers = new ExoPlayer[2];
    private final PlayerView[] mPlayerViews = new PlayerView[2];
    private final String[] mStreamUrls = new String[2];
    private FrameLayout mPlayerContainer;
    private int mActiveSlot = 0;

    private String mPreparedNextUrl = null;
    private boolean mIsNextPrepared = false;
    private float mCurrentSpeed = 1.0f;
    private float mCurrentVolume = 1.0f;
    private String mCurrentResizeMode = "fit";

    private final Handler mProgressHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService mExecutor = Executors.newFixedThreadPool(2);
    private boolean mIsProgressRunning = false;

    private static synchronized SimpleCache getCache(Context context) {
        if (sDownloadCache == null) {
            File cacheDir = new File(context.getCacheDir(), "media3_video_cache");
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }
            sDownloadCache = new SimpleCache(
                cacheDir,
                new LeastRecentlyUsedCacheEvictor(120 * 1024 * 1024), // 120MB LRU disk cache
                new StandaloneDatabaseProvider(context)
            );
        }
        return sDownloadCache;
    }

    private final Runnable mProgressRunnable = new Runnable() {
        @Override
        public void run() {
            ExoPlayer activeP = mPlayers[mActiveSlot];
            if (activeP != null && activeP.isPlaying()) {
                JSObject ret = new JSObject();
                double currentSec = activeP.getCurrentPosition() / 1000.0;
                double durationSec = activeP.getDuration() > 0 ? activeP.getDuration() / 1000.0 : 0.0;
                double bufferedSec = activeP.getBufferedPosition() / 1000.0;

                ret.put("currentTime", currentSec);
                ret.put("duration", durationSec);
                ret.put("bufferedPosition", bufferedSec);
                ret.put("activeSlot", mActiveSlot);
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

    private int getResizeModeConstant(String mode) {
        if ("zoom".equalsIgnoreCase(mode)) {
            return AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
        } else if ("fill".equalsIgnoreCase(mode)) {
            return AspectRatioFrameLayout.RESIZE_MODE_FILL;
        } else {
            return AspectRatioFrameLayout.RESIZE_MODE_FIT;
        }
    }

    private ExoPlayer createExoPlayer(Context context) {
        DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(context)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
            .setEnableDecoderFallback(true);
        return new ExoPlayer.Builder(context, renderersFactory).build();
    }

    private void ensureViewHierarchy(Context context) {
        if (mPlayerContainer != null) return;

        mPlayerContainer = new FrameLayout(context);
        mPlayerContainer.setBackgroundColor(Color.TRANSPARENT);

        int rm = getResizeModeConstant(mCurrentResizeMode);

        for (int i = 0; i < 2; i++) {
            PlayerView pv = new PlayerView(context);
            pv.setUseController(false);
            pv.setResizeMode(rm);
            pv.setShutterBackgroundColor(Color.TRANSPARENT);
            pv.setKeepContentOnPlayerReset(true);
            pv.setBackgroundColor(Color.TRANSPARENT);

            ExoPlayer player = createExoPlayer(context);
            pv.setPlayer(player);

            // Initial visibility: active slot is visible; standby slot is invisible
            pv.setVisibility(i == mActiveSlot ? View.VISIBLE : View.INVISIBLE);

            final int slot = i;
            player.addListener(createPlayerListener(slot));

            mPlayerViews[i] = pv;
            mPlayers[i] = player;

            mPlayerContainer.addView(pv, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
        }

        ViewGroup parent = (ViewGroup) getBridge().getWebView().getParent();
        if (parent != null) {
            int webViewIndex = parent.indexOfChild(getBridge().getWebView());
            getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
            parent.addView(mPlayerContainer, webViewIndex, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ));
        }
    }

    private Player.Listener createPlayerListener(final int slot) {
        return new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (slot == mActiveSlot) {
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
                            if (mPlayers[mActiveSlot] != null && mPlayers[mActiveSlot].isPlaying()) {
                                startProgressTimer();
                            }
                            break;
                        case Player.STATE_ENDED:
                            stateStr = "ended";
                            stopProgressTimer();
                            break;
                    }
                    stateObj.put("state", stateStr);
                    stateObj.put("slot", slot);
                    notifyListeners("playbackStateChanged", stateObj);
                } else {
                    // Standby pre-rendered slot ready state
                    if (playbackState == Player.STATE_READY) {
                        mIsNextPrepared = true;
                        JSObject obj = new JSObject();
                        obj.put("slot", slot);
                        obj.put("streamUrl", mStreamUrls[slot]);
                        notifyListeners("nextPrepared", obj);
                        Log.d(TAG, "Standby slot " + slot + " pre-rendered and ready for 0ms switch: " + mStreamUrls[slot]);
                    }
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (slot == mActiveSlot) {
                    JSObject playObj = new JSObject();
                    playObj.put("isPlaying", isPlaying);
                    notifyListeners("isPlayingChanged", playObj);

                    if (isPlaying) {
                        startProgressTimer();
                    } else {
                        stopProgressTimer();
                    }
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                if (slot == mActiveSlot) {
                    Log.e(TAG, "Active Media3 Player Error: " + error.getMessage(), error);
                    JSObject errObj = new JSObject();
                    errObj.put("message", error.getMessage());
                    errObj.put("errorCode", error.errorCode);
                    notifyListeners("playerError", errObj);
                    stopProgressTimer();
                } else {
                    Log.w(TAG, "Standby pre-render slot " + slot + " encountered error: " + error.getMessage());
                }
            }

            @Override
            public void onVideoSizeChanged(VideoSize videoSize) {
                if (slot == mActiveSlot) {
                    JSObject sizeObj = new JSObject();
                    sizeObj.put("width", videoSize.width);
                    sizeObj.put("height", videoSize.height);
                    notifyListeners("videoSizeChanged", sizeObj);
                }
            }
        };
    }

    private MediaSource createMediaSource(Context context, String streamUrl, JSObject headers) {
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

        CacheDataSource.Factory cacheFactory = new CacheDataSource.Factory()
            .setCache(getCache(context))
            .setUpstreamDataSourceFactory(httpDataSourceFactory)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);

        Uri videoUri = Uri.parse(streamUrl);
        if (streamUrl.contains(".m3u8") || streamUrl.contains("hls")) {
            return new HlsMediaSource.Factory(cacheFactory)
                .setAllowChunklessPreparation(true)
                .createMediaSource(MediaItem.fromUri(videoUri));
        } else {
            return new ProgressiveMediaSource.Factory(cacheFactory)
                .createMediaSource(MediaItem.fromUri(videoUri));
        }
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
        final String resizeMode = call.getString("resizeMode", mCurrentResizeMode);
        mCurrentResizeMode = resizeMode;

        getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();
                ensureViewHierarchy(context);

                int rm = getResizeModeConstant(mCurrentResizeMode);
                mPlayerViews[0].setResizeMode(rm);
                mPlayerViews[1].setResizeMode(rm);

                ExoPlayer activeP = mPlayers[mActiveSlot];

                // If already playing this url and initialized, resume cleanly
                if (streamUrl.equals(mStreamUrls[mActiveSlot]) && activeP != null && activeP.getPlaybackState() != Player.STATE_IDLE) {
                    if (startSeconds > 0) {
                        activeP.seekTo((long) (startSeconds * 1000));
                    }
                    if (autoPlay && !activeP.isPlaying()) {
                        activeP.play();
                    }
                    call.resolve(new JSObject().put("success", true).put("streamUrl", streamUrl));
                    return;
                }

                // If the other slot is already pre-rendered with this exact streamUrl, perform 0ms switch!
                int nextSlot = 1 - mActiveSlot;
                if (streamUrl.equals(mPreparedNextUrl) && mPlayers[nextSlot] != null && mIsNextPrepared) {
                    doSeamlessSwitch(streamUrl, autoPlay, headers, call);
                    return;
                }

                // Regular initialization on active slot
                mStreamUrls[mActiveSlot] = streamUrl;
                MediaSource mediaSource = createMediaSource(context, streamUrl, headers);
                activeP.setMediaSource(mediaSource);
                if (startSeconds > 0) {
                    activeP.seekTo((long) (startSeconds * 1000));
                }
                activeP.setVolume(mCurrentVolume);
                activeP.setPlaybackParameters(new PlaybackParameters(mCurrentSpeed));
                activeP.prepare();
                activeP.setPlayWhenReady(autoPlay);

                mPlayerViews[mActiveSlot].setVisibility(View.VISIBLE);
                mPlayerViews[mActiveSlot].bringToFront();

                // Stop idle standby slot
                if (mPlayers[nextSlot] != null) {
                    mPlayers[nextSlot].stop();
                }
                mPreparedNextUrl = null;
                mIsNextPrepared = false;

                call.resolve(new JSObject().put("success", true).put("streamUrl", streamUrl));
            } catch (Exception e) {
                Log.e(TAG, "Failed in initPlayer", e);
                call.reject("Failed in initPlayer: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void prepareNext(PluginCall call) {
        String streamUrl = call.getString("streamUrl");
        if (streamUrl == null || streamUrl.trim().isEmpty()) {
            call.reject("streamUrl is required");
            return;
        }
        final JSObject headers = call.getObject("headers");

        getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();
                ensureViewHierarchy(context);

                int nextSlot = 1 - mActiveSlot;
                ExoPlayer nextP = mPlayers[nextSlot];
                PlayerView nextV = mPlayerViews[nextSlot];

                if (streamUrl.equals(mPreparedNextUrl) && mIsNextPrepared) {
                    call.resolve(new JSObject().put("success", true).put("alreadyPrepared", true));
                    return;
                }

                mPreparedNextUrl = streamUrl;
                mStreamUrls[nextSlot] = streamUrl;
                mIsNextPrepared = false;

                // Pre-render in background standby slot in silence
                nextP.setVolume(0f);
                nextP.setPlaybackParameters(new PlaybackParameters(mCurrentSpeed));
                nextV.setVisibility(View.INVISIBLE);

                MediaSource mediaSource = createMediaSource(context, streamUrl, headers);
                nextP.setMediaSource(mediaSource);
                nextP.prepare();
                nextP.setPlayWhenReady(false);

                Log.d(TAG, "DualPlayer: pre-rendering next episode in slot " + nextSlot + ": " + streamUrl);
                call.resolve(new JSObject().put("success", true).put("slot", nextSlot).put("streamUrl", streamUrl));
            } catch (Exception e) {
                Log.w(TAG, "prepareNext failed: " + e.getMessage());
                call.reject("prepareNext failed: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void switchToNext(PluginCall call) {
        String streamUrl = call.getString("streamUrl");
        final boolean autoPlay = call.getBoolean("autoPlay", true);
        final JSObject headers = call.getObject("headers");

        getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();
                ensureViewHierarchy(context);
                doSeamlessSwitch(streamUrl, autoPlay, headers, call);
            } catch (Exception e) {
                Log.e(TAG, "switchToNext error: " + e.getMessage(), e);
                call.reject("switchToNext error: " + e.getMessage(), e);
            }
        });
    }

    private void doSeamlessSwitch(String streamUrl, boolean autoPlay, JSObject headers, PluginCall call) {
        int nextSlot = 1 - mActiveSlot;
        int oldSlot = mActiveSlot;

        ExoPlayer nextP = mPlayers[nextSlot];
        PlayerView nextV = mPlayerViews[nextSlot];
        ExoPlayer oldP = mPlayers[oldSlot];
        PlayerView oldV = mPlayerViews[oldSlot];

        boolean isHit = (streamUrl == null || streamUrl.isEmpty() || streamUrl.equals(mPreparedNextUrl));

        if (isHit && nextP != null && (nextP.getPlaybackState() == Player.STATE_READY || nextP.getPlaybackState() == Player.STATE_BUFFERING)) {
            // 0ms HIT! Instant flip
            mActiveSlot = nextSlot;

            nextV.bringToFront();
            nextV.setVisibility(View.VISIBLE);
            oldV.setVisibility(View.INVISIBLE);
            oldP.stop();

            nextP.setVolume(mCurrentVolume);
            nextP.setPlaybackParameters(new PlaybackParameters(mCurrentSpeed));
            nextP.setPlayWhenReady(autoPlay);

            triggerHaptic("light");
            startProgressTimer();

            if (nextP.getVideoSize() != null && nextP.getVideoSize().width > 0) {
                JSObject sizeObj = new JSObject();
                sizeObj.put("width", nextP.getVideoSize().width);
                sizeObj.put("height", nextP.getVideoSize().height);
                notifyListeners("videoSizeChanged", sizeObj);
            }
            JSObject stateObj = new JSObject();
            stateObj.put("state", "ready");
            notifyListeners("playbackStateChanged", stateObj);

            mPreparedNextUrl = null;
            mIsNextPrepared = false;

            Log.d(TAG, "DualPlayer: 0ms seamless switch HIT! from slot " + oldSlot + " to slot " + mActiveSlot);
            if (call != null) {
                call.resolve(new JSObject()
                    .put("success", true)
                    .put("zeroDelayHit", true)
                    .put("activeSlot", mActiveSlot)
                );
            }
        } else {
            // Miss: normal fast switch
            Log.d(TAG, "DualPlayer: switch MISS. Falling back to normal load on slot " + nextSlot);
            mActiveSlot = nextSlot;
            nextV.bringToFront();
            nextV.setVisibility(View.VISIBLE);
            oldV.setVisibility(View.INVISIBLE);
            oldP.stop();

            if (streamUrl != null && !streamUrl.isEmpty()) {
                mStreamUrls[mActiveSlot] = streamUrl;
                MediaSource ms = createMediaSource(getContext(), streamUrl, headers);
                nextP.setMediaSource(ms);
                nextP.setVolume(mCurrentVolume);
                nextP.setPlaybackParameters(new PlaybackParameters(mCurrentSpeed));
                nextP.prepare();
                nextP.setPlayWhenReady(autoPlay);
            }

            mPreparedNextUrl = null;
            mIsNextPrepared = false;

            if (call != null) {
                call.resolve(new JSObject()
                    .put("success", true)
                    .put("zeroDelayHit", false)
                    .put("activeSlot", mActiveSlot)
                );
            }
        }
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        String type = call.getString("type", "light");
        triggerHaptic(type);
        call.resolve();
    }

    private void triggerHaptic(String type) {
        try {
            if (getActivity() == null) return;
            Vibrator vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    int effectId = VibrationEffect.EFFECT_CLICK;
                    if ("medium".equalsIgnoreCase(type)) {
                        effectId = VibrationEffect.EFFECT_TICK;
                    } else if ("heavy".equalsIgnoreCase(type)) {
                        effectId = VibrationEffect.EFFECT_HEAVY_CLICK;
                    } else if ("selection".equalsIgnoreCase(type)) {
                        effectId = VibrationEffect.EFFECT_TICK;
                    }
                    vibrator.vibrate(VibrationEffect.createPredefined(effectId));
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(20);
                }
            }
        } catch (Exception e) {
            // Silently ignore haptic failures on unsupported hardware
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ExoPlayer activeP = mPlayers[mActiveSlot];
            if (activeP != null) {
                activeP.play();
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
            ExoPlayer activeP = mPlayers[mActiveSlot];
            if (activeP != null) {
                activeP.pause();
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
            ExoPlayer activeP = mPlayers[mActiveSlot];
            if (activeP != null) {
                activeP.seekTo((long) (seconds * 1000));
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        });
    }

    @PluginMethod
    public void setSpeed(PluginCall call) {
        Double speed = call.getDouble("speed", 1.0);
        mCurrentSpeed = speed.floatValue();
        getActivity().runOnUiThread(() -> {
            ExoPlayer activeP = mPlayers[mActiveSlot];
            if (activeP != null) {
                activeP.setPlaybackParameters(new PlaybackParameters(mCurrentSpeed));
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double volume = call.getDouble("volume", 1.0);
        mCurrentVolume = volume.floatValue();
        getActivity().runOnUiThread(() -> {
            ExoPlayer activeP = mPlayers[mActiveSlot];
            if (activeP != null) {
                activeP.setVolume(mCurrentVolume);
                call.resolve();
            } else {
                call.reject("Player not initialized");
            }
        });
    }

    @PluginMethod
    public void setResizeMode(PluginCall call) {
        String mode = call.getString("mode", "fit");
        mCurrentResizeMode = mode;
        final int rm = getResizeModeConstant(mode);
        getActivity().runOnUiThread(() -> {
            if (mPlayerViews[0] != null) mPlayerViews[0].setResizeMode(rm);
            if (mPlayerViews[1] != null) mPlayerViews[1].setResizeMode(rm);
            call.resolve();
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

                // Prefetch first 800KB (manifest + initial HLS segments)
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
            if (mPlayerContainer != null) {
                mPlayerContainer.setVisibility(visible ? View.VISIBLE : View.GONE);
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
            for (int i = 0; i < 2; i++) {
                if (mPlayers[i] != null) {
                    mPlayers[i].stop();
                    mPlayers[i].release();
                    mPlayers[i] = null;
                }
                mPlayerViews[i] = null;
                mStreamUrls[i] = null;
            }
            if (mPlayerContainer != null) {
                ViewGroup parent = (ViewGroup) mPlayerContainer.getParent();
                if (parent != null) {
                    parent.removeView(mPlayerContainer);
                }
                mPlayerContainer = null;
            }
            mPreparedNextUrl = null;
            mIsNextPrepared = false;
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
        for (int i = 0; i < 2; i++) {
            if (mPlayers[i] != null) {
                mPlayers[i].release();
                mPlayers[i] = null;
            }
        }
        if (mExecutor != null && !mExecutor.isShutdown()) {
            mExecutor.shutdown();
        }
    }
}
