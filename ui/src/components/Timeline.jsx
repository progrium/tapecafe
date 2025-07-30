import { useState, useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'

function Timeline() {
  const [timelineState, setTimelineState] = useState({
    title: '',
    currentTime: 0,
    totalTime: 0,
    playing: false
  })
  const room = useRoomContext()

  useEffect(() => {
    if (!room) return

    const handleDataReceived = (payload, participant) => {
      if (participant.identity === 'timelinebot') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload))
          if (data.currentTime !== undefined) {
            setTimelineState(data)
          }
        } catch (error) {
          console.error('Failed to parse timeline data:', error)
        }
      }
    }

    room.on('dataReceived', handleDataReceived)

    return () => {
      room.off('dataReceived', handleDataReceived)
    }
  }, [room])

  // Format time from milliseconds to MM:SS or HH:MM:SS
  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Don't render if we don't have valid timeline data
  if (timelineState.totalTime === 0) {
    return null
  }

  const progress = timelineState.totalTime > 0 ? (timelineState.currentTime / timelineState.totalTime) * 100 : 0

  return (
    <div style={{
      position: 'absolute',
      bottom: '60px', // Position above the control bar
      left: '12px',
      right: '12px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderRadius: '4px',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      color: 'white',
      fontSize: '14px',
      zIndex: 10
    }}>
      {/* Current time */}
      <span style={{ minWidth: '50px', textAlign: 'right' }}>
        {formatTime(timelineState.currentTime)}
      </span>

      {/* Progress bar */}
      <div style={{
        flex: 1,
        height: '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          backgroundColor: '#ff4444',
          borderRadius: '2px',
          transition: 'width 0.1s ease-out'
        }} />
      </div>

      {/* Total time */}
      <span style={{ minWidth: '50px' }}>
        {formatTime(timelineState.totalTime)}
      </span>

      {/* Playing indicator */}
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: timelineState.playing ? '#4CAF50' : '#666',
        flexShrink: 0
      }} />
    </div>
  )
}

export default Timeline