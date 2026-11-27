package com.jjmovies.tv;

import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.RelativeLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;
import java.util.ArrayList;
import java.util.Locale;

public class VlcPlayerActivity extends AppCompatActivity {

    public static final String EXTRA_VIDEO_URL = "video_url";
    public static final String EXTRA_VIDEO_TITLE = "video_title";

    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;
    private VLCVideoLayout videoLayout;
    private RelativeLayout controlsOverlay, tracksOverlay;
    private LinearLayout loadingBox, audioTracksContainer, subtitleTracksContainer;
    private SeekBar seekBar, subtitleSizeSeekBar;
    private TextView tvCurrentTime, tvTotalTime, tvTitle, tvBufferingText, tvSubtitleSizeVal;
    private ImageButton btnPlayPause, btnTracks;

    private String rawVideoUrl = "";
    private String movieDisplayTitle = "JJ Movies TV";
    private int subtitleSizeIndex = 1;
    private final String[] subSizeLabels = { "Small", "Normal", "Large", "Extra Large" };
    private final String[] subRelValues = { "24", "18", "14", "10" };

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean isUserSeeking = false;
    private boolean controlsVisible = true;
    private int aspectMode = 0;

    private int dpadSeekStreak = 0;
    private int lastSeekKeyCode = 0;
    private long lastSeekEventMs = 0L;

    private final MediaPlayer.ScaleType[] scaleTypes = {
        MediaPlayer.ScaleType.SURFACE_BEST_FIT,
        MediaPlayer.ScaleType.SURFACE_FILL,
        MediaPlayer.ScaleType.SURFACE_FIT_SCREEN,
        MediaPlayer.ScaleType.SURFACE_16_9
    };
    private final String[] scaleNames = { "Best Fit", "Fill Screen", "Zoom / Crop", "16:9" };

    private final Runnable hideControlsRunnable = () -> {
        if (controlsOverlay != null && mediaPlayer != null && mediaPlayer.isPlaying() && !isTracksOpen()) {
            controlsOverlay.setVisibility(View.GONE);
            controlsVisible = false;
            hideSystemUi();
        }
    };

    private final Runnable progressUpdater = new Runnable() {
        @Override
        public void run() {
            if (mediaPlayer != null && !isUserSeeking) {
                long total = mediaPlayer.getLength();
                long current = mediaPlayer.getTime();
                if (total > 0) {
                    seekBar.setMax((int) total);
                    seekBar.setProgress((int) Math.max(0, current));
                    tvCurrentTime.setText(formatTime(current));
                    tvTotalTime.setText(formatTime(total));
                }
            }
            handler.postDelayed(this, 500);
        }
    };

