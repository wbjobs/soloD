let localStream = null;
let peerConnection = null;
let dataChannel = null;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const createOfferBtn = document.getElementById('createOfferBtn');
const copyOfferBtn = document.getElementById('copyOfferBtn');
const setAnswerBtn = document.getElementById('setAnswerBtn');
const createAnswerBtn = document.getElementById('createAnswerBtn');
const copyAnswerBtn = document.getElementById('copyAnswerBtn');
const clearCanvasBtn = document.getElementById('clearCanvasBtn');

const offerSdp = document.getElementById('offerSdp');
const answerSdpInput = document.getElementById('answerSdp');
const remoteOfferSdp = document.getElementById('remoteOfferSdp');
const answerOutput = document.getElementById('answerOutput');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localCanvas = document.getElementById('localCanvas');
const remoteCanvas = document.getElementById('remoteCanvas');
const localCtx = localCanvas.getContext('2d');
const remoteCtx = remoteCanvas.getContext('2d');

const colorPicker = document.getElementById('colorPicker');
const lineWidthSlider = document.getElementById('lineWidth');
const lineWidthValue = document.getElementById('lineWidthValue');

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = '#ff0000';
let currentLineWidth = 3;

let localVideoWidth = 0;
let localVideoHeight = 0;
let remoteVideoWidth = 0;
let remoteVideoHeight = 0;

const drawBuffer = [];
let isProcessingBuffer = false;
const MAX_BUFFER_SIZE = 100;

const DRAW_DATA_VERSION = 1;

function getVideoDisplayRect(videoElement) {
    const videoRect = videoElement.getBoundingClientRect();
    const videoWidth = videoElement.videoWidth || videoRect.width;
    const videoHeight = videoElement.videoHeight || videoRect.height;
    
    if (videoWidth === 0 || videoHeight === 0) {
        return {
            x: 0,
            y: 0,
            width: videoRect.width,
            height: videoRect.height,
            scaleX: 1,
            scaleY: 1
        };
    }
    
    const videoRatio = videoWidth / videoHeight;
    const displayRatio = videoRect.width / videoRect.height;
    
    let displayWidth, displayHeight;
    
    if (videoRatio > displayRatio) {
        displayWidth = videoRect.width;
        displayHeight = videoRect.width / videoRatio;
    } else {
        displayHeight = videoRect.height;
        displayWidth = videoRect.height * videoRatio;
    }
    
    const offsetX = (videoRect.width - displayWidth) / 2;
    const offsetY = (videoRect.height - displayHeight) / 2;
    
    return {
        x: offsetX,
        y: offsetY,
        width: displayWidth,
        height: displayHeight,
        scaleX: displayWidth / videoWidth,
        scaleY: displayHeight / videoHeight,
        videoWidth: videoWidth,
        videoHeight: videoHeight
    };
}

function screenToVideoCoords(clientX, clientY, videoElement, canvasRect) {
    const displayRect = getVideoDisplayRect(videoElement);
    const x = clientX - canvasRect.left - displayRect.x;
    const y = clientY - canvasRect.top - displayRect.y;
    
    if (x < 0 || y < 0 || x > displayRect.width || y > displayRect.height) {
        return null;
    }
    
    const videoX = x / displayRect.scaleX;
    const videoY = y / displayRect.scaleY;
    
    return {
        x: videoX,
        y: videoY,
        videoWidth: displayRect.videoWidth,
        videoHeight: displayRect.videoHeight
    };
}

function videoToScreenCoords(videoX, videoY, videoElement, canvasRect) {
    const displayRect = getVideoDisplayRect(videoElement);
    
    if (!displayRect.videoWidth || !displayRect.videoHeight) {
        return null;
    }
    
    const x = videoX * displayRect.scaleX + displayRect.x;
    const y = videoY * displayRect.scaleY + displayRect.y;
    
    return { x, y };
}

