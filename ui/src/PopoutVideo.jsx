import '@livekit/components-styles'
import {
  LiveKitRoom,
  GridLayout,
  useTracks,
} from '@livekit/components-react'
import { StreamParticipantTile } from './components/StreamParticipantTile'
import { Track } from 'livekit-client'

function PopoutVideo({ url, token }) {
  const handleConnected = (room) => {
    console.log('✅ Popout connected to room:', room?.name)
  }

  const handleDisconnected = (reason) => {
    console.log('❌ Popout disconnected. Reason:', reason)
    window.close() // Close the popup when disconnected
  }

  const handleError = (error) => {
    console.error('🚫 Popout connection error:', error)
  }

  return (
    <div style={{ height: '100vh', width: '100vw', backgroundColor: 'black' }}>
      <LiveKitRoom
        video={false}
        audio={false}
        token={token}
        serverUrl={url}
        connect={true}
        options={{
          publishDefaults: {
            simulcast: false,
          },
          stopLocalTrackOnUnpublish: false,
          videoCaptureDefaults: {
            resolution: { width: 1280, height: 720 },
          },
        }}
        data-lk-theme="default"
        style={{ height: '100%', width: '100%' }}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleError}
      >
        <PopoutContent />
      </LiveKitRoom>
    </div>
  )
}

function PopoutContent() {
  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )

  // Filter tracks for only streambot
  const streamTracks = allTracks.filter(trackRef => {
    return trackRef.participant?.identity === 'streambot'
  })

  const handleFullscreen = () => {
    const videoContainer = document.getElementById('popout-video-only')
    if (videoContainer) {
      if (videoContainer.requestFullscreen) {
        videoContainer.requestFullscreen()
      } else if (videoContainer.webkitRequestFullscreen) {
        // Safari
        videoContainer.webkitRequestFullscreen()
      } else if (videoContainer.msRequestFullscreen) {
        // IE/Edge
        videoContainer.msRequestFullscreen()
      }
    }
  }

  return (
    <div style={{ 
      height: '100%', 
      width: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      backgroundColor: 'black'
    }}>
      <div id="popout-video-only" style={{ flex: 1, position: 'relative' }}>
        <GridLayout tracks={streamTracks} style={{ height: '100%' }}>
          <StreamParticipantTile />
        </GridLayout>
      </div>
      <div style={{
        height: '48px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <button
          onClick={handleFullscreen}
          style={{
            padding: '8px 16px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
        >
          <span style={{ fontSize: '18px' }}>⛶</span>
          Fullscreen
        </button>
      </div>
    </div>
  )
}

export default PopoutVideo