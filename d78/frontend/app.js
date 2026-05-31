class GesturePPTController {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.model = null;
        this.isRunning = false;
        this.ws = null;
        this.gestureCount = 0;
        this.lastGesture = null;
        this.gestureStartTime = null;
        this.gestureCooldown = false;
        this.GESTURE_HOLD_TIME = 1000;
        this.COOLDOWN_TIME = 1500;
        
        this.initElements();
        this.setupEventListeners();
    }

    initElements() {
        this.gestureIcon = document.getElementById('gestureIcon');
        this.gestureText = document.getElementById('gestureText');
        this.connectionDot = document.getElementById('connectionDot');
        this.connectionText = document.getElementById('connectionText');
        this.modelStatus = document.getElementById('modelStatus');
        this.gestureCountEl = document.getElementById('gestureCount');
        this.startBtn = document.getElementById('startBtn');
        this.connectBtn = document.getElementById('connectBtn');
        this.logContainer = document.getElementById('logContainer');
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.toggleDetection());
        this.connectBtn.addEventListener('click', () => this.connectWebSocket());
    }

    log(message, type = '') {
        const logItem = document.createElement('div');
        logItem.className = `log-item ${type}`;
        const time = new Date().toLocaleTimeString();
        logItem.textContent = `[${time}] ${message}`;
        this.logContainer.insertBefore(logItem, this.logContainer.firstChild);
        
        while (this.logContainer.children.length > 50) {
            this.logContainer.removeChild(this.logContainer.lastChild);
        }
    }

    async loadModel() {
        try {
            this.log('正在加载 HandPose 模型...', 'warning');
            this.modelStatus.textContent = '加载中...';
            
            const modelConfig = {
                runtime: 'mediapipe',
                modelType: 'full',
                solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands'
            };
            
            this.model = await handPoseDetection.createDetector(
                handPoseDetection.SupportedModels.MediaPipeHands,
                modelConfig
            );
            
            this.log('模型加载成功！', 'success');
            this.modelStatus.textContent = '已加载';
            this.startBtn.disabled = false;
            this.startBtn.textContent = '▶️ 开始手势检测';
        } catch (error) {
            this.log(`模型加载失败: ${error.message}', 'error');
            this.modelStatus.textContent = '加载失败';
            console.error(error);
        }
    }

    async setupCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                }
            });
            this.video.srcObject = stream;
            
            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    resolve();
                };
            });
        } catch (error) {
            this.log(`摄像头访问失败: ${error.message}', 'error');
            throw error;
        }
    }

    calculateDistance(point1, point2) {
        return Math.sqrt(
            Math.pow(point1.x - point2.x, 2) +
            Math.pow(point1.y - point2.y, 2)
        );
    }

    detectGesture(landmarks) {
        const wrist = landmarks[0];
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        
        const indexPIP = landmarks[6];
        const middlePIP = landmarks[10];
        const ringPIP = landmarks[14];
        const pinkyPIP = landmarks[18];
        
        const indexMCP = landmarks[5];
        const middleMCP = landmarks[9];
        const ringMCP = landmarks[13];
        const pinkyMCP = landmarks[17];
        
        const palmWidth = this.calculateDistance(indexMCP, pinkyMCP);
        
        const fingers = [
            { tip: indexTip, pip: indexPIP, mcp: indexMCP },
            { tip: middleTip, pip: middlePIP, mcp: middleMCP },
            { tip: ringTip, pip: ringPIP, mcp: ringMCP },
            { tip: pinkyTip, pip: pinkyPIP, mcp: pinkyMCP }
        ];
        
        let foldedFingers = 0;
        
        for (const finger of fingers) {
            const tipToPIP = this.calculateDistance(finger.tip, finger.pip);
            const tipToMCP = this.calculateDistance(finger.tip, finger.mcp);
            const pipToMCP = this.calculateDistance(finger.pip, finger.mcp);
            
            if (tipToMCP < pipToMCP * 1.5 && tipToPIP < pipToMCP * 0.8) {
                foldedFingers++;
            }
        }
        
        const thumbTipToPinkyMCP = this.calculateDistance(thumbTip, pinkyMCP);
        const isThumbFolded = thumbTipToPinkyMCP < palmWidth * 0.6;
        
        if (foldedFingers >= 3 && isThumbFolded) {
            return 'fist';
        }
        
        if (foldedFingers <= 1) {
            return 'open';
        }
        
        return null;
    }

    updateGestureDisplay(gesture) {
        if (gesture === 'fist') {
            this.gestureIcon.textContent = '✊';
            this.gestureText.textContent = '握拳 → 下一页';
        } else if (gesture === 'open') {
            this.gestureIcon.textContent = '🖐️';
            this.gestureText.textContent = '张开手掌 → 上一页';
        } else {
            this.gestureIcon.textContent = '❓';
            this.gestureText.textContent = '等待检测中...';
        }
    }

    handleGesture(gesture) {
        const now = Date.now();
        
        if (gesture === this.lastGesture && gesture !== null) {
            if (!this.gestureStartTime) {
                this.gestureStartTime = now;
            } else if (now - this.gestureStartTime >= this.GESTURE_HOLD_TIME && !this.gestureCooldown) {
                    this.sendGestureCommand(gesture);
                    this.gestureCooldown = true;
                    this.gestureCount++;
                    this.gestureCountEl.textContent = this.gestureCount;
                    
                    setTimeout(() => {
                        this.gestureCooldown = false;
                    }, this.COOLDOWN_TIME);
                }
        } else {
            this.gestureStartTime = null;
            this.lastGesture = gesture;
        }
        
        this.updateGestureDisplay(gesture);
    }

    sendGestureCommand(gesture) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const command = gesture === 'fist' ? 'next' : 'prev';
            this.ws.send(JSON.stringify({ gesture, command }));
            this.log(`发送手势指令: ${command}`, 'success');
        } else {
            this.log(`检测到手势: ${gesture} (未连接后端)`, 'warning');
        }
    }

    drawLandmarks(landmarks) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [5, 9], [9, 10], [10, 11], [11, 12],
            [9, 13], [13, 14], [14, 15], [15, 16],
            [13, 17], [17, 18], [18, 19], [19, 20],
            [0, 17]
        ];
        
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
        
        for (const [start, end] of connections) {
            this.ctx.beginPath();
            this.ctx.moveTo(landmarks[start].x, landmarks[start].y);
            this.ctx.lineTo(landmarks[end].x, landmarks[end].y);
            this.ctx.stroke();
        }
        
        for (const point of landmarks) {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#ff0000';
            this.ctx.fill();
        }
    }

    async detectHands() {
        if (!this.isRunning || !this.model) return;
        
        try {
            const hands = await this.model.estimateHands(this.video);
            
            if (hands.length > 0) {
                const landmarks = hands[0].keypoints;
                this.drawLandmarks(landmarks);
                
                const gesture = this.detectGesture(landmarks);
                this.handleGesture(gesture);
            } else {
                this.updateGestureDisplay(null);
            }
        } catch (error) {
            console.error('手势检测错误:', error);
        }
        
        requestAnimationFrame(() => this.detectHands());
    }

    async toggleDetection() {
        if (this.isRunning) {
            this.isRunning = false;
            this.startBtn.textContent = '▶️ 开始手势检测';
            this.log('手势检测已停止');
        } else {
            try {
                await this.setupCamera();
                this.isRunning = true;
                this.startBtn.textContent = '⏹️ 停止手势检测';
                this.log('手势检测已开始');
                this.detectHands();
            } catch (error) {
                this.log('启动摄像头失败', 'error');
            }
        }
    }

    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
            return;
        }
        
        const wsUrl = 'ws://localhost:8000/ws';
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.connectionDot.className = 'status-dot loading';
            this.connectionText.textContent = '连接中...';
            this.log('正在连接 WebSocket...', 'warning');
            
            this.ws.onopen = () => {
                this.connectionDot.className = 'status-dot connected';
                this.connectionText.textContent = '已连接';
                this.connectBtn.textContent = '🔌 断开连接';
                this.log('WebSocket 连接成功！', 'success');
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.log(`服务器响应: ${data.message}`, 'success');
            };
            
            this.ws.onclose = () => {
                this.connectionDot.className = 'status-dot disconnected';
                this.connectionText.textContent = '未连接';
                this.connectBtn.textContent = '🔗 连接到后端';
                this.log('WebSocket 连接已关闭');
            };
            
            this.ws.onerror = (error) => {
                this.log('WebSocket 连接错误', 'error');
                console.error(error);
            };
        } catch (error) {
            this.log(`连接失败: ${error.message}`, 'error');
        }
    }

    async init() {
        await this.loadModel();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const controller = new GesturePPTController();
    controller.init();
});