function initCanvas() {
    const resizeCanvas = () => {
        const localRect = localVideo.getBoundingClientRect();
        const remoteRect = remoteVideo.getBoundingClientRect();
        
        localCanvas.width = localRect.width;
        localCanvas.height = localRect.height;
        remoteCanvas.width = remoteRect.width;
        remoteCanvas.height = remoteRect.height;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    localVideo.addEventListener('loadedmetadata', () => {
        localVideoWidth = localVideo.videoWidth;
        localVideoHeight = localVideo.videoHeight;
        console.log('本地视频尺寸:', localVideoWidth, 'x', localVideoHeight);
    });
    
    remoteVideo.addEventListener('loadedmetadata', () => {
        remoteVideoWidth = remoteVideo.videoWidth;
        remoteVideoHeight = remoteVideo.videoHeight;
        console.log('远程视频尺寸:', remoteVideoWidth, 'x', remoteVideoHeight);
    });
}

function startDrawing(e, canvas, ctx, isRemote) {
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    if (clientX === undefined || clientY === undefined) return;
    
    const canvasRect = canvas.getBoundingClientRect();
    const video = isRemote ? remoteVideo : localVideo;
    const videoCoords = screenToVideoCoords(clientX, clientY, video, canvasRect);
    
    if (!videoCoords) return;
    
    isDrawing = true;
    lastX = videoCoords.x;
    lastY = videoCoords.y;
}

function draw(e, canvas, ctx, isRemote) {
    if (!isDrawing) return;
    
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    if (clientX === undefined || clientY === undefined) return;
    
    const canvasRect = canvas.getBoundingClientRect();
    const video = isRemote ? remoteVideo : localVideo;
    const videoCoords = screenToVideoCoords(clientX, clientY, video, canvasRect);
    
    if (!videoCoords) return;
    
    const screenStart = videoToScreenCoords(lastX, lastY, video, canvasRect);
    const screenEnd = videoToScreenCoords(videoCoords.x, videoCoords.y, video, canvasRect);
    
    if (!screenStart || !screenEnd) return;
    
    ctx.beginPath();
    ctx.moveTo(screenStart.x, screenStart.y);
    ctx.lineTo(screenEnd.x, screenEnd.y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentLineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    if (!isRemote && dataChannel && dataChannel.readyState === 'open') {
        const drawData = {
            v: DRAW_DATA_VERSION,
            type: 'draw',
            x1: lastX,
            y1: lastY,
            x2: videoCoords.x,
            y2: videoCoords.y,
            vw: videoCoords.videoWidth,
            vh: videoCoords.videoHeight,
            color: currentColor,
            lineWidth: currentLineWidth,
            ts: Date.now()
        };
        
        if (drawBuffer.length < MAX_BUFFER_SIZE) {
            drawBuffer.push(drawData);
            processDrawBuffer();
        }
    }
    
    lastX = videoCoords.x;
    lastY = videoCoords.y;
}

function processDrawBuffer() {
    if (isProcessingBuffer || drawBuffer.length === 0) return;
    
    isProcessingBuffer = true;
    
    const batchSize = Math.min(drawBuffer.length, 10);
    const batch = drawBuffer.splice(0, batchSize);
    
    try {
        if (dataChannel && dataChannel.readyState === 'open') {
            if (batch.length === 1) {
                dataChannel.send(JSON.stringify(batch[0]));
            } else {
                dataChannel.send(JSON.stringify({
                    type: 'batch',
                    items: batch
                }));
            }
        }
    } catch (e) {
        console.warn('发送绘制数据失败:', e);
    }
    
    isProcessingBuffer = false;
    
    if (drawBuffer.length > 0) {
        requestAnimationFrame(processDrawBuffer);
    }
}

function stopDrawing() {
    isDrawing = false;
}

function setupCanvasEvents(canvas, ctx, isRemote) {
    canvas.addEventListener('mousedown', (e) => startDrawing(e, canvas, ctx, isRemote));
    canvas.addEventListener('mousemove', (e) => draw(e, canvas, ctx, isRemote));
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrawing(e, canvas, ctx, isRemote);
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        draw(e, canvas, ctx, isRemote);
    });
    canvas.addEventListener('touchend', stopDrawing);
}

