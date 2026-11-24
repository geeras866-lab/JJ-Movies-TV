package com.jjmovies.tv;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.Toast;

import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.ArrayList;

public class VlcPlayerActivity extends Activity {
    private LibVLC libVLC;
    private MediaPlayer mediaPlayer;
    private VLCVideoLayout videoLayout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        videoLayout = new VLCVideoLayout(this);
        setContentView(videoLayout);

        String videoUrl = getIntent().getStringExtra("VIDEO_URL");
        if (videoUrl == null || videoUrl.isEmpty()) {
            Toast.makeText(this, "No video URL found", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        ArrayList<String> options = new ArrayList<>();
        options.add("--network-caching=1500");
        options.add("--aout=audiotrack");
        options.add("--avcodec-hw=any");

        libVLC = new LibVLC(this, options);
        mediaPlayer = new MediaPlayer(libVLC);
        mediaPlayer.attachViews(videoLayout, null, false, false);

        Media media = new Media(libVLC, Uri.parse(videoUrl));
        media.setHWDecoderEnabled(true, false);
        mediaPlayer.setMedia(media);
        media.release();
        mediaPlayer.play();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (mediaPlayer == null) return super.onKeyDown(keyCode, event);

        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.pause();
                    Toast.makeText(this, "Paused", Toast.LENGTH_SHORT).show();
                } else {
                    mediaPlayer.play();
                    Toast.makeText(this, "Playing", Toast.LENGTH_SHORT).show();
                }
                return true;

            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                mediaPlayer.setTime(mediaPlayer.getTime() + 10000);
                Toast.makeText(this, "+10s", Toast.LENGTH_SHORT).show();
                return true;

            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                mediaPlayer.setTime(Math.max(0, mediaPlayer.getTime() - 10000));
                Toast.makeText(this, "-10s", Toast.LENGTH_SHORT).show();
                return true;

            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_MENU:
                switchAudioTrack();
                return true;

            case KeyEvent.KEYCODE_BACK:
                finish();
                return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void switchAudioTrack() {
        MediaPlayer.TrackDescription[] tracks = mediaPlayer.getAudioTracks();
        if (tracks == null || tracks.length <= 1) {
            Toast.makeText(this, "Single audio track", Toast.LENGTH_SHORT).show();
            return;
        }
        int currentId = mediaPlayer.getAudioTrack();
        int nextIndex = 0;
        for (int i = 0; i < tracks.length; i++) {
            if (tracks[i].id == currentId) {
                nextIndex = (i + 1) % tracks.length;
                break;
            }
        }
        mediaPlayer.setAudioTrack(tracks[nextIndex].id);
        Toast.makeText(this, "Audio: " + tracks[nextIndex].name, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (mediaPlayer != null) {
            mediaPlayer.stop();
            mediaPlayer.detachViews();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (mediaPlayer != null) mediaPlayer.release();
        if (libVLC != null) libVLC.release();
    }
}
