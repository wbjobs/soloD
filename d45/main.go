package main

import (
	"encoding/json"
	"fmt"
	"game-backend/matchmaker"
	"game-backend/websocket"
	"net/http"
)

func main() {
	mm := matchmaker.NewMatchmaker()
	wsServer := websocket.NewServer(mm)

	go func() {
		for match := range mm.GetMatchChan() {
			wsServer.BroadcastMatchFound(match)
			wsServer.StartMatchSimulation(match.ID)
		}
	}()

	http.HandleFunc("/ws", wsServer.HandleWebSocket)
	http.HandleFunc("/spectator/ws", wsServer.HandleSpectatorWebSocket)
	
	http.HandleFunc("/matches", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		
		matches := mm.GetAllMatches()
		matchList := make([]map[string]interface{}, 0, len(matches))
		
		for _, match := range matches {
			matchList = append(matchList, mm.GetMatchInfo(match.ID))
		}
		
		json.NewEncoder(w).Encode(map[string]interface{}{
			"matches": matchList,
			"count":   len(matchList),
		})
	})

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`
<!DOCTYPE html>
<html>
<head>
    <title>游戏匹配测试</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        #log { background: #f0f0f0; padding: 10px; height: 300px; overflow-y: scroll; margin: 10px 0; }
        button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
        .status { margin: 10px 0; padding: 10px; background: #e8f4f8; }
    </style>
</head>
<body>
    <h1>游戏匹配测试客户端</h1>
    <div class="status">
        <strong>状态:</strong> <span id="status">未连接</span><br>
        <strong>玩家ID:</strong> <span id="playerId">-</span><br>
        <strong>Elo积分:</strong> <span id="elo">-</span>
    </div>
    <div>
        <button id="connectBtn">连接</button>
        <button id="joinQueueBtn" disabled>加入匹配</button>
        <button id="leaveQueueBtn" disabled>离开匹配</button>
    </div>
    <div id="log"></div>

    <script>
        let ws = null;
        let playerId = localStorage.getItem('playerId') || null;
        let playerName = localStorage.getItem('playerName') || null;
        let elo = 1000;
        let reconnectAttempts = 0;
        let maxReconnectAttempts = 5;
        let reconnectDelay = 2000;
        let autoReconnect = true;

        function log(message) {
            const logDiv = document.getElementById('log');
            logDiv.innerHTML += '<div>' + new Date().toLocaleTimeString() + ' - ' + message + '</div>';
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        function updateStatus(status) {
            document.getElementById('status').textContent = status;
        }

        function connect(isReconnect = false) {
            if (!playerName) {
                playerName = prompt('请输入你的名字:', 'Player' + Math.floor(Math.random() * 1000));
                if (!playerName) return;
                localStorage.setItem('playerName', playerName);
            }

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            let wsUrl = protocol + '//' + window.location.host + '/ws?name=' + encodeURIComponent(playerName);
            
            if (playerId) {
                wsUrl += '&playerId=' + encodeURIComponent(playerId);
            }
            
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                log(isReconnect ? '断线重连成功!' : 'WebSocket连接成功');
                reconnectAttempts = 0;
                updateStatus('已连接');
                document.getElementById('connectBtn').textContent = '断开连接';
                document.getElementById('joinQueueBtn').disabled = false;
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log('收到消息:', data);

                switch(data.type) {
                    case 'reconnect_success':
                        playerId = data.payload.playerId;
                        elo = data.payload.elo;
                        localStorage.setItem('playerId', playerId);
                        document.getElementById('playerId').textContent = playerId;
                        document.getElementById('elo').textContent = elo.toFixed(1);
                        log('重连成功，当前Elo: ' + elo.toFixed(1));
                        if (data.payload.inQueue) {
                            updateStatus('匹配中...');
                            document.getElementById('joinQueueBtn').disabled = true;
                            document.getElementById('leaveQueueBtn').disabled = false;
                        }
                        break;
                    case 'heartbeat':
                        ws.send(JSON.stringify({ type: 'pong' }));
                        break;
                    case 'queue_joined':
                        playerId = data.payload.playerId;
                        elo = data.payload.elo;
                        localStorage.setItem('playerId', playerId);
                        document.getElementById('playerId').textContent = playerId;
                        document.getElementById('elo').textContent = elo.toFixed(1);
                        updateStatus('匹配中...');
                        document.getElementById('joinQueueBtn').disabled = true;
                        document.getElementById('leaveQueueBtn').disabled = false;
                        log('已加入匹配队列');
                        break;
                    case 'queue_left':
                        updateStatus('已连接');
                        document.getElementById('joinQueueBtn').disabled = false;
                        document.getElementById('leaveQueueBtn').disabled = true;
                        log('已离开匹配队列');
                        break;
                    case 'match_found':
                        updateStatus('匹配成功!');
                        document.getElementById('joinQueueBtn').disabled = true;
                        document.getElementById('leaveQueueBtn').disabled = true;
                        log('匹配成功! 对手: ' + data.payload.opponent.name + ' (Elo: ' + data.payload.opponent.elo.toFixed(1) + ')');
                        log('比赛ID: ' + data.payload.match.matchId);
                        break;
                }
            };

            ws.onclose = () => {
                log('WebSocket连接已关闭');
                updateStatus('未连接');
                ws = null;
                document.getElementById('connectBtn').textContent = '连接';
                document.getElementById('joinQueueBtn').disabled = true;
                document.getElementById('leaveQueueBtn').disabled = true;

                if (autoReconnect && reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    log(`尝试自动重连 (${reconnectAttempts}/${maxReconnectAttempts})...`);
                    setTimeout(() => connect(true), reconnectDelay);
                }
            };

            ws.onerror = (error) => {
                log('WebSocket错误: ' + error);
            };
        }

        document.getElementById('connectBtn').addEventListener('click', () => {
            if (ws) {
                autoReconnect = false;
                ws.close();
                ws = null;
                document.getElementById('connectBtn').textContent = '连接';
                document.getElementById('joinQueueBtn').disabled = true;
                document.getElementById('leaveQueueBtn').disabled = true;
                updateStatus('未连接');
                playerId = null;
                playerName = null;
                localStorage.removeItem('playerId');
                localStorage.removeItem('playerName');
                return;
            }

            autoReconnect = true;
            reconnectAttempts = 0;
            connect(false);
        });

        document.getElementById('joinQueueBtn').addEventListener('click', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'join_queue' }));
            }
        });

        document.getElementById('leaveQueueBtn').addEventListener('click', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'leave_queue' }));
            }
        });
    </script>
</body>
</html>
		`))
	})

	http.HandleFunc("/spectator", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`
<!DOCTYPE html>
<html>
<head>
    <title>比赛观战模式</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; }
        #log { background: #f0f0f0; padding: 10px; height: 400px; overflow-y: scroll; margin: 10px 0; }
        .event { margin: 5px 0; padding: 8px; border-radius: 4px; }
        .event-move { background: #e3f2fd; }
        .event-attack { background: #ffebee; }
        .event-defense { background: #e8f5e9; }
        .event-score { background: #fff3e0; }
        .event-status { background: #f3e5f5; }
        .event-end { background: #ffecb3; font-weight: bold; }
        .match-list { margin: 10px 0; }
        .match-item { padding: 10px; border: 1px solid #ddd; margin: 5px 0; cursor: pointer; }
        .match-item:hover { background: #f5f5f5; }
        .status { margin: 10px 0; padding: 10px; background: #e8f4f8; }
        button { padding: 10px 20px; font-size: 16px; cursor: pointer; margin: 5px; }
        input { padding: 8px; margin: 5px; }
    </style>
</head>
<body>
    <h1>🎮 比赛观战模式</h1>
    
    <div class="status">
        <strong>状态:</strong> <span id="status">未连接</span><br>
        <strong>当前比赛:</strong> <span id="currentMatch">-</span><br>
        <strong>观战人数:</strong> <span id="spectatorCount">0</span>
    </div>

    <div>
        <input type="text" id="spectatorName" placeholder="输入观战者名称" value="观众">
        <button id="refreshBtn">刷新比赛列表</button>
    </div>

    <div class="match-list">
        <h3>正在进行的比赛:</h3>
        <div id="matchList"></div>
    </div>

    <div id="log"></div>

    <script>
        let ws = null;
        let currentMatchId = null;

        function log(message, type = '') {
            const logDiv = document.getElementById('log');
            const div = document.createElement('div');
            div.className = 'event event-' + type;
            const time = new Date().toLocaleTimeString();
            div.innerHTML = '<strong>[' + time + ']</strong> ' + message;
            logDiv.appendChild(div);
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        function updateStatus(status) {
            document.getElementById('status').textContent = status;
        }

        async function refreshMatchList() {
            try {
                const response = await fetch('/matches');
                const data = await response.json();
                const listDiv = document.getElementById('matchList');
                
                if (data.count === 0) {
                    listDiv.innerHTML = '<p>暂无正在进行的比赛，请先创建比赛（打开两个玩家页面进行匹配）</p>';
                    return;
                }

                listDiv.innerHTML = '';
                data.matches.forEach(match => {
                    const div = document.createElement('div');
                    div.className = 'match-item';
                    div.innerHTML = '<strong>' + match.playerA.name + '</strong> (Elo: ' + match.playerA.elo.toFixed(1) + 
                                   ') vs <strong>' + match.playerB.name + '</strong> (Elo: ' + match.playerB.elo.toFixed(1) + 
                                   ') <br><small>ID: ' + match.matchId + ' | 观战人数: ' + match.spectatorCount + '</small>';
                    div.onclick = () => joinAsSpectator(match.matchId);
                    listDiv.appendChild(div);
                });
            } catch (e) {
                console.error('获取比赛列表失败:', e);
            }
        }

        function joinAsSpectator(matchId) {
            if (ws) {
                ws.close();
            }

            const name = document.getElementById('spectatorName').value || '观众';
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host + '/spectator/ws?matchId=' + 
                          encodeURIComponent(matchId) + '&name=' + encodeURIComponent(name);
            
            ws = new WebSocket(wsUrl);
            currentMatchId = matchId;

            ws.onopen = () => {
                log('成功连接到比赛: ' + matchId, 'status');
                updateStatus('正在观战');
                document.getElementById('currentMatch').textContent = matchId;
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log('收到消息:', data);

                switch(data.type) {
                    case 'spectator_joined':
                        document.getElementById('spectatorCount').textContent = data.payload.spectatorCount;
                        log('成功加入观战！比赛: ' + data.payload.match.playerA.name + ' vs ' + data.payload.match.playerB.name, 'status');
                        break;
                    case 'move':
                        log('👟 <strong>' + data.payload.playerName + '</strong> ' + data.payload.action + ' ' + data.payload.position, 'move');
                        break;
                    case 'attack':
                        log('⚔️ <strong>' + data.payload.playerName + '</strong> ' + data.payload.action + ' (伤害: ' + data.payload.damage + ')', 'attack');
                        break;
                    case 'defense':
                        log('🛡️ <strong>' + data.payload.playerName + '</strong> ' + data.payload.action + ' (防御值: ' + data.payload.defenseValue + ')', 'defense');
                        break;
                    case 'score_update':
                        let scores = Object.entries(data.payload).map(([id, val]) => id.slice(-4) + ': ' + val).join(' | ');
                        log('📊 比分更新: ' + scores, 'score');
                        break;
                    case 'game_status':
                        document.getElementById('spectatorCount').textContent = data.payload.spectatorCount;
                        log('⏱️ 比赛进行中 - 时长: ' + data.payload.duration + '秒', 'status');
                        break;
                    case 'game_end':
                        log('🏆 比赛结束! 获胜者: <strong>' + data.payload.winnerName + '</strong>', 'end');
                        log('最终比分: ' + Object.entries(data.payload.finalScore).map(([id, val]) => id.slice(-4) + ': ' + val).join(' - '), 'end');
                        updateStatus('比赛结束');
                        break;
                    case 'error':
                        log('❌ 错误: ' + data.payload.message, 'end');
                        break;
                }
            };

            ws.onclose = () => {
                log('连接已断开');
                updateStatus('未连接');
                ws = null;
            };

            ws.onerror = (error) => {
                log('WebSocket错误: ' + error);
            };
        }

        document.getElementById('refreshBtn').addEventListener('click', refreshMatchList);
        
        setInterval(refreshMatchList, 5000);
        refreshMatchList();
    </script>
</body>
</html>
		`))
	})

	fmt.Println("游戏后端服务启动中...")
	fmt.Println("WebSocket服务地址: ws://localhost:8080/ws")
	fmt.Println("观战者WebSocket: ws://localhost:8080/spectator/ws?matchId=xxx")
	fmt.Println("玩家测试页面: http://localhost:8080/")
	fmt.Println("观战者测试页面: http://localhost:8080/spectator")
	fmt.Println("比赛列表API: http://localhost:8080/matches")
	fmt.Println("按 Ctrl+C 停止服务")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		fmt.Printf("服务器启动失败: %v\n", err)
	}
}