function drawRemoteLine(data) {
    const canvasRect = remoteCanvas.getBoundingClientRect();
    
    let x1, y1, x2, y2;
    
    if (data.v === DRAW_DATA_VERSION) {
        const screenStart = videoToScreenCoords(data.x1, data.y1, remoteVideo, canvasRect);
        const screenEnd = videoToScreenCoords(data.x2, data.y2, remoteVideo, canvasRect);
        
        if (!screenStart || !screenEnd) return;
        
        x1 = screenStart.x;
        y1 = screenStart.y;
        x2 = screenEnd.x;
        y2 = screenEnd.y;
    } else {
        const scaleX = canvasRect.width / remoteCanvas.width;
        const scaleY = canvasRect.height / remoteCanvas.height;
        x1 = data.x1 * scaleX;
        y1 = data.y1 * scaleY;
        x2 = data.x2 * scaleX;
        y2 = data.y2 * scaleY;
    }
    
    remoteCtx.beginPath();
    remoteCtx.moveTo(x1, y1);
    remoteCtx.lineTo(x2, y2);
    remoteCtx.strokeStyle = data.color;
    remoteCtx.lineWidth = data.lineWidth;
    remoteCtx.lineCap = 'round';
    remoteCtx.lineJoin = 'round';
    remoteCtx.stroke();
}

const remoteDrawBuffer = [];
const MAX_REMOTE_BUFFER = 50;
const SYNC_THRESHOLD_MS = 100;

function processRemoteDrawBuffer() {
    if (remoteDrawBuffer.length === 0) return;
    
    const now = Date.now();
    const threshold = now - SYNC_THRESHOLD_MS;
    
    while (remoteDrawBuffer.length > 0 && remoteDrawBuffer[0].ts >= threshold) {
        const item = remoteDrawBuffer.shift();
        if (item.type === 'draw') {
            drawRemoteLine(item);
        }
    }
    
    if (remoteDrawBuffer.length > MAX_REMOTE_BUFFER) {
        remoteDrawBuffer.splice(0, remoteDrawBuffer.length - MAX_REMOTE_BUFFER);
    }
}

setInterval(processRemoteDrawBuffer, 16);

function clearCanvas() {
    localCtx.clearRect(0, 0, localCanvas.width, localCanvas.height);
    remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'clear' }));
    }
}

async function startScreenShare() {
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });
        
        localVideo.srcObject = localStream;
        
        localStream.getVideoTracks()[0].addEventListener('ended', () => {
            stopScreenShare();
        });
        
        startBtn.disabled = true;
        stopBtn.disabled = false;
        createOfferBtn.disabled = false;
        
        console.log('屏幕共享已开始');
    } catch (error) {
        console.error('屏幕共享失败:', error);
        alert('屏幕共享失败: ' + error.message);
    }
}

function stopScreenShare() {
    stopStatsMonitoring();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    localVideo.srcObject = null;
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    drawBuffer.length = 0;
    remoteDrawBuffer.length = 0;
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    createOfferBtn.disabled = true;
    
    console.log('屏幕共享已停止');
}

function redrawCanvas() {
    localCtx.clearRect(0, 0, localCanvas.width, localCanvas.height);
    remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
}

localVideo.addEventListener('resize', () => {
    localVideoWidth = localVideo.videoWidth;
    localVideoHeight = localVideo.videoHeight;
    console.log('本地视频尺寸变更:', localVideoWidth, 'x', localVideoHeight);
});

