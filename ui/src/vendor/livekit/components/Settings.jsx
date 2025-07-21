import { useState } from 'react'
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

  const handleDisplayNameSubmit = async (e) => {
    e.preventDefault()
    if (!room?.localParticipant || !displayName.trim()) return

    try {
      const metadata = JSON.stringify({ displayName: displayName.trim() })
      await room.localParticipant.setMetadata(metadata)
      console.log('✏️ Updated display name to:', displayName.trim())
      
      // Also save to localStorage for future sessions
      localStorage.setItem('displayName', displayName.trim())
    } catch (error) {
      console.error('Failed to update display name:', error)
      alert('Failed to update display name')
    }
  }

  return (
    <div style={{ 
      padding: '1rem', 
      width: '300px',
      backgroundColor: 'var(--lk-bg2)',
      color: 'var(--lk-fg)',
      borderRadius: 'var(--lk-border-radius)'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem'
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
            onClick={onClose}
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
      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ 
          margin: '0 0 0.5rem 0', 
          fontSize: '0.9rem',
          color: 'var(--lk-fg3)'
        }}>
          Display Name
        </h4>
        <form onSubmit={handleDisplayNameSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter display name"
            style={{
              flex: 1,
              padding: '0.5rem',
              backgroundColor: 'var(--lk-control-bg)',
              border: '1px solid var(--lk-border-color)',
              borderRadius: 'var(--lk-border-radius)',
              color: 'var(--lk-fg)',
              fontSize: '0.875rem'
            }}
          />
          <button
            type="submit"
            disabled={!displayName.trim()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--lk-accent-bg)',
              color: 'var(--lk-accent-fg)',
              border: 'none',
              borderRadius: 'var(--lk-border-radius)',
              cursor: displayName.trim() ? 'pointer' : 'not-allowed',
              opacity: displayName.trim() ? 1 : 0.6,
              fontSize: '0.875rem'
            }}
          >
            Save
          </button>
        </form>
      </div>

      {/* Audio Device Section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ 
          margin: '0 0 0.5rem 0', 
          fontSize: '0.9rem',
          color: 'var(--lk-fg3)'
        }}>
          Microphone
        </h4>
        <MediaDeviceMenu kind="audioinput" />
      </div>

      {/* Video Device Section */}
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ 
          margin: '0 0 0.5rem 0', 
          fontSize: '0.9rem',
          color: 'var(--lk-fg3)'
        }}>
          Camera
        </h4>
        <MediaDeviceMenu kind="videoinput" />
      </div>
    </div>
  )
}