import React from 'react';

/**
 * Transport controls component for playback functionality
 */
export function ControlBar({
  controls = {
    playback: false
  },
  className,
  ...props
}) {
  const showPlayback = controls.playback;

  const handleBackward = () => {
    // TODO: Implement 15 second backward functionality
    console.log('Backward 15 seconds');
  };

  const handlePlay = () => {
    // TODO: Implement play functionality
    console.log('Play');
  };

  const handlePause = () => {
    // TODO: Implement pause functionality
    console.log('Pause');
  };

  const handleForward = () => {
    // TODO: Implement 15 second forward functionality
    console.log('Forward 15 seconds');
  };

  // Only render transport controls if playback is enabled
  if (!showPlayback) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      justifyContent: 'center'
    }}>
      <button
        className="lk-button"
        onClick={handleBackward}
        title="Back 15 seconds"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          <text x="12" y="16" textAnchor="middle" fontSize="8" fill="currentColor">15</text>
        </svg>
      </button>

      <button
        className="lk-button"
        onClick={handlePlay}
        title="Play"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>

      <button
        className="lk-button"
        onClick={handlePause}
        title="Pause"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      </button>

      <button
        className="lk-button"
        onClick={handleForward}
        title="Forward 15 seconds"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
          <text x="12" y="16" textAnchor="middle" fontSize="8" fill="currentColor">15</text>
        </svg>
      </button>
    </div>
  );
}