remoteVideo.addEventListener('resize', () => {
    remoteVideoWidth = remoteVideo.videoWidth;
    remoteVideoHeight = remoteVideo.videoHeight;
    console.log('远程视频尺寸变更:', remoteVideoWidth, 'x', remoteVideoHeight);
    redrawCanvas();
});

const videoConstraints = {
    maxBitrate: 2500000,
    minBitrate: 500000,
    maxFramerate: 30,
    minFramerate: 10
};

let networkStats = {
    rtt: 0,
    jitter: 0,
    packetsLost: 0,
    bandwidthEstimate: 0
};

async function updateVideoConstraints() {
    if (!peerConnection || !localStream) return;
    
    const senders = peerConnection.getSenders();
    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
    
    if (!videoSender) return;
    
    try {
        const parameters = videoSender.getParameters();
        
        if (!parameters.encodings || parameters.encodings.length === 0) {
            parameters.encodings = [{}];
        }
        
        let targetBitrate = videoConstraints.maxBitrate;
        
        if (networkStats.rtt > 100) {
            targetBitrate = Math.max(videoConstraints.minBitrate, targetBitrate * 0.7);
        }
        if (networkStats.jitter > 50) {
            targetBitrate = Math.max(videoConstraints.minBitrate, targetBitrate * 0.8);
        }
        if (networkStats.packetsLost > 5) {
            targetBitrate = Math.max(videoConstraints.minBitrate, targetBitrate * 0.6);
        }
        
        parameters.encodings[0].maxBitrate = targetBitrate;
        parameters.encodings[0].maxFramerate = videoConstraints.maxFramerate;
        
        await videoSender.setParameters(parameters);
        console.log('视频编码参数已更新, 目标码率:', Math.round(targetBitrate / 1000) + 'kbps');
    } catch (e) {
        console.warn('更新视频编码参数失败:', e);
    }
}

async function monitorNetworkStats() {
    if (!peerConnection) return;
    
    try {
        const stats = await peerConnection.getStats();
        
        stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                networkStats.rtt = report.currentRoundTripTime || 0;
                networkStats.bandwidthEstimate = report.availableOutgoingBitrate || 0;
            }
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
                networkStats.jitter = report.jitter || 0;
                networkStats.packetsLost = report.packetsLost || 0;
            }
        });
        
        updateVideoConstraints();
    } catch (e) {
        console.warn('获取网络统计失败:', e);
    }
}

let statsInterval = null;

function startStatsMonitoring() {
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(monitorNetworkStats, 2000);
}

function stopStatsMonitoring() {
    if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    dataChannel = peerConnection.createDataChannel('drawingChannel', {
        ordered: true,
        maxRetransmits: 3
    });
    setupDataChannel(dataChannel);
    
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };
    
    if (localStream) {
        localStream.getTracks().forEach(track => {
            const sender = peerConnection.addTrack(track, localStream);
        });
    }
    
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE连接状态:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'connected' || 
            peerConnection.iceConnectionState === 'completed') {
            startStatsMonitoring();
        } else {
            stopStatsMonitoring();
        }
    };
    
    return peerConnection;
}

function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('数据通道已打开');
    };
    
    channel.onclose = () => {
        console.log('数据通道已关闭');
    };
    
    channel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'draw') {
                data.ts = data.ts || Date.now();
                remoteDrawBuffer.push(data);
            } else if (data.type === 'batch') {
                data.items.forEach(item => {
                    item.ts = item.ts || Date.now();
                    remoteDrawBuffer.push(item);
                });
            } else if (data.type === 'clear') {
                remoteDrawBuffer.length = 0;
                localCtx.clearRect(0, 0, localCanvas.width, localCanvas.height);
                remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
            }
        } catch (e) {
            console.error('处理绘制数据失败:', e);
        }
    };
}

