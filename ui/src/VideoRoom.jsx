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
  DisconnectButton,
} from '@livekit/components-react'
import { Chat, formatChatMessageLinks, Settings, ControlBar, HoldToTalk } from './vendor/livekit'
import { CustomParticipantTile } from './components/CustomParticipantTile'
import { StreamParticipantTile } from './components/StreamParticipantTile'
import Timeline from './components/Timeline'
import { Track, RoomEvent } from 'livekit-client'
import { getRoomFromToken, getParticipantFromToken } from './utils'
import { getParticipantColor } from './utils/participantColors'
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
  const [streambotVolume, setStreambotVolume] = useState(1.0)
  const [playbackStatus, setPlaybackStatus] = useState('')

  // Listen for volume changes from popup window
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'STREAMBOT_VOLUME_CHANGE') {
        setStreambotVolume(event.data.volume)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleConnected = async (room) => {
    console.log('✅ Successfully connected to room:', room?.name || roomName || 'Unknown')
    console.log('🎥 Track pre-acquisition will happen when localParticipant is ready')
    const stateFeed = new WebSocket(`${url}/state`)
    stateFeed.onerror = (error) => {
      console.error('🚫 State connection error:', error);
    }
    stateFeed.onopen = () => {
      console.log('🔄 State connection opened')
    }
    let linger = false
    let lastStatus = ""
    stateFeed.onmessage = (event) => {
      const update = JSON.parse(event.data)
      if (lastStatus !== "" && update.Status === "") {
        linger = true
        setTimeout(() => {
          linger = false
          console.log("🔄 Linger timeout")
        }, 2000);
      }
      if (!linger) {
        document.querySelector('#osd').textContent = update.Status;
      }
      lastStatus = update.Status
      
      // Update playback status
      setPlaybackStatus(update.Status)
      
      console.log('🔄 State message:', update.Status, update)
    }
    stateFeed.onerror = (error) => {
      console.error('🚫 State connection error:', error)
    }
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
        <RoomContent displayName={displayName} url={url} token={token} streambotVolume={streambotVolume} setStreambotVolume={setStreambotVolume} playbackStatus={playbackStatus} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  )
}

function RoomContent({ displayName, url, token, streambotVolume, setStreambotVolume, playbackStatus }) {
  const { localParticipant } = useLocalParticipant()
  const allParticipants = useParticipants()
  const room = useRoomContext()

  // Filter out bot participants
  const participants = allParticipants.filter(participant =>
    participant.identity !== 'streambot' && participant.identity !== 'chatbot'
  )

  // Determine if push-to-talk should be disabled based on playback status
  const isPushToTalkDisabled = () => {
    // Only disable during actual playback states, not when there's no content
    const disablingStatuses = ['Play', 'Playing', 'Forward', 'Back', 'Live feed']
    
    // Empty string means "Playing" - should disable
    // But we need to handle the case where empty string might also mean "no content"
    // Let's be more specific: only disable if we have a clear playback state
    const shouldDisable = disablingStatuses.includes(playbackStatus) || 
                         (playbackStatus === '' && document.querySelector('#osd')?.textContent !== '█ NO TAPE')
    
    console.log('🎙️ Playback status:', `"${playbackStatus}"`, 'OSD:', document.querySelector('#osd')?.textContent, 'Disabled:', shouldDisable)
    return shouldDisable
  }
  const [chatWidth, setChatWidth] = useState(300)
  const [participantsHeight, setParticipantsHeight] = useState(225)
  const [showSettings, setShowSettings] = useState(false)
  const [isVideoPoppedOut, setIsVideoPoppedOut] = useState(false)
  const [participantVolumes, setParticipantVolumes] = useState(new Map())
  const [hoveredAuthor, setHoveredAuthor] = useState(null)
  const chatRef = useRef(null)
  const isResizing = useRef(false)
  const isVerticalResizing = useRef(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const startWidth = useRef(0)
  const startHeight = useRef(0)
  const popupWindowRef = useRef(null)
  const popupVideoRef = useRef(null)

  // Function to update individual participant volume
  const updateParticipantVolume = (participantIdentity, volume) => {
    setParticipantVolumes(prev => new Map(prev.set(participantIdentity, volume)))

    // Find the participant and update their audio track volume
    const participant = allParticipants.find(p => p.identity === participantIdentity)
    if (participant) {
      // Get audio tracks for this participant
      const audioTracks = Array.from(participant.audioTrackPublications.values())
      audioTracks.forEach(publication => {
        if (publication.track && publication.track.setVolume) {
          publication.track.setVolume(volume)
          console.log(`🔊 Set volume ${volume} for participant ${participantIdentity}`)
        }
      })
    }
  }

  // Get volume for a participant (default to 1.0)
  const getParticipantVolume = (participantIdentity) => {
    return participantVolumes.get(participantIdentity) ?? 1.0
  }

  // Update streambot volume
  useEffect(() => {
    // Find streambot participant
    const streambot = allParticipants.find(p => p.identity === 'streambot')
    if (streambot) {
      // Get audio tracks for streambot
      const audioTracks = Array.from(streambot.audioTrackPublications.values())
      audioTracks.forEach(publication => {
        if (publication.track && publication.track.setVolume) {
          publication.track.setVolume(streambotVolume)
          console.log(`🎬 Set streambot volume to ${streambotVolume}`)
        }
      })
    }
  }, [streambotVolume, allParticipants])

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
        room.emit(RoomEvent.ParticipantMetadataChanged, metadata, room.localParticipant)
        console.log('🔄 Manually triggered participantMetadataChanged event with metadata:', metadata)
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

  // Sync popup video when tracks change
  useEffect(() => {
    if (popupVideoRef.current && popupWindowRef.current && !popupWindowRef.current.closed) {
      // Find the streambot video element
      let videoElement = document.querySelector('video[data-lk-source="camera"]')
      if (!videoElement) {
        videoElement = document.querySelector('.lk-grid-layout video')
      }
      if (!videoElement) {
        videoElement = document.querySelector('video')
      }

      if (videoElement && videoElement.srcObject) {
        // Re-assign the srcObject to sync the video state
        popupVideoRef.current.srcObject = videoElement.srcObject
        
        // Sync play/pause state
        if (videoElement.paused) {
          popupVideoRef.current.pause()
        } else {
          popupVideoRef.current.play().catch(err => {
            console.log('Popup video play failed:', err)
          })
        }
      }
    }
  }, [gridTracks]) // Re-sync when grid tracks change

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
          {/* Grid Layout (only streambot) - Full size background - Hidden when popped out */}
          <div style={{
            position: 'absolute',
            inset: 0,
            visibility: isVideoPoppedOut ? 'hidden' : 'visible'
          }}>
            <div id="osd" style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              color: 'white',
              fontSize: '50px',
              zIndex: 10,
              pointerEvents: 'none',
              textShadow: '0 0 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.6)'
            }}>█ NO TAPE</div>
            <GridLayout tracks={gridTracks} style={{ height: '100%' }}>
              <StreamParticipantTile />
            </GridLayout>
          </div>

          {/* Carousel Layout (everyone except streambot) - Position changes based on popup state */}
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: isVideoPoppedOut ? '100%' : '160px', // Increased height to accommodate names
            pointerEvents: 'auto', // Ensure carousel controls remain interactive
            overflow: 'visible', // Allow names to extend beyond container
            display: 'flex',
            justifyContent: 'center'
          }}>
            <CarouselLayout 
              tracks={carouselTracks} 
              orientation="horizontal"
              style={{
                height: '100%',
                paddingTop: isVideoPoppedOut ? '80px' : '50px', // More padding when expanded
                boxSizing: 'border-box',
                overflow: 'visible' // Allow content to overflow
              }}>
              <CustomParticipantTile isVideoPoppedOut={isVideoPoppedOut} />
            </CarouselLayout>
          </div>

        </div>
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Timeline - shows video progress */}
          <Timeline url={url} onSendMessage={(message) => chatRef.current?.send(message)} />
          
          {/* Control bar with transport buttons */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            justifyContent: 'space-between',
            padding: '12px',
          }}>
          {/* Left section - Leave button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <DisconnectButton>
              Leave
            </DisconnectButton>
          </div>

          {/* Center section - Transport controls */}
          <ControlBar
            controls={{ leave: false, holdToTalk: false, playback: true }}
            onSendMessage={(message) => chatRef.current?.send(message)}
          />

          {/* Right section - Volume and popout */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Streambot Volume Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--lk-control-fg)' }}>🎬</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={streambotVolume}
                onChange={(e) => setStreambotVolume(parseFloat(e.target.value))}
                style={{
                  width: '80px',
                  height: '4px',
                  background: 'var(--lk-control-bg)',
                  borderRadius: '2px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
                title="Movie volume"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--lk-control-fg)', minWidth: '30px' }}>
                {Math.round(streambotVolume * 100)}%
              </span>
            </div>

            <button
              onClick={() => {
                // Find the streambot video element
                let videoElement = document.querySelector('video[data-lk-source="camera"]')
                if (!videoElement) {
                  videoElement = document.querySelector('.lk-grid-layout video')
                }
                if (!videoElement) {
                  videoElement = document.querySelector('video')
                }

                if (!videoElement || !videoElement.srcObject) {
                  console.error('No video stream available to pop out')
                  return
                }

                // Open popup window
                const popup = window.open('', 'videoPopout', 'width=800,height=600,resizable=yes,toolbar=no,menubar=no,scrollbars=no,status=no')

                if (popup) {
                  // Store popup window reference
                  popupWindowRef.current = popup

                  // Hide the main video in this window
                  setIsVideoPoppedOut(true)

                  // Listen for when the popup closes to restore the main video
                  const checkClosed = setInterval(() => {
                    if (popup.closed) {
                      setIsVideoPoppedOut(false)
                      
                      // Cleanup event listeners
                      if (popup._cleanupListeners) {
                        popup._cleanupListeners()
                      }
                      
                      popupWindowRef.current = null
                      popupVideoRef.current = null
                      clearInterval(checkClosed)
                    }
                  }, 1000)
                  popup.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <title>Video Stream</title>
                      <style>
                        body { margin: 0; padding: 0; background: black; overflow: hidden; }
                        #video-container {
                          height: calc(100vh - 48px);
                          display: flex;
                          align-items: center;
                          justify-content: center;
                        }
                        video {
                          width: 100%;
                          height: 100%;
                          object-fit: contain;
                        }
                        #controls {
                          height: 48px;
                          background: rgba(0, 0, 0, 0.8);
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          gap: 16px;
                          border-top: 1px solid rgba(255, 255, 255, 0.1);
                        }
                        button {
                          padding: 8px 16px;
                          background: rgba(255, 255, 255, 0.1);
                          color: white;
                          border: 1px solid rgba(255, 255, 255, 0.2);
                          border-radius: 4px;
                          cursor: pointer;
                          font-size: 14px;
                        }
                        button:hover {
                          background: rgba(255, 255, 255, 0.2);
                        }
                        .volume-control {
                          display: flex;
                          align-items: center;
                          gap: 8px;
                          color: white;
                        }
                        .volume-slider {
                          width: 80px;
                          height: 4px;
                          background: rgba(255, 255, 255, 0.3);
                          border-radius: 2px;
                          outline: none;
                          cursor: pointer;
                        }
                        .volume-percentage {
                          font-size: 12px;
                          min-width: 30px;
                        }
                      </style>
                    </head>
                    <body>
                      <div id="video-container">
                        <video id="popout-video" autoplay muted playsinline></video>
                      </div>
                      <div id="controls">
                        <div class="volume-control">
                          <span>🎬</span>
                          <input type="range" min="0" max="1" step="0.1" value="${streambotVolume}" class="volume-slider" id="volume-slider">
                          <span class="volume-percentage" id="volume-percentage">${Math.round(streambotVolume * 100)}%</span>
                        </div>
                        <button onclick="document.getElementById('video-container').requestFullscreen()">
                          ⛶ Fullscreen
                        </button>
                      </div>
                      <script>
                        const volumeSlider = document.getElementById('volume-slider');
                        const volumePercentage = document.getElementById('volume-percentage');
                        const video = document.getElementById('popout-video');

                        volumeSlider.addEventListener('input', function() {
                          const volume = parseFloat(this.value);
                          volumePercentage.textContent = Math.round(volume * 100) + '%';

                          // Send volume change to parent window
                          if (window.opener) {
                            window.opener.postMessage({
                              type: 'STREAMBOT_VOLUME_CHANGE',
                              volume: volume
                            }, '*');
                          }
                        });
                      </script>
                    </body>
                    </html>
                  `)
                  popup.document.close()

                  // Set the video stream once the popup loads
                  setTimeout(() => {
                    const popupVideo = popup.document.getElementById('popout-video')
                    if (popupVideo && videoElement.srcObject) {
                      // Store popup video reference
                      popupVideoRef.current = popupVideo
                      
                      // Clone the stream to avoid conflicts
                      popupVideo.srcObject = videoElement.srcObject
                      
                      // Sync current play state
                      if (!videoElement.paused) {
                        popupVideo.play().catch(err => {
                          console.log('Initial popup video play failed:', err)
                        })
                      }
                      
                      // Add mutation observer to sync video state changes
                      const syncVideoState = () => {
                        if (popupVideo && videoElement) {
                          if (videoElement.paused && !popupVideo.paused) {
                            popupVideo.pause()
                          } else if (!videoElement.paused && popupVideo.paused) {
                            popupVideo.play().catch(err => {
                              console.log('Popup video sync play failed:', err)
                            })
                          }
                        }
                      }
                      
                      // Listen for play/pause events on main video
                      videoElement.addEventListener('play', syncVideoState)
                      videoElement.addEventListener('pause', syncVideoState)
                      
                      // Store cleanup function
                      popup._cleanupListeners = () => {
                        videoElement.removeEventListener('play', syncVideoState)
                        videoElement.removeEventListener('pause', syncVideoState)
                      }
                    }
                  }, 100)
                }
              }}
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
              📺 Pop out video
            </button>
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
            <div 
              className={`participant-entry participant-entry--local flex items-center gap-md ${
                hoveredAuthor === localParticipant?.identity ? 'is-hovered' : ''
              }`}
              onMouseEnter={() => setHoveredAuthor(localParticipant?.identity)}
              onMouseLeave={() => setHoveredAuthor(null)}
            >
              <span className="text-ellipsis" style={{ flex: '0 0 75%' }}>
                {getDisplayName(localParticipant) || 'You'} (You)
              </span>
              <div className="volume-control" style={{ flex: '0 0 25%', maxWidth: '400px' }}>
                <span style={{ fontSize: 'var(--font-size-tiny)' }}>🔊</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={getParticipantVolume(localParticipant?.identity || 'local')}
                  onChange={(e) => updateParticipantVolume(localParticipant?.identity || 'local', parseFloat(e.target.value))}
                  className="volume-slider"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            {/* Remote participants */}
            {participants
              .filter(participant => participant.identity !== localParticipant?.identity)
              .map((participant) => {
                const participantColor = getParticipantColor(participant.identity)
                const isHovered = hoveredAuthor === participant.identity
                
                // Create style object for this participant
                const participantStyle = {
                  background: isHovered 
                    ? (participantColor ? `${participantColor}25` : undefined)
                    : (participantColor ? `${participantColor}15` : undefined),
                  borderLeft: participantColor ? `var(--border-accent-width) solid ${participantColor}` : undefined,
                  paddingLeft: participantColor ? 'var(--space-md)' : undefined,
                }
                
                return (
                <div 
                  key={participant.identity}
                  className={`participant-entry participant-entry--remote flex items-center gap-md ${
                    isHovered ? 'is-hovered' : ''
                  }`}
                  style={participantStyle}
                  onMouseEnter={() => setHoveredAuthor(participant.identity)}
                  onMouseLeave={() => setHoveredAuthor(null)}
                >
                  <span className="text-ellipsis" style={{ flex: '0 0 75%' }}>
                    {getDisplayName(participant)}
                  </span>
                  <div className="volume-control" style={{ flex: '0 0 25%', maxWidth: '400px' }}>
                    <span style={{ fontSize: 'var(--font-size-tiny)' }}>🔊</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={getParticipantVolume(participant.identity)}
                      onChange={(e) => updateParticipantVolume(participant.identity, parseFloat(e.target.value))}
                      className="volume-slider"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                )
              })}
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
            ref={chatRef}
            style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}
            messageFormatter={formatChatMessageLinks}
            hoveredAuthor={hoveredAuthor}
            setHoveredAuthor={setHoveredAuthor}
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
            <HoldToTalk disabled={isPushToTalkDisabled()} playbackStatus={playbackStatus} />
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
