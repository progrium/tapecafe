import '@livekit/components-styles'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  GridLayout,
  CarouselLayout,
  useTracks,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { Chat, formatChatMessageLinks, Settings, ControlBar, HoldToTalk } from './vendor/livekit'
import { CustomParticipantTile } from './components/CustomParticipantTile'
import { StreamParticipantTile } from './components/StreamParticipantTile'
import { Track } from 'livekit-client'
import { getRoomFromToken, getParticipantFromToken } from './utils'
import { useState, useRef, useEffect } from 'react'

// Helper function to extract display name from participant metadata
function getDisplayName(participant) {
  if (!participant) return 'Unknown'

  try {
    if (participant.metadata) {
      const metadata = JSON.parse(participant.metadata)
      if (metadata.displayName) {
        return metadata.displayName
      }
    }
  } catch (error) {
    // Ignore JSON parse errors
  }

  return participant.name || participant.identity || 'Unknown'
}

function VideoRoom({ url, token, displayName, onDisconnect }) {
  const roomName = getRoomFromToken(token)

  const handleConnected = async (room) => {
    console.log('✅ Successfully connected to room:', room?.name || roomName || 'Unknown')
    console.log('🎥 Track pre-acquisition will happen when localParticipant is ready')
  }

  const handleDisconnected = (reason) => {
    console.log('❌ Disconnected from room. Reason:', reason)
    if (reason) {
      console.error('Disconnect reason details:', reason)
    }
    onDisconnect()
  }

  const handleError = (error) => {
    console.error('🚫 Room connection error:', error)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
          stopLocalTrackOnUnpublish: false,  // Keep local tracks active when unpublished
          videoCaptureDefaults: {
            resolution: { width: 1280, height: 720 },
          },
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        }}
        data-lk-theme="default"
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
        onConnected={handleConnected}
        onDisconnected={handleDisconnected}
        onError={handleError}
      >
        <RoomContent displayName={displayName} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  )
}

