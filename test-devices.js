const { listDevices } = require('./native-recorder/device-utils');

(async () => {
    try {
        console.log('Listing devices...');
        const devices = await listDevices();
        console.log('Video Devices:', JSON.stringify(devices.video, null, 2));
        console.log('Audio Devices:', JSON.stringify(devices.audio, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
})();
