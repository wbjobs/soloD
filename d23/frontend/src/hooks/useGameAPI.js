import { useState, useCallback } from 'react';

const API_BASE = '/api/game';

export function useGameAPI() {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleResponse = useCallback(async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }, []);

  const newGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await handleResponse(response);
      setGameState(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [handleResponse]);

  const nextGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/next`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await handleResponse(response);
      setGameState(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [handleResponse]);

  const movePlayer = useCallback(async (direction) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ direction }),
      });
      const data = await handleResponse(response);
      setGameState(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [handleResponse]);

  const getState = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/state`);
      const data = await handleResponse(response);
      setGameState(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [handleResponse]);

  return {
    gameState,
    loading,
    error,
    newGame,
    nextGame,
    movePlayer,
    getState,
  };
}
