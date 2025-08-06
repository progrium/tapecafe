import { useState, useEffect, useCallback } from 'react'
import { MediaDeviceMenu } from '@livekit/components-react'
import { useRoomContext } from '@livekit/components-react'

export function Settings({ onClose }) {
  const room = useRoomContext()
  const [displayName, setDisplayName] = useState(() => {
    // Try to get current display name from metadata
    try {
      if (room?.localParticipant?.metadata) {
        const metadata = JSON.parse(room.localParticipant.metadata)
        return metadata.displayName || ''
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return ''
  })

  const [devices, setDevices] = useState({ cameras: [], microphones: [] })
  const [selectedCamera, setSelectedCamera] = useState(() => localStorage.getItem('selectedCamera') || '')
  const [selectedMicrophone, setSelectedMicrophone] = useState(() => localStorage.getItem('selectedMicrophone') || '')

  // Get available devices
  useEffect(() => {
    async function getDevices() {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices()
        const cameras = deviceList.filter(device => device.kind === 'videoinput')
        const microphones = deviceList.filter(device => device.kind === 'audioinput')
        setDevices({ cameras, microphones })
      } catch (error) {
        console.error('Error getting devices:', error)
      }
    }
    getDevices()
  }, [])

  // Handle device changes - update localStorage and refresh tracks if needed
  const handleDeviceChange = (kind, deviceId) => {
    console.log('🔄 Device changed in settings:', kind, deviceId)
    
    if (kind === 'videoinput') {
      localStorage.setItem('selectedCamera', deviceId)
      setSelectedCamera(deviceId)
    } else if (kind === 'audioinput') {
      localStorage.setItem('selectedMicrophone', deviceId)
      setSelectedMicrophone(deviceId)
    }
    
    // Refresh video tracks if currently active
    if (window._refreshVideoTracks) {
      window._refreshVideoTracks()
    }
  }

  // Get device name by ID
  const getDeviceName = (devices, deviceId) => {
    const device = devices.find(d => d.deviceId === deviceId)
    return device?.label || 'Default'
  }

  // Auto-save display name when closing
  const handleClose = useCallback(async () => {
    if (room?.localParticipant && displayName.trim()) {
      try {
        const metadata = JSON.stringify({ displayName: displayName.trim() })
        await room.localParticipant.setMetadata(metadata)
        console.log('✏️ Settings: Updated display name to:', displayName.trim())

        // Manually trigger metadata change event for ParticipantNamesContext
        room.emit('participantMetadataChanged', metadata, room.localParticipant)
        console.log('✏️ Settings: Manually triggered participantMetadataChanged event')

        // Also save to localStorage for future sessions
        localStorage.setItem('displayName', displayName.trim())
      } catch (error) {
        console.error('Failed to update display name:', error)
      }
    }
    
    if (onClose) {
      onClose()
    }
  }, [room, displayName, onClose])

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleEscapeKey)

    return () => {
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [handleClose])

  return (
    <div style={{
      padding: '1.5rem',
      width: 'fit-content',
      minWidth: '320px',
      backgroundColor: 'var(--lk-bg2)',
      color: 'var(--lk-fg)',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.75rem',
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '1.2rem',
          color: 'var(--lk-fg)'
        }}>
          Settings
        </h3>
        {onClose && (
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--lk-fg)',
              cursor: 'pointer',
              fontSize: '1.5rem',
              padding: '0.25rem'
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Display Name Section */}
      <div style={{ 
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem'
        }}>
          <span style={{ fontSize: '1.1rem' }}>👤</span>
          <h4 style={{
            margin: 0,
            fontSize: '0.95rem',
            fontWeight: '600',
            color: 'var(--lk-fg)'
          }}>
            Display Name
          </h4>
        </div>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter display name"
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: 'var(--lk-control-bg)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            color: 'var(--lk-fg)',
            fontSize: '0.875rem'
          }}
        />
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--lk-fg3)',
          marginTop: '0.5rem',
          opacity: 0.7
        }}>
          Changes save automatically when you close settings
        </div>
      </div>

      {/* Audio Device Section */}
      <div style={{ 
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem'
        }}>
          <span style={{ fontSize: '1.1rem' }}>🎤</span>
          <h4 style={{
            margin: 0,
            fontSize: '0.95rem',
            fontWeight: '600',
            color: 'var(--lk-fg)'
          }}>
            Microphone
          </h4>
        </div>
        <select
          value={selectedMicrophone}
          onChange={(e) => handleDeviceChange('audioinput', e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: 'var(--lk-control-bg)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            color: 'var(--lk-fg)',
            fontSize: '0.875rem',
            cursor: 'pointer'
          }}
        >
          {devices.microphones.map(mic => (
            <option key={mic.deviceId} value={mic.deviceId}>
              {mic.label || `Microphone ${mic.deviceId.substr(0, 8)}`}
            </option>
          ))}
        </select>
      </div>

      {/* Video Device Section */}
      <div style={{ 
        marginBottom: '1rem',
        padding: '1rem',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem'
        }}>
          <span style={{ fontSize: '1.1rem' }}>📷</span>
          <h4 style={{
            margin: 0,
            fontSize: '0.95rem',
            fontWeight: '600',
            color: 'var(--lk-fg)'
          }}>
            Camera
          </h4>
        </div>
        <select
          value={selectedCamera}
          onChange={(e) => handleDeviceChange('videoinput', e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: 'var(--lk-control-bg)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            color: 'var(--lk-fg)',
            fontSize: '0.875rem',
            cursor: 'pointer'
          }}
        >
          {devices.cameras.map(camera => (
            <option key={camera.deviceId} value={camera.deviceId}>
              {camera.label || `Camera ${camera.deviceId.substr(0, 8)}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