    private boolean isTracksOpen() {
        return tracksOverlay != null && tracksOverlay.getVisibility() == View.VISIBLE;
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    private void showControls() {
        if (controlsOverlay != null) {
            controlsOverlay.setVisibility(View.VISIBLE);
            controlsVisible = true;
            if (!isTracksOpen() && btnPlayPause != null && getCurrentFocus() == null) {
                btnPlayPause.requestFocus();
            }
        }
        scheduleHideControls();
    }

    private void scheduleHideControls() {
        handler.removeCallbacks(hideControlsRunnable);
        handler.postDelayed(hideControlsRunnable, 4500);
    }

    private String formatTime(long ms) {
        if (ms <= 0) return "0:00";
        long totalSec = ms / 1000;
        long hours = totalSec / 3600;
        long mins = (totalSec % 3600) / 60;
        long secs = totalSec % 60;
        if (hours > 0) {
            return String.format(Locale.US, "%d:%02d:%02d", hours, mins, secs);
        }
        return String.format(Locale.US, "%d:%02d", mins, secs);
    }

    private String cleanRipperTags(String raw) {
        if (raw == null) return "";
        String s = raw.trim();
        s = s.replaceAll("(?i)\\b(team\\s*movies|1tamilmv|tamilmv|tamilrockers|movierulz|bolly4u|katmoviehd|vegamovies|uhdmovies|olamovies|filmyzilla|desiremovies|hdhub4u|mkvcinemas|ssrmovies|worldfree4u|telly|hon3y|psa|yify|rarbg|flux|ntb|cmrg|qxr|utr|tigole)\\b", " ");
        s = s.replaceAll("(?i)(www\\.[a-z0-9.-]+|@[a-z0-9_]+|t\\.me/\\S+)", " ");
        s = s.replaceAll("(?i)^track\\s*\\d+\\s*[-:|]?\\s*", "");
        s = s.replaceAll("\\[\\s*\\]", "").replaceAll("\\(\\s*\\)", "");
        s = s.replaceAll("\\s*-\\s*-\\s*", " - ");
        s = s.replaceAll("^[\\s\\-:|]+|[\\s\\-:|]+$", "");
        s = s.replaceAll("\\s+", " ").trim();
        return s;
    }

    private String formatAudioTrackLabel(String raw, int fallbackNum) {
        String cleaned = cleanRipperTags(raw);
        cleaned = cleaned.replaceAll("(?i)^jj\\s*[-:|]?\\s*", "").trim();
        if (cleaned.isEmpty()) {
            cleaned = "Audio " + fallbackNum;
        }
        return "JJ - " + cleaned;
    }

    private String formatSubtitleTrackLabel(String raw, int fallbackNum) {
        String cleaned = cleanRipperTags(raw);
        cleaned = cleaned.replaceAll("(?i)^jj\\s*[-:|]?\\s*", "").trim();
        String safeMovie = movieDisplayTitle != null ? movieDisplayTitle.trim() : "Movie";
        if (!safeMovie.isEmpty() && cleaned.toLowerCase(Locale.US).startsWith(safeMovie.toLowerCase(Locale.US))) {
            cleaned = cleaned.substring(safeMovie.length()).replaceAll("^[\\s\\-:|]+", "").trim();
        }
        if (cleaned.isEmpty()) {
            return "JJ - " + safeMovie;
        }
        return "JJ - " + safeMovie + " - " + cleaned;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
        setContentView(R.layout.activity_vlc_player);

        rawVideoUrl = getIntent().getStringExtra(EXTRA_VIDEO_URL);
        String titleExtra = getIntent().getStringExtra(EXTRA_VIDEO_TITLE);
        if (titleExtra != null && !titleExtra.trim().isEmpty()) {
            movieDisplayTitle = titleExtra.trim();
        }
        if (rawVideoUrl == null || rawVideoUrl.trim().isEmpty()) {
            Toast.makeText(this, "Invalid video URL", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        SharedPreferences prefs = getSharedPreferences("jj_tv_player", MODE_PRIVATE);
        subtitleSizeIndex = Math.max(0, Math.min(3, prefs.getInt("sub_size_idx", 1)));

        videoLayout = findViewById(R.id.vlc_video_layout);
        controlsOverlay = findViewById(R.id.controls_overlay);
        tracksOverlay = findViewById(R.id.tracks_overlay);
        loadingBox = findViewById(R.id.vlc_loading_box);
        tvBufferingText = findViewById(R.id.tv_buffering_text);
        seekBar = findViewById(R.id.vlc_seekbar);
        tvCurrentTime = findViewById(R.id.tv_current_time);
        tvTotalTime = findViewById(R.id.tv_total_time);
        tvTitle = findViewById(R.id.tv_video_title);
        btnPlayPause = findViewById(R.id.btn_play_pause);
        btnTracks = findViewById(R.id.btn_tracks);
        audioTracksContainer = findViewById(R.id.audio_tracks_container);
        subtitleTracksContainer = findViewById(R.id.subtitle_tracks_container);
        tvSubtitleSizeVal = findViewById(R.id.tv_subtitle_size_val);
        subtitleSizeSeekBar = findViewById(R.id.subtitle_size_seekbar);

        ImageButton btnBack = findViewById(R.id.btn_back);
        ImageButton btnAspect = findViewById(R.id.btn_aspect);

        if (tvTitle != null) tvTitle.setText(movieDisplayTitle);
        if (tvSubtitleSizeVal != null) tvSubtitleSizeVal.setText(subSizeLabels[subtitleSizeIndex]);
        if (subtitleSizeSeekBar != null) subtitleSizeSeekBar.setProgress(subtitleSizeIndex);

        initVlcEngine(0L);
        handler.post(progressUpdater);
        scheduleHideControls();

        if (btnBack != null) btnBack.setOnClickListener(v -> finish());
        if (btnTracks != null) btnTracks.setOnClickListener(v -> openTracksPanel());
        if (tracksOverlay != null) tracksOverlay.setOnClickListener(v -> closeTracksPanel());
        if (btnPlayPause != null) {
            btnPlayPause.setOnClickListener(v -> { togglePlayPause(); scheduleHideControls(); });
            btnPlayPause.requestFocus();
        }
        if (btnAspect != null) {
            btnAspect.setOnClickListener(v -> {
                aspectMode = (aspectMode + 1) % scaleTypes.length;
                if (mediaPlayer != null) mediaPlayer.setVideoScale(scaleTypes[aspectMode]);
                Toast.makeText(this, scaleNames[aspectMode], Toast.LENGTH_SHORT).show();
                scheduleHideControls();
            });
        }

        if (subtitleSizeSeekBar != null) {
            subtitleSizeSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                    int idx = Math.max(0, Math.min(3, progress));
                    if (tvSubtitleSizeVal != null) tvSubtitleSizeVal.setText(subSizeLabels[idx]);
                }
                @Override
                public void onStartTrackingTouch(SeekBar sb) {}
                @Override
                public void onStopTrackingTouch(SeekBar sb) {
                    int idx = Math.max(0, Math.min(3, sb.getProgress()));
                    if (idx != subtitleSizeIndex) {
                        subtitleSizeIndex = idx;
                        prefs.edit().putInt("sub_size_idx", idx).apply();
                        long pos = mediaPlayer != null ? Math.max(0L, mediaPlayer.getTime()) : 0L;
                        initVlcEngine(pos);
                    }
                }
            });
        }

        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                if (fromUser) {
                    tvCurrentTime.setText(formatTime(progress));
                    if (mediaPlayer != null && mediaPlayer.getLength() > 0) {
                        mediaPlayer.setTime(progress);
                    }
                }
            }
            @Override
            public void onStartTrackingTouch(SeekBar sb) {
                isUserSeeking = true;
                handler.removeCallbacks(hideControlsRunnable);
            }
            @Override
            public void onStopTrackingTouch(SeekBar sb) {
                isUserSeeking = false;
                if (mediaPlayer != null && mediaPlayer.getLength() > 0) {
                    mediaPlayer.setTime(sb.getProgress());
                }
                scheduleHideControls();
            }
        });
    }

    private void initVlcEngine(long resumePositionMs) {
        int prevAudio = mediaPlayer != null ? mediaPlayer.getAudioTrack() : -2;
        int prevSpu = mediaPlayer != null ? mediaPlayer.getSpuTrack() : -2;

        if (mediaPlayer != null) {
            mediaPlayer.stop();
            mediaPlayer.detachViews();
            mediaPlayer.release();
            mediaPlayer = null;
        }
        if (libVLC != null) {
            libVLC.release();
            libVLC = null;
        }

        ArrayList<String> options = new ArrayList<>();
        options.add("--audio-time-stretch");
        options.add("--network-caching=3000");
        options.add("--file-caching=1500");
        options.add("--http-reconnect");
        options.add("--freetype-rel-fontsize=" + subRelValues[subtitleSizeIndex]);

        libVLC = new LibVLC(this, options);
        mediaPlayer = new MediaPlayer(libVLC);
        mediaPlayer.attachViews(videoLayout, null, false, false);

        mediaPlayer.setEventListener(event -> runOnUiThread(() -> {
            if (event.type == MediaPlayer.Event.Playing) {
                loadingBox.setVisibility(View.GONE);
                btnPlayPause.setImageResource(R.drawable.ic_vlc_pause);
                scheduleHideControls();
            } else if (event.type == MediaPlayer.Event.Paused) {
                btnPlayPause.setImageResource(R.drawable.ic_vlc_play);
                showControls();
            } else if (event.type == MediaPlayer.Event.Buffering) {
                float buf = event.getBuffering();
                if (buf >= 100f) {
                    loadingBox.setVisibility(View.GONE);
                } else {
                    loadingBox.setVisibility(View.VISIBLE);
                    if (tvBufferingText != null) {
                        tvBufferingText.setText("Buffering " + Math.max(0, (int) buf) + "%");
                    }
                }
            } else if (event.type == MediaPlayer.Event.EncounteredError) {
                loadingBox.setVisibility(View.GONE);
                Toast.makeText(this, "Playback error. Try Server 2.", Toast.LENGTH_LONG).show();
            }
        }));

        String safeUrl = rawVideoUrl.trim().replace(" ", "%20").replace("(", "%28").replace(")", "%29");
        Media media = new Media(libVLC, Uri.parse(safeUrl));
        media.setHWDecoderEnabled(true, true);
        media.addOption(":network-caching=3000");
        media.addOption(":http-reconnect");
        media.addOption(":freetype-rel-fontsize=" + subRelValues[subtitleSizeIndex]);
        mediaPlayer.setMedia(media);
        media.release();

        mediaPlayer.play();
        if (resumePositionMs > 0L) {
            handler.postDelayed(() -> {
                if (mediaPlayer != null) {
                    mediaPlayer.setTime(resumePositionMs);
                    if (prevAudio != -2) mediaPlayer.setAudioTrack(prevAudio);
                    if (prevSpu != -2) mediaPlayer.setSpuTrack(prevSpu);
                }
            }, 450);
        }
    }

    private void openTracksPanel() {
        if (tracksOverlay == null) return;
        handler.removeCallbacks(hideControlsRunnable);
        populateTracksColumns();
        tracksOverlay.setVisibility(View.VISIBLE);
    }

    private void closeTracksPanel() {
        if (tracksOverlay != null) {
            tracksOverlay.setVisibility(View.GONE);
        }
        if (btnTracks != null) btnTracks.requestFocus();
        scheduleHideControls();
    }

    private TextView createTrackRowView(String label, boolean isSelected) {
        TextView tv = new TextView(this);
        tv.setText((isSelected ? "✓  " : "     ") + label);
        tv.setTextColor(isSelected ? Color.WHITE : Color.parseColor("#CBD5E1"));
        tv.setTextSize(14f);
        tv.setTypeface(null, isSelected ? Typeface.BOLD : Typeface.NORMAL);
        tv.setBackgroundResource(R.drawable.bg_track_item);
        tv.setPadding(24, 22, 24, 22);
        tv.setFocusable(true);
        tv.setClickable(true);
        return tv;
    }

    private void populateTracksColumns() {
        if (mediaPlayer == null || audioTracksContainer == null || subtitleTracksContainer == null) return;

        audioTracksContainer.removeAllViews();
        int currentAudioId = mediaPlayer.getAudioTrack();
        TextView audioDisable = createTrackRowView("Disable", currentAudioId == -1);
        audioDisable.setOnClickListener(v -> {
            mediaPlayer.setAudioTrack(-1);
            populateTracksColumns();
        });
        audioTracksContainer.addView(audioDisable);

        View firstFocusTarget = audioDisable;
        MediaPlayer.TrackDescription[] audioTracks = mediaPlayer.getAudioTracks();
        int aIdx = 1;
        if (audioTracks != null) {
            for (MediaPlayer.TrackDescription td : audioTracks) {
                if (td.id == -1) continue;
                String cleanLabel = formatAudioTrackLabel(td.name, aIdx++);
                boolean selected = (td.id == currentAudioId);
                TextView row = createTrackRowView(cleanLabel, selected);
                final int trackId = td.id;
                row.setOnClickListener(v -> {
                    mediaPlayer.setAudioTrack(trackId);
                    populateTracksColumns();
                });
                audioTracksContainer.addView(row);
                if (selected) firstFocusTarget = row;
            }
        }

        subtitleTracksContainer.removeAllViews();
        int currentSpuId = mediaPlayer.getSpuTrack();
        TextView subDisable = createTrackRowView("Disable", currentSpuId == -1);
        subDisable.setOnClickListener(v -> {
            mediaPlayer.setSpuTrack(-1);
            populateTracksColumns();
        });
        subtitleTracksContainer.addView(subDisable);

        MediaPlayer.TrackDescription[] spuTracks = mediaPlayer.getSpuTracks();
        int sIdx = 1;
        if (spuTracks != null) {
            for (MediaPlayer.TrackDescription td : spuTracks) {
                if (td.id == -1) continue;
                String cleanLabel = formatSubtitleTrackLabel(td.name, sIdx++);
                boolean selected = (td.id == currentSpuId);
                TextView row = createTrackRowView(cleanLabel, selected);
                final int spuId = td.id;
                row.setOnClickListener(v -> {
                    mediaPlayer.setSpuTrack(spuId);
                    populateTracksColumns();
                });
                subtitleTracksContainer.addView(row);
            }
        }

        if (firstFocusTarget != null) {
            firstFocusTarget.requestFocus();
        }
    }

    private void togglePlayPause() {
        if (mediaPlayer == null) return;
        if (mediaPlayer.isPlaying()) {
            mediaPlayer.pause();
            btnPlayPause.setImageResource(R.drawable.ic_vlc_play);
        } else {
            mediaPlayer.play();
            btnPlayPause.setImageResource(R.drawable.ic_vlc_pause);
        }
    }

    private long computeStepMs(int keyCode, KeyEvent event) {
        long now = System.currentTimeMillis();
        if (keyCode == lastSeekKeyCode && (now - lastSeekEventMs) < 900L) {
            dpadSeekStreak++;
        } else {
            dpadSeekStreak = 1;
        }
        lastSeekKeyCode = keyCode;
        lastSeekEventMs = now;

        if (event.getRepeatCount() >= 5 || dpadSeekStreak >= 6) return 60000L;
        if (event.getRepeatCount() >= 2 || dpadSeekStreak >= 3) return 30000L;
        return 10000L;
    }

    private void performSeekStep(int keyCode, KeyEvent event, int direction) {
        if (mediaPlayer == null) return;
        long stepMs = computeStepMs(keyCode, event);
        long curTime = Math.max(0L, mediaPlayer.getTime());
        long length = mediaPlayer.getLength();
        long target = curTime + (direction * stepMs);
        if (target < 0L) target = 0L;
        if (length > 0L && target > length) target = Math.max(0L, length - 2000L);

        mediaPlayer.setTime(target);
        if (length > 0L) {
            seekBar.setMax((int) length);
            seekBar.setProgress((int) target);
            tvCurrentTime.setText(formatTime(target));
            tvTotalTime.setText(formatTime(length));
        }

        long sec = stepMs / 1000L;
        String prefix = direction > 0 ? "+" : "-";
        Toast.makeText(this, prefix + sec + "s (" + formatTime(target) + ")", Toast.LENGTH_SHORT).show();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (isTracksOpen()) {
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
                closeTracksPanel();
                return true;
            }
            return super.onKeyDown(keyCode, event);
        }

        if (mediaPlayer != null) {
            if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
                togglePlayPause();
                showControls();
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) {
                if (controlsVisible && getCurrentFocus() == seekBar) {
                    performSeekStep(keyCode, event, +1);
                    scheduleHideControls();
                    return true;
                }
                if (!controlsVisible) {
                    performSeekStep(keyCode, event, +1);
                    return true;
                }
                scheduleHideControls();
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND) {
                if (controlsVisible && getCurrentFocus() == seekBar) {
                    performSeekStep(keyCode, event, -1);
                    scheduleHideControls();
                    return true;
                }
                if (!controlsVisible) {
                    performSeekStep(keyCode, event, -1);
                    return true;
                }
                scheduleHideControls();
            }
            if (!controlsVisible) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    showControls();
                    if (btnPlayPause != null) btnPlayPause.requestFocus();
                    return true;
                }
                if (keyCode == KeyEvent.KEYCODE_DPAD_UP || keyCode == KeyEvent.KEYCODE_MENU) {
                    openTracksPanel();
                    return true;
                }
            } else {
                if (keyCode == KeyEvent.KEYCODE_MENU) {
                    openTracksPanel();
                    return true;
                }
                scheduleHideControls();
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (mediaPlayer != null) mediaPlayer.stop();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
        if (mediaPlayer != null) {
            mediaPlayer.detachViews();
            mediaPlayer.release();
            mediaPlayer = null;
        }
        if (libVLC != null) {
            libVLC.release();
            libVLC = null;
        }
    }
}