async function createOffer() {
    if (!peerConnection) {
        createPeerConnection();
    }
    
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        await new Promise(resolve => {
            if (peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (peerConnection.iceGatheringState === 'complete') {
                        peerConnection.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                peerConnection.addEventListener('icegatheringstatechange', checkState);
            }
        });
        
        offerSdp.value = JSON.stringify(peerConnection.localDescription);
        copyOfferBtn.disabled = false;
        setAnswerBtn.disabled = false;
        
        console.log('Offer已创建');
    } catch (error) {
        console.error('创建Offer失败:', error);
    }
}

async function createAnswer() {
    const remoteOffer = remoteOfferSdp.value.trim();
    if (!remoteOffer) {
        alert('请先粘贴远程Offer SDP');
        return;
    }
    
    try {
        if (!peerConnection) {
            createPeerConnection();
        }
        
        await peerConnection.setRemoteDescription(JSON.parse(remoteOffer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        await new Promise(resolve => {
            if (peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (peerConnection.iceGatheringState === 'complete') {
                        peerConnection.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                peerConnection.addEventListener('icegatheringstatechange', checkState);
            }
        });
        
        answerOutput.value = JSON.stringify(peerConnection.localDescription);
        copyAnswerBtn.disabled = false;
        
        console.log('Answer已创建');
    } catch (error) {
        console.error('创建Answer失败:', error);
        alert('创建Answer失败: ' + error.message);
    }
}

async function setAnswer() {
    const answer = answerSdpInput.value.trim();
    if (!answer) {
        alert('请先粘贴Answer SDP');
        return;
    }
    
    try {
        await peerConnection.setRemoteDescription(JSON.parse(answer));
        console.log('Answer已设置，连接建立成功');
        alert('连接建立成功！');
    } catch (error) {
        console.error('设置Answer失败:', error);
        alert('设置Answer失败: ' + error.message);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        console.log('已复制到剪贴板');
    }).catch(err => {
        console.error('复制失败:', err);
    });
}

startBtn.addEventListener('click', startScreenShare);
stopBtn.addEventListener('click', stopScreenShare);
createOfferBtn.addEventListener('click', createOffer);
createAnswerBtn.addEventListener('click', createAnswer);
setAnswerBtn.addEventListener('click', setAnswer);

copyOfferBtn.addEventListener('click', () => {
    copyToClipboard(offerSdp.value);
});

copyAnswerBtn.addEventListener('click', () => {
    copyToClipboard(answerOutput.value);
});

clearCanvasBtn.addEventListener('click', clearCanvas);

colorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value;
});

lineWidthSlider.addEventListener('input', (e) => {
    currentLineWidth = parseInt(e.target.value);
    lineWidthValue.textContent = currentLineWidth;
});

const recordBtn = document.getElementById('recordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopPlayBtn = document.getElementById('stopPlayBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const playbackSpeed = document.getElementById('playbackSpeed');
const timelineSlider = document.getElementById('timelineSlider');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');
const recordDurationDisplay = document.getElementById('recordDuration');
const eventCountDisplay = document.getElementById('eventCount');
const recordingStatus = document.getElementById('recordingStatus');

const RECORDING_VERSION = 1;

let recordingEngine = {
    isRecording: false,
    startTime: 0,
    events: [],
    duration: 0
};

let playbackEngine = {
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    speed: 1,
    currentEventIndex: 0,
    animationFrameId: null,
    lastFrameTime: 0,
    events: []
};

function recordEvent(type, data) {
    if (!recordingEngine.isRecording) return;
    
    const relativeTime = Date.now() - recordingEngine.startTime;
    
    const event = {
        t: relativeTime,
        type: type,
        data: data
    };
    
    recordingEngine.events.push(event);
    updateRecordingUI();
}

function captureDrawEvent(data) {
    recordEvent('draw', {
        x1: data.x1,
        y1: data.y1,
        x2: data.x2,
        y2: data.y2,
        vw: data.vw,
        vh: data.vh,
        color: data.color,
        lineWidth: data.lineWidth
    });
}

function captureClearEvent() {
    recordEvent('clear', {});
}

const originalSetupDataChannel = setupDataChannel;
setupDataChannel = function(channel) {
    originalSetupDataChannel(channel);
    
    const originalOnMessage = channel.onmessage;
    channel.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'draw') {
                captureDrawEvent(data);
            } else if (data.type === 'batch') {
                data.items.forEach(item => captureDrawEvent(item));
            } else if (data.type === 'clear') {
                captureClearEvent();
            }
            
            if (originalOnMessage) {
                originalOnMessage.call(channel, event);
            }
        } catch (e) {
            console.error('处理绘制数据失败:', e);
        }
    };
};