function RoomContent({ displayName }) {
  const { localParticipant } = useLocalParticipant()
  const allParticipants = useParticipants()
  const room = useRoomContext()

  // Filter out bot participants
  const participants = allParticipants.filter(participant =>
    participant.identity !== 'streambot' && participant.identity !== 'chat-bot'
  )
  const [chatWidth, setChatWidth] = useState(300)
  const [participantsHeight, setParticipantsHeight] = useState(150)
  const [showSettings, setShowSettings] = useState(false)
  const isResizing = useRef(false)
  const isVerticalResizing = useRef(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const startWidth = useRef(0)
  const startHeight = useRef(0)

  // Set metadata when signal is connected and participant is ready
  useEffect(() => {
    if (!room || !displayName) return

    const handleSignalConnected = async () => {
      console.log('📡 Signal connected, setting metadata...')
      try {
        const metadata = JSON.stringify({ displayName })
        console.log('Setting metadata:', metadata)
        await room.localParticipant.setMetadata(metadata)
        console.log('✏️ Successfully set display name metadata:', displayName)

        // Manually trigger metadata change event since local participant doesn't always emit it
        room.emit('participantMetadataChanged', room.localParticipant)
        console.log('🔄 Manually triggered participantMetadataChanged event')
      } catch (error) {
        console.error('Failed to set participant metadata:', error)
      }
    }

    room.on('signalConnected', handleSignalConnected)

    return () => {
      room.off('signalConnected', handleSignalConnected)
    }
  }, [room, displayName])

  // Pre-acquire tracks when localParticipant becomes available
  useEffect(() => {
    if (!room || !localParticipant) return

    // Don't re-acquire if we already have tracks
    if (room._preAcquiredVideoTrack || room._tracksBeingAcquired) return

    room._tracksBeingAcquired = true

    const preAcquireTracks = async () => {
      console.log('🎥 Local participant ready - creating tracks for instant toggling...')

      try {
        // Import the necessary classes
        const { createLocalVideoTrack, createLocalAudioTrack } = await import('livekit-client')

        // Create tracks but don't publish them yet
        const videoTrack = await createLocalVideoTrack()
        const audioTrack = await createLocalAudioTrack()

        console.log('📷 Local video track created:', !!videoTrack)
        console.log('🎤 Local audio track created:', !!audioTrack)

        // Store tracks on the room for later use
        room._preAcquiredVideoTrack = videoTrack
        room._preAcquiredAudioTrack = audioTrack

        console.log('🚀 Tracks ready - toggling should now be instant!')
      } catch (error) {
        console.error('Failed to create local tracks:', error)
        console.log('⚠️ Falling back to regular track creation on demand')
      } finally {
        room._tracksBeingAcquired = false
      }
    }

    preAcquireTracks()
  }, [room, localParticipant])

  // Local participant available for use if needed

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )

  // Filter out muted camera tracks to completely hide them
  const tracks = allTracks.filter(trackRef => {
    // Always show screen share tracks
    if (trackRef.source === Track.Source.ScreenShare) {
      return true
    }

    // For camera tracks, only show if the track is not muted
    if (trackRef.source === Track.Source.Camera) {
      // Hide camera tracks that are muted
      return !trackRef.publication?.isMuted
    }

    return true
  })

  // Filter tracks for GridLayout - only streambot
  const gridTracks = tracks.filter(trackRef => {
    return trackRef.participant?.identity === 'streambot'
  })

  // Filter tracks for CarouselLayout - everyone except streambot
  const carouselTracks = tracks.filter(trackRef => {
    return trackRef.participant?.identity !== 'streambot'
  })

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizing.current) {
        const deltaX = startX.current - e.clientX
        const newWidth = startWidth.current + deltaX

        // Constrain width between 200px and 600px
        if (newWidth >= 200 && newWidth <= 600) {
          setChatWidth(newWidth)
        }
      }

      if (isVerticalResizing.current) {
        const deltaY = e.clientY - startY.current
        const newHeight = startHeight.current + deltaY

        // Constrain height between 100px and 400px
        if (newHeight >= 100 && newHeight <= 400) {
          setParticipantsHeight(newHeight)
        }
      }
    }

    const handleMouseUp = () => {
      isResizing.current = false
      isVerticalResizing.current = false
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleHorizontalMouseDown = (e) => {
    isResizing.current = true
    startX.current = e.clientX
    startWidth.current = chatWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  const handleVerticalMouseDown = (e) => {
    isVerticalResizing.current = true
    startY.current = e.clientY
    startHeight.current = participantsHeight
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          {/* Grid Layout (only streambot) - Full size background */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <GridLayout tracks={gridTracks} style={{ height: '100%' }}>
              <StreamParticipantTile />
            </GridLayout>
          </div>
          {/* Carousel Layout (everyone except streambot) - Overlaid with transparent background */}
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '125px',
            pointerEvents: 'auto' // Ensure carousel controls remain interactive
          }}>
            <CarouselLayout tracks={carouselTracks} style={{ height: '100%' }}>
              <CustomParticipantTile />
            </CarouselLayout>
          </div>
        </div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          flexShrink: 0,
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <ControlBar controls={{ leave: true, holdToTalk: false }} />
          <div style={{ flex: 1 }} />
          <div className="lk-control-bar">
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                padding: '0.625rem 1rem',
                backgroundColor: 'var(--lk-control-bg)',
                color: 'var(--lk-control-fg)',
                border: 'none',
                borderRadius: 'var(--lk-border-radius)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--lk-control-hover-bg)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--lk-control-bg)'}
            >
              ⚙️ Settings
            </button>
          </div>
        </div>
      </div>
      <div
        style={{
          width: '5px',
          background: '#e0e0e0',
          cursor: 'col-resize',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.2s'
        }}
        onMouseDown={handleHorizontalMouseDown}
        onMouseEnter={(e) => e.currentTarget.style.background = '#bbb'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#e0e0e0'}
      />
      <div style={{ width: `${chatWidth}px`, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Participants Section */}
        <div style={{
          height: `${participantsHeight}px`,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgb(29.75, 29.75, 29.75)' // Match chat background
        }}>
          <div style={{
            padding: '10px',
            background: 'rgb(29.75, 29.75, 29.75)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            textAlign: 'center',
            fontWeight: 'bold',
            color: '#fff'
          }}>
            Participants ({participants.length})
          </div>
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '5px'
          }}>
            {/* Local participant */}
            <div style={{
              padding: '5px 10px',
              borderRadius: '4px',
              marginBottom: '2px',
              background: 'rgba(31, 140, 249, 0.2)', // Subtle blue for local user
              fontSize: '14px',
              color: '#fff'
            }}>
              {getDisplayName(localParticipant) || 'You'} (You)
            </div>
            {/* Remote participants */}
            {participants
              .filter(participant => participant.identity !== localParticipant?.identity)
              .map((participant) => (
                <div key={participant.identity} style={{
                  padding: '5px 10px',
                  borderRadius: '4px',
                  marginBottom: '2px',
                  background: 'rgba(255, 255, 255, 0.05)', // Subtle dark background
                  fontSize: '14px',
                  color: '#fff'
                }}>
                  {getDisplayName(participant)}
                </div>
              ))}
          </div>
        </div>

        {/* Vertical Resize Handle */}
        <div
          style={{
            height: '5px',
            background: '#e0e0e0',
            cursor: 'row-resize',
            flexShrink: 0,
            transition: 'background 0.2s'
          }}
          onMouseDown={handleVerticalMouseDown}
          onMouseEnter={(e) => e.currentTarget.style.background = '#bbb'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#e0e0e0'}
        />

        {/* Chat Section */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Chat
            style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}
            messageFormatter={formatChatMessageLinks}
          />
        </div>

        {/* Push-to-Talk Section */}
        <div style={{
          height: 'auto',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgb(29.75, 29.75, 29.75)', // Match chat background
          flexShrink: 0
        }}>
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px'
          }}>
            <HoldToTalk />
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <>
          {/* Modal Backdrop */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999
            }}
            onClick={() => setShowSettings(false)}
          />
          {/* Modal Content */}
          <div
            className="lk-settings-menu-modal"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1000,
              backgroundColor: 'var(--lk-bg2)',
              borderRadius: 'var(--lk-border-radius)',
              boxShadow: 'var(--lk-box-shadow)',
              border: '1px solid var(--lk-border-color)'
            }}
          >
            <Settings onClose={() => setShowSettings(false)} />
          </div>
        </>
      )}
    </div>
  )
}

export default VideoRoom
