import { Howl } from 'howler';

class AudioEngine {
  constructor() {
    this.sounds = {};
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
  }

  getDirectionParams(direction) {
    let pan = 0;
    let isFront = true;

    switch (direction) {
      case 'north':
        pan = 0;
        isFront = true;
        break;
      case 'south':
        pan = 0;
        isFront = false;
        break;
      case 'east':
      case 'right':
        pan = 0.7;
        isFront = true;
        break;
      case 'west':
      case 'left':
        pan = -0.7;
        isFront = true;
        break;
      case 'northeast':
        pan = 0.4;
        isFront = true;
        break;
      case 'northwest':
        pan = -0.4;
        isFront = true;
        break;
      case 'southeast':
        pan = 0.4;
        isFront = false;
        break;
      case 'southwest':
        pan = -0.4;
        isFront = false;
        break;
      default:
        pan = 0;
        isFront = true;
    }

    return { pan, isFront };
  }

  playSound(soundType, direction, volume = 1.0) {
    if (!this.initialized) {
      this.init();
    }

    const { pan, isFront } = this.getDirectionParams(direction);
    this.playOscillatorSound(soundType, pan, isFront, volume);
  }

  playOscillatorSound(type, pan, isFront, volume) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const panNode = audioContext.createStereoPanner();

    panNode.pan.value = pan;
    gainNode.gain.value = volume * 0.3;

    if (!isFront) {
      const filterNode = audioContext.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.value = 600;
      filterNode.Q.value = 0.5;

      oscillator.connect(gainNode);
      gainNode.connect(filterNode);
      filterNode.connect(panNode);
      panNode.connect(audioContext.destination);
    } else {
      oscillator.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(audioContext.destination);
    }

    const baseFreq = isFront ? 1 : 0.7;

    switch (type) {
      case 'footstep':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(150 * baseFreq, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(80 * baseFreq, audioContext.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
        break;
      case 'wall_hit':
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200 * baseFreq, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100 * baseFreq, audioContext.currentTime + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
        break;
      case 'wall_echo':
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(120 * baseFreq, audioContext.currentTime);
        gainNode.gain.value = volume * 0.15;
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
        break;
      case 'enemy_growl':
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime((80 + Math.random() * 40) * baseFreq, audioContext.currentTime);
        oscillator.frequency.setValueAtTime((60 + Math.random() * 30) * baseFreq, audioContext.currentTime + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
        break;
      default:
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    }
  }

  playAudioFeedbacks(audioFeedbacks) {
    audioFeedbacks.forEach((feedback, index) => {
      setTimeout(() => {
        this.playSound(feedback.sound_type, feedback.direction, feedback.volume);
      }, index * 100);
    });
  }
}

export const audioEngine = new AudioEngine();