const originalClearCanvas = clearCanvas;
clearCanvas = function() {
    originalClearCanvas();
    captureClearEvent();
};

function hookLocalDraw() {
    const originalDraw = draw;
    draw = function(e, canvas, ctx, isRemote) {
        if (!isRemote && recordingEngine.isRecording) {
            const lastXBefore = lastX;
            const lastYBefore = lastY;
            
            originalDraw.call(this, e, canvas, ctx, isRemote);
            
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            if (clientX === undefined || clientY === undefined) return;
            
            const canvasRect = canvas.getBoundingClientRect();
            const video = isRemote ? remoteVideo : localVideo;
            const videoCoords = screenToVideoCoords(clientX, clientY, video, canvasRect);
            
            if (!videoCoords) return;
            
            recordEvent('draw', {
                x1: lastXBefore,
                y1: lastYBefore,
                x2: videoCoords.x,
                y2: videoCoords.y,
                vw: videoCoords.videoWidth,
                vh: videoCoords.videoHeight,
                color: currentColor,
                lineWidth: currentLineWidth
            });
        } else {
            originalDraw.call(this, e, canvas, ctx, isRemote);
        }
    };
}

hookLocalDraw();

function startRecording() {
    if (recordingEngine.isRecording) return;
    
    recordingEngine = {
        isRecording: true,
        startTime: Date.now(),
        events: [],
        duration: 0
    };
    
    recordBtn.classList.add('recording');
    recordBtn.disabled = true;
    stopRecordBtn.disabled = false;
    playBtn.disabled = true;
    exportBtn.disabled = true;
    
    updateRecordingUI();
    console.log('开始录制...');
}

function stopRecording() {
    if (!recordingEngine.isRecording) return;
    
    recordingEngine.isRecording = false;
    recordingEngine.duration = Date.now() - recordingEngine.startTime;
    
    recordBtn.classList.remove('recording');
    recordBtn.disabled = false;
    stopRecordBtn.disabled = true;
    
    if (recordingEngine.events.length > 0) {
        playBtn.disabled = false;
        exportBtn.disabled = false;
        totalTimeDisplay.textContent = formatTime(recordingEngine.duration);
    }
    
    updateRecordingUI();
    console.log('停止录制, 共录制', recordingEngine.events.length, '个事件, 时长:', formatTime(recordingEngine.duration));
}

function preparePlayback(events, duration) {
    playbackEngine = {
        isPlaying: false,
        isPaused: false,
        currentTime: 0,
        duration: duration || 0,
        speed: parseFloat(playbackSpeed.value),
        currentEventIndex: 0,
        animationFrameId: null,
        lastFrameTime: 0,
        events: events ? [...events].sort((a, b) => a.t - b.t) : []
    };
    
    if (playbackEngine.events.length > 0) {
        const lastEvent = playbackEngine.events[playbackEngine.events.length - 1];
        playbackEngine.duration = Math.max(playbackEngine.duration, lastEvent.t + 100);
    }
    
    totalTimeDisplay.textContent = formatTime(playbackEngine.duration);
    timelineSlider.max = playbackEngine.duration;
    timelineSlider.disabled = playbackEngine.events.length === 0;
}

