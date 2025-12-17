const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { listDevices } = require('./device-utils');

class NativeRecorder {
    constructor() {
        this.ffmpegProcess = null;
        this.recordingPath = null;
    }

    /**
     * Start native recording
     * @param {string} videoDeviceIndex - Index of the screen (e.g., "5" for Capture screen 0)
     * @param {string} audioDeviceIndex - Index of the microphone (or null for no audio)
     * @param {string} outputPath - Full path to save the recording
     * @returns {Promise<string>} - Resolves with outputPath when started
     */
    async start(videoDeviceIndex, audioDeviceIndex, outputPath) {
        if (this.ffmpegProcess) {
            throw new Error('Recording already in progress');
        }

        this.recordingPath = outputPath;
        console.log(`[NativeRecorder] Starting recording to ${outputPath}`);
        console.log(`[NativeRecorder] Video Index: ${videoDeviceIndex}, Audio Index: ${audioDeviceIndex}`);

        // Build FFmpeg arguments
        // ffmpeg -f avfoundation -framerate 60 -i "5:0" -c:v h264_videotoolbox -b:v 10M -y output.mp4

        const inputArg = audioDeviceIndex ? `${videoDeviceIndex}:${audioDeviceIndex}` : `${videoDeviceIndex}`;

        const args = [
            '-f', 'avfoundation',
            '-framerate', '60',
            '-capture_cursor', '1',
            '-capture_mouse_clicks', '1',
            '-i', inputArg,
            '-c:v', 'h264_videotoolbox', // Hardware acceleration
            '-b:v', '12M',               // High bitrate
            '-pix_fmt', 'yuv420p',       // Compatible pixel format
            '-y',                        // Overwrite output
            outputPath
        ];

        // If audio is present, set audio codec
        if (audioDeviceIndex) {
            args.push('-c:a', 'aac');
            args.push('-b:a', '192k');
        }

        console.log('[NativeRecorder] Spawn command: ffmpeg', args.join(' '));

        return new Promise((resolve, reject) => {
            this.ffmpegProcess = spawn('ffmpeg', args);

            let started = false;
            let errorLog = '';

            this.ffmpegProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                errorLog += msg;
                // console.log('[NativeRecorder FFmpeg]', msg); // Verbose logging

                // Check for start confirmation
                // typically "Press [q] to stop" or general progress
                if (!started && (msg.includes('Press [q] to stop') || msg.includes('frame='))) {
                    started = true;
                    resolve(outputPath);
                }
            });

            this.ffmpegProcess.on('error', (err) => {
                console.error('[NativeRecorder] Process error:', err);
                if (!started) reject(err);
            });

            this.ffmpegProcess.on('close', (code) => {
                console.log(`[NativeRecorder] Process exited with code ${code}`);
                this.ffmpegProcess = null;
                if (!started && code !== 0 && code !== 255) { // 255 is normal SIGTERM exit
                    reject(new Error(`FFmpeg exited with code ${code}. Log: ${errorLog}`));
                }
            });

            // Safety timeout
            setTimeout(() => {
                if (!started && this.ffmpegProcess) {
                    // Usually FFmpeg starts printing stats quickly. 
                    // If it takes too long, assumes it 'started' but maybe stderr format is different across versions.
                    // But if it failed, it would have exited.
                    console.log('[NativeRecorder] Timeout waiting for start confirmation, assuming running...');
                    started = true;
                    resolve(outputPath);
                }
            }, 3000);
        });
    }

    /**
     * Stop recording
     * @returns {Promise<string>} - Resolves with recordingPath
     */
    async stop() {
        if (!this.ffmpegProcess) {
            return null;
        }

        console.log('[NativeRecorder] Stopping recording...');

        return new Promise((resolve) => {
            this.ffmpegProcess.removeAllListeners('close');
            this.ffmpegProcess.on('close', () => {
                console.log('[NativeRecorder] Stopped cleanly');
                this.ffmpegProcess = null;
                resolve(this.recordingPath);
            });

            // Send 'q' to quit gracefully (better than SIGTERM for MP4 integrity)
            this.ffmpegProcess.stdin.write('q');

            // Fallback kill if it doesn't stop
            setTimeout(() => {
                if (this.ffmpegProcess) {
                    console.log('[NativeRecorder] Force killing...');
                    this.ffmpegProcess.kill('SIGTERM');
                }
            }, 2000);
        });
    }

    /**
     * Find best matching device index by name
     */
    async findDeviceIndex(deviceName, type = 'video') {
        const devices = await listDevices();
        const list = type === 'video' ? devices.video : devices.audio;

        // Exact match
        let match = list.find(d => d.name === deviceName);
        if (match) return match.index;

        // Fuzzy / Contains match
        match = list.find(d => d.name.toLowerCase().includes(deviceName.toLowerCase()) || deviceName.toLowerCase().includes(d.name.toLowerCase()));
        if (match) return match.index;

        return null;
    }

    /**
     * Get the screen device index
     * Defaults to "Capture screen 0"
     */
    async getScreenDeviceIndex() {
        const devices = await listDevices();
        // Look for "Capture screen 0" specifically for primary screen
        const screen = devices.video.find(d => d.name.includes('Capture screen 0'));
        if (screen) return screen.index;

        // Fallback to any screen
        const anyScreen = devices.video.find(d => d.name.includes('Capture screen'));
        return anyScreen ? anyScreen.index : null;
    }
}

module.exports = new NativeRecorder();
