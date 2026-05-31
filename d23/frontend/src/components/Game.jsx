import { useEffect, useCallback, useState } from 'react';
import { useGameAPI } from '../hooks/useGameAPI';
import { useWindowPosition } from '../hooks/useWindowPosition';
import { audioEngine } from '../audioEngine';

const directionNames = {
  north: '北',
  east: '东',
  south: '南',
  west: '西',
  northeast: '东北',
  northwest: '西北',
  southeast: '东南',
  southwest: '西南',
};

export default function Game() {
  useWindowPosition();
  const { gameState, loading, newGame, movePlayer, nextGame } = useGameAPI();
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        await newGame();
      } catch (e) {
        console.error('Failed to start game:', e);
      }
    };
    init();
  }, [newGame]);

  useEffect(() => {
    if (!gameState || gameState.game_over || gameState.victory) return;
    
    const timer = setInterval(() => {
      setCurrentTime(prev => prev + 0.1);
    }, 100);

    return () => clearInterval(timer);
  }, [gameState]);

  useEffect(() => {
    if (gameState) {
      setCurrentTime(gameState.game_time);
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState && gameState.audio_feedback) {
      audioEngine.playAudioFeedbacks(gameState.audio_feedback);
    }
  }, [gameState]);

  const handleMove = useCallback(async (direction) => {
    if (loading || !gameState || gameState.game_over || gameState.victory) return;
    try {
      await movePlayer(direction);
    } catch (e) {
      console.error('Move failed:', e);
    }
  }, [loading, gameState, movePlayer]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const keyMap = {
        ArrowUp: 'north',
        w: 'north',
        W: 'north',
        ArrowRight: 'east',
        d: 'east',
        D: 'east',
        ArrowDown: 'south',
        s: 'south',
        S: 'south',
        ArrowLeft: 'west',
        a: 'west',
        A: 'west',
      };

      if (keyMap[e.key]) {
        e.preventDefault();
        handleMove(keyMap[e.key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove]);

  const handleRestart = async () => {
    try {
      await newGame();
    } catch (e) {
      console.error('Failed to restart:', e);
    }
  };

  const handleNextGame = async () => {
    try {
      await nextGame();
    } catch (e) {
      console.error('Failed to start next game:', e);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDirectionSymbol = (index) => {
    const symbols = ['↑', '→', '↓', '←'];
    return symbols[index];
  };

  const getDirectionName = (index) => {
    const names = ['北', '东', '南', '西'];
    return names[index];
  };

  if (!gameState) {
    return (
      <div className="game-container">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="game-header">
        <h1>🎧 音频地牢</h1>
        <div className="player-stats">
          <div className="stat">
            <span className="stat-label">难度:</span>
            <span className="stat-value difficulty">Lv.{gameState.difficulty.current_level}</span>
          </div>
          <div className="stat">
            <span className="stat-label">时间:</span>
            <span className="stat-value time">{formatTime(currentTime)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">生命值:</span>
            <div className="hp-bar">
              <div 
                className="hp-fill" 
                style={{ width: `${(gameState.player.hp / gameState.player.max_hp) * 100}%` }}
              />
            </div>
            <span className="stat-value">{gameState.player.hp}/{gameState.player.max_hp}</span>
          </div>
          <div className="stat">
            <span className="stat-label">经验:</span>
            <span className="stat-value">{gameState.player.exp}</span>
          </div>
        </div>
      </div>

      <div className="game-content">
        <div className="surrounding-panel">
          <h2>周围环境</h2>
          <div className="surrounding-grid">
            {gameState.surrounding.map((tile, index) => (
              <div key={index} className={`tile ${tile}`}>
                <span className="tile-symbol">{getDirectionSymbol(index)}</span>
                <span className="tile-name">{getDirectionName(index)}</span>
                <span className="tile-type">
                  {tile === 'floor' ? '地板' : tile === 'wall' ? '墙壁' : '楼梯'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="message-panel">
          <h2>消息</h2>
          <p className="message">{gameState.message || '使用方向键或WASD移动...'}</p>
          <div className="difficulty-info">
            <p>🗺️ 地图: {gameState.difficulty.map_size}x{gameState.difficulty.map_size}</p>
            <p>👾 敌人: {gameState.difficulty.enemy_count}</p>
            {gameState.difficulty.best_clear_time && (
              <p>🏆 最佳: {formatTime(gameState.difficulty.best_clear_time)}</p>
            )}
          </div>
        </div>

        <div className="enemies-panel">
          <h2>附近敌人</h2>
          {gameState.enemies.length === 0 ? (
            <p className="no-enemies">附近没有敌人</p>
          ) : (
            <ul className="enemies-list">
              {gameState.enemies.map((enemy) => (
                <li key={enemy.id} className="enemy-item">
                  <span className="enemy-name">{enemy.name}</span>
                  <span className="enemy-direction">{directionNames[enemy.direction] || enemy.direction}</span>
                  <span className="enemy-distance">{enemy.distance.toFixed(1)} 格</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="controls-panel">
        <h2>控制</h2>
        <div className="direction-pad">
          <button 
            className="direction-btn north" 
            onClick={() => handleMove('north')}
            disabled={loading || gameState.game_over || gameState.victory}
          >
            ↑
          </button>
          <div className="middle-row">
            <button 
              className="direction-btn west" 
              onClick={() => handleMove('west')}
              disabled={loading || gameState.game_over || gameState.victory}
            >
              ←
            </button>
            <button 
              className="direction-btn south" 
              onClick={() => handleMove('south')}
              disabled={loading || gameState.game_over || gameState.victory}
            >
              ↓
            </button>
            <button 
              className="direction-btn east" 
              onClick={() => handleMove('east')}
              disabled={loading || gameState.game_over || gameState.victory}
            >
              →
            </button>
          </div>
        </div>
        <p className="control-hint">或使用 WASD / 方向键</p>
      </div>

      {gameState.game_over && (
        <div className="game-over-modal">
          <div className="modal-content">
            <h2>💀 游戏结束</h2>
            <p>你被击败了...</p>
            <p className="time-display">用时: {formatTime(currentTime)}</p>
            <button className="restart-btn" onClick={handleRestart}>
              重新开始
            </button>
          </div>
        </div>
      )}

      {gameState.victory && (
        <div className="game-over-modal victory">
          <div className="modal-content">
            <h2>🎉 胜利！</h2>
            <p>你成功找到了楼梯！</p>
            <p className="time-display">用时: {formatTime(currentTime)}</p>
            {gameState.difficulty.last_clear_time && (
              <p className="clear-time">上次通关: {formatTime(gameState.difficulty.last_clear_time)}</p>
            )}
            <div className="button-group">
              <button className="restart-btn" onClick={handleRestart}>
                重新开始
              </button>
              <button className="next-game-btn" onClick={handleNextGame}>
                下一关 ➡️
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