function executeEvent(event) {
    if (!event) return;
    
    if (event.type === 'draw') {
        const data = event.data;
        const canvasRect = remoteCanvas.getBoundingClientRect();
        
        const screenStart = videoToScreenCoords(data.x1, data.y1, remoteVideo, canvasRect);
        const screenEnd = videoToScreenCoords(data.x2, data.y2, remoteVideo, canvasRect);
        
        if (!screenStart || !screenEnd) return;
        
        remoteCtx.beginPath();
        remoteCtx.moveTo(screenStart.x, screenStart.y);
        remoteCtx.lineTo(screenEnd.x, screenEnd.y);
        remoteCtx.strokeStyle = data.color;
        remoteCtx.lineWidth = data.lineWidth;
        remoteCtx.lineCap = 'round';
        remoteCtx.lineJoin = 'round';
        remoteCtx.stroke();
    } else if (event.type === 'clear') {
        remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    }
}

function playbackLoop(timestamp) {
    if (!playbackEngine.isPlaying || playbackEngine.isPaused) return;
    
    if (playbackEngine.lastFrameTime === 0) {
        playbackEngine.lastFrameTime = timestamp;
    }
    
    const deltaTime = (timestamp - playbackEngine.lastFrameTime) * playbackEngine.speed;
    playbackEngine.currentTime += deltaTime;
    playbackEngine.lastFrameTime = timestamp;
    
    while (playbackEngine.currentEventIndex < playbackEngine.events.length) {
        const event = playbackEngine.events[playbackEngine.currentEventIndex];
        if (event.t <= playbackEngine.currentTime) {
            executeEvent(event);
            playbackEngine.currentEventIndex++;
        } else {
            break;
        }
    }
    
    currentTimeDisplay.textContent = formatTime(playbackEngine.currentTime);
    timelineSlider.value = Math.min(playbackEngine.currentTime, playbackEngine.duration);
    
    if (playbackEngine.currentTime >= playbackEngine.duration) {
        stopPlayback();
        return;
    }
    
    playbackEngine.animationFrameId = requestAnimationFrame(playbackLoop);
}

function startPlayback() {
    if (playbackEngine.events.length === 0) {
        if (recordingEngine.events.length > 0) {
            preparePlayback(recordingEngine.events, recordingEngine.duration);
        } else {
            alert('没有可播放的录制数据');
            return;
        }
    }
    
    if (playbackEngine.isPaused) {
        playbackEngine.isPaused = false;
        playbackEngine.lastFrameTime = 0;
    } else {
        playbackEngine.currentTime = 0;
        playbackEngine.currentEventIndex = 0;
        playbackEngine.lastFrameTime = 0;
        remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    }
    
    playbackEngine.isPlaying = true;
    playbackEngine.speed = parseFloat(playbackSpeed.value);
    
    playBtn.disabled = true;
    pauseBtn.disabled = false;
    stopPlayBtn.disabled = false;
    recordBtn.disabled = true;
    
    playbackEngine.animationFrameId = requestAnimationFrame(playbackLoop);
    updateRecordingStatus('播放中');
    console.log('开始播放, 倍速:', playbackEngine.speed + 'x');
}

function pausePlayback() {
    if (!playbackEngine.isPlaying) return;
    
    playbackEngine.isPaused = true;
    
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    
    updateRecordingStatus('已暂停');
    console.log('播放暂停');
}

function stopPlayback() {
    playbackEngine.isPlaying = false;
    playbackEngine.isPaused = false;
    
    if (playbackEngine.animationFrameId) {
        cancelAnimationFrame(playbackEngine.animationFrameId);
        playbackEngine.animationFrameId = null;
    }
    
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    stopPlayBtn.disabled = true;
    recordBtn.disabled = recordingEngine.isRecording;
    
    currentTimeDisplay.textContent = '00:00';
    timelineSlider.value = 0;
    
    updateRecordingStatus('待机');
    console.log('播放停止');
}

