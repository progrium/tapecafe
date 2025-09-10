import { useState, useEffect, useRef } from 'react'

function Timeline({ url, onSendMessage }) {
  const [timelineState, setTimelineState] = useState({
    title: '',
    currentTime: 0,
    totalTime: 0,
    playing: false
  })
  const [hoverTime, setHoverTime] = useState(null)
  const [hoverPosition, setHoverPosition] = useState(0)
  const progressBarRef = useRef(null)

  useEffect(() => {
    if (!url) return

    const u = new URL(url)
    const room = u.pathname.slice(1)
    u.pathname = "/-/state"
    u.searchParams.set("room", room)
    const stateFeed = new WebSocket(u.toString())

    stateFeed.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data)
        console.log('Timeline received state update:', update)
        // Map SharedState to timeline state
        setTimelineState({
          title: update.Title || '',
          currentTime: update.PositionMs || 0,
          totalTime: update.LengthMs || 0,
          playing: update.Status === '' // Empty status means playing
        })
      } catch (error) {
        console.error('Failed to parse state data:', error)
      }
    }

    stateFeed.onerror = (error) => {
      console.error('Timeline websocket error:', error)
    }

    stateFeed.onclose = () => {
      console.log('Timeline websocket closed')
    }

    return () => {
      stateFeed.close()
    }
  }, [url])

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

  // Handle mouse hover over progress bar
  const handleMouseMove = (e) => {
    if (!progressBarRef.current || timelineState.totalTime === 0) return

    const rect = progressBarRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    const time = (percentage / 100) * timelineState.totalTime

    setHoverTime(time)
    setHoverPosition(x)
  }

  const handleMouseLeave = () => {
    setHoverTime(null)
  }

  const handleClick = (e) => {
    if (!progressBarRef.current || timelineState.totalTime === 0 || !onSendMessage) return

    const rect = progressBarRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    const time = (percentage / 100) * timelineState.totalTime

    // Send seek command with formatted time (same format as tooltip)
    const formattedTime = formatTime(time)
    onSendMessage(`/seek ${formattedTime}`)
  }

  return (
    <div style={{
      backgroundColor: 'var(--lk-bg2)',
      padding: '12px 16px 8px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      color: 'white',
      fontSize: '13px'
    }}>
      {/* Title row */}
      {timelineState.title && (
        <div style={{
          fontSize: '14px',
          fontWeight: '500',
          color: 'rgba(255, 255, 255, 0.9)',
          marginBottom: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {timelineState.title}
        </div>
      )}

      {/* Timeline controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        {/* Current time */}
        <span style={{
          minWidth: '45px',
          textAlign: 'right',
          fontSize: '12px',
          fontFamily: 'monospace',
          color: 'rgba(255, 255, 255, 0.9)'
        }}>
          {formatTime(timelineState.currentTime)}
        </span>

        {/* Progress bar container */}
        <div
          ref={progressBarRef}
          style={{
            flex: 1,
            height: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '3px',
            overflow: 'visible',
            cursor: 'pointer',
            position: 'relative'
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          {/* Hover tooltip */}
          {hoverTime !== null && (
            <div style={{
              position: 'absolute',
              bottom: '14px',
              left: `${hoverPosition}px`,
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
            }}>
              {formatTime(hoverTime)}
            </div>
          )}

          {/* Progress bar track */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            {/* Progress fill */}
            <div style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: '#ff0000',
              borderRadius: '3px',
              transition: 'width 0.1s ease-out',
              position: 'relative'
            }}>
              {/* Progress bar handle */}
              <div style={{
                position: 'absolute',
                right: '-6px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '12px',
                height: '12px',
                backgroundColor: '#ff0000',
                borderRadius: '50%',
                boxShadow: '0 0 4px rgba(0, 0, 0, 0.5)'
              }} />
            </div>
          </div>
        </div>

        {/* Total time */}
        <span style={{
          minWidth: '45px',
          fontSize: '12px',
          fontFamily: 'monospace',
          color: 'rgba(255, 255, 255, 0.9)'
        }}>
          {formatTime(timelineState.totalTime)}
        </span>

        {/* Playing indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: timelineState.playing ? '#00ff00' : '#666',
            flexShrink: 0,
            boxShadow: timelineState.playing ? '0 0 6px #00ff00' : 'none'
          }} />
          <span style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.7)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {timelineState.playing ? 'Live' : 'Paused'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default Timeline
