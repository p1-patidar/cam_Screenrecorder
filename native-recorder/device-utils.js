const { spawn } = require('child_process');

/**
 * Parses FFmpeg output to find AVFoundation device indices.
 * returns { video: [], audio: [] }
 */
function listDevices() {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', '']);

        let output = '';

        ffmpeg.stderr.on('data', (data) => {
            output += data.toString();
        });

        ffmpeg.on('close', (code) => {
            // FFmpeg exits with error when just listing devices, which is expected
            const devices = parseDeviceOutput(output);
            resolve(devices);
        });

        ffmpeg.on('error', (err) => {
            reject(err);
        });
    });
}

function parseDeviceOutput(output) {
    const videoDevices = [];
    const audioDevices = [];
    let currentSection = null; // 'video' or 'audio'

    const lines = output.split('\n');

    for (const line of lines) {
        if (line.includes('AVFoundation video devices:')) {
            currentSection = 'video';
            continue;
        } else if (line.includes('AVFoundation audio devices:')) {
            currentSection = 'audio';
            continue;
        }

        // Example line: [AVFoundation indev @ 0x...] [1] FaceTime HD Camera
        const match = line.match(/\[(\d+)\]\s+(.+)$/);

        if (match && currentSection) {
            const index = match[1];
            const name = match[2].trim();

            if (currentSection === 'video') {
                videoDevices.push({ index, name });
            } else {
                audioDevices.push({ index, name });
            }
        }
    }

    return { video: videoDevices, audio: audioDevices };
}

module.exports = { listDevices };