function seekToTime(time) {
    if (playbackEngine.events.length === 0) return;
    
    const wasPlaying = playbackEngine.isPlaying && !playbackEngine.isPaused;
    
    if (wasPlaying) {
        pausePlayback();
    }
    
    playbackEngine.currentTime = time;
    playbackEngine.currentEventIndex = 0;
    
    remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
    
    while (playbackEngine.currentEventIndex < playbackEngine.events.length) {
        const event = playbackEngine.events[playbackEngine.currentEventIndex];
        if (event.t <= playbackEngine.currentTime) {
            executeEvent(event);
            playbackEngine.currentEventIndex++;
        } else {
            break;
        }
    }
    
    currentTimeDisplay.textContent = formatTime(playbackEngine.currentTime);
    
    if (wasPlaying) {
        startPlayback();
    }
}

function exportRecording() {
    if (recordingEngine.events.length === 0) {
        alert('没有可导出的录制数据');
        return;
    }
    
    const recordingData = {
        version: RECORDING_VERSION,
        created: new Date().toISOString(),
        duration: recordingEngine.duration,
        eventCount: recordingEngine.events.length,
        events: recordingEngine.events,
        metadata: {
            videoWidth: remoteVideoWidth || 1920,
            videoHeight: remoteVideoHeight || 1080
        }
    };
    
    const blob = new Blob([JSON.stringify(recordingData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screen-share-recording-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('录制数据已导出');
}

function importRecording(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.version !== RECORDING_VERSION) {
                console.warn('录制文件版本不兼容, 尝试加载...');
            }
            
            recordingEngine = {
                isRecording: false,
                startTime: 0,
                events: data.events || [],
                duration: data.duration || 0
            };
            
            preparePlayback(data.events, data.duration);
            
            playBtn.disabled = false;
            exportBtn.disabled = false;
            
            updateRecordingUI();
            updateRecordingStatus('已加载');
            
            console.log('录制数据已导入, 共', data.events.length, '个事件');
            alert('导入成功！共 ' + data.events.length + ' 个绘制事件');
        } catch (err) {
            console.error('导入失败:', err);
            alert('导入失败: 文件格式不正确');
        }
    };
    
    reader.readAsText(file);
}

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateRecordingUI() {
    recordDurationDisplay.textContent = formatTime(
        recordingEngine.isRecording 
            ? Date.now() - recordingEngine.startTime 
            : recordingEngine.duration
    );
    eventCountDisplay.textContent = recordingEngine.events.length;
}

function updateRecordingStatus(status) {
    const statusText = recordingStatus.textContent.split('|')[0].split(':')[1].trim();
    recordingStatus.textContent = recordingStatus.textContent.replace(
        `状态: ${statusText}`,
        `状态: ${status}`
    );
}

recordBtn.addEventListener('click', startRecording);
stopRecordBtn.addEventListener('click', stopRecording);
playBtn.addEventListener('click', startPlayback);
pauseBtn.addEventListener('click', pausePlayback);
stopPlayBtn.addEventListener('click', stopPlayback);
exportBtn.addEventListener('click', exportRecording);
importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        importRecording(e.target.files[0]);
        e.target.value = '';
    }
});

playbackSpeed.addEventListener('change', () => {
    playbackEngine.speed = parseFloat(playbackSpeed.value);
    console.log('播放倍速已设置为:', playbackEngine.speed + 'x');
});

timelineSlider.addEventListener('input', (e) => {
    seekToTime(parseFloat(e.target.value));
});

setInterval(() => {
    if (recordingEngine.isRecording) {
        updateRecordingUI();
    }
}, 1000);

initCanvas();
setupCanvasEvents(localCanvas, localCtx, false);
setupCanvasEvents(remoteCanvas, remoteCtx, true);

window.addEventListener('beforeunload', () => {
    stopScreenShare();
    stopPlayback();
});