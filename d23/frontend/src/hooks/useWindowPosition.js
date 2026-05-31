import { useEffect } from 'react';

const STORAGE_KEY = 'audio_dungeon_window_state';

export function useWindowPosition() {
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const { width, height, x, y } = JSON.parse(savedState);
        if (width && height) {
          window.resizeTo(width, height);
        }
        if (x !== undefined && y !== undefined) {
          window.moveTo(x, y);
        }
      } catch (e) {
        console.error('Failed to restore window state:', e);
      }
    }

    const saveWindowState = () => {
      const state = {
        width: window.outerWidth,
        height: window.outerHeight,
        x: window.screenX,
        y: window.screenY,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    };

    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(saveWindowState, 500);
    };

    let moveTimeout;
    const handleMove = () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(saveWindowState, 500);
    };

    window.addEventListener('resize', handleResize);
    
    const moveInterval = setInterval(() => {
      const savedState = localStorage.getItem(STORAGE_KEY);
      let currentX = window.screenX;
      let currentY = window.screenY;
      
      if (savedState) {
        try {
          const { x, y } = JSON.parse(savedState);
          if (currentX !== x || currentY !== y) {
            saveWindowState();
          }
        } catch (e) {}
      }
    }, 1000);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(moveInterval);
      clearTimeout(resizeTimeout);
      clearTimeout(moveTimeout);
    };
  }, []);
}
