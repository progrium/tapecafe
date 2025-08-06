import { useState, useRef, useEffect } from 'react'
import { useRoomContext, useLocalParticipant } from '@livekit/components-react'

export function HoldToTalk({ onDeviceError, disabled = false, playbackStatus, ...props }) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [isMicOn, setIsMicOn] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)

  const toggleMic = async () => {
    if (!room || !localParticipant || isPublishing || disabled) return

    console.log('🎙️ Toggling microphone:', isMicOn ? 'OFF' : 'ON')
    setIsPublishing(true)

    try {
      if (!isMicOn) {
        // Turn mic ON - create and publish audio and video with selected devices
        const { createLocalVideoTrack, createLocalAudioTrack } = await import('livekit-client')
        
        // Get selected devices from localStorage
        const selectedCamera = localStorage.getItem('selectedCamera')
        const selectedMicrophone = localStorage.getItem('selectedMicrophone')
        
        console.log('📷 Using camera:', selectedCamera || 'default')
        console.log('🎤 Using microphone:', selectedMicrophone || 'default')

        // Create video track with selected camera
        const videoOptions = selectedCamera ? { deviceId: { exact: selectedCamera } } : {}
        const videoTrack = await createLocalVideoTrack(videoOptions)
        await localParticipant.publishTrack(videoTrack)

        // Create audio track with selected microphone  
        const audioOptions = selectedMicrophone ? { deviceId: { exact: selectedMicrophone } } : {}
        const audioTrack = await createLocalAudioTrack(audioOptions)
        await localParticipant.publishTrack(audioTrack)

        setIsMicOn(true)
        console.log('✅ Microphone ON - audio and video published')
      } else {
        // Turn mic OFF - unpublish audio and video
        const videoPublication = localParticipant.getTrackPublication('camera')
        const audioPublication = localParticipant.getTrackPublication('microphone')

        if (videoPublication) {
          console.log('📷 Unpublishing video track')
          await localParticipant.unpublishTrack(videoPublication.track)
        }

        if (audioPublication) {
          console.log('🎤 Unpublishing audio track')
          await localParticipant.unpublishTrack(audioPublication.track)
        }

        setIsMicOn(false)
        console.log('✅ Microphone OFF - audio and video unpublished')
      }
    } catch (error) {
      console.error('Error toggling microphone:', error)
      if (onDeviceError) {
        onDeviceError(error)
      }
    } finally {
      setIsPublishing(false)
    }
  }

  // Handle click to toggle microphone
  const handleClick = (e) => {
    e.preventDefault()
    if (!disabled) {
      toggleMic()
    }
  }

  // Auto-turn off mic when video playback starts
  useEffect(() => {
    if (isMicOn && disabled) {
      console.log('🎙️ Auto-turning off microphone due to video playback starting')
      // Don't call toggleMic() to avoid the async logic, just turn off directly
      const turnOffMicSync = async () => {
        if (room && localParticipant && !isPublishing) {
          setIsPublishing(true)
          try {
            const videoPublication = localParticipant.getTrackPublication('camera')
            const audioPublication = localParticipant.getTrackPublication('microphone')

            if (videoPublication) {
              console.log('📷 Auto-unpublishing video track')
              await localParticipant.unpublishTrack(videoPublication.track)
            }

            if (audioPublication) {
              console.log('🎤 Auto-unpublishing audio track')
              await localParticipant.unpublishTrack(audioPublication.track)
            }

            setIsMicOn(false)
            console.log('✅ Microphone auto-turned OFF due to video playback')
          } catch (error) {
            console.error('Error auto-turning off microphone:', error)
          } finally {
            setIsPublishing(false)
          }
        }
      }
      
      turnOffMicSync()
    }
  }, [disabled, isMicOn, room, localParticipant, isPublishing])

  // Function to refresh tracks if mic is currently on
  const refreshTracksIfNeeded = async () => {
    if (!isMicOn || isPublishing) return
    
    console.log('🔄 Refreshing tracks with new device selection')
    // Simply toggle off and on to use new devices
    await toggleMic() // Turn off
    // Small delay to ensure cleanup
    setTimeout(() => toggleMic(), 100) // Turn back on with new devices
  }

  // Expose refresh function so Settings can call it
  useEffect(() => {
    // Store refresh function globally so Settings component can call it
    window._refreshVideoTracks = refreshTracksIfNeeded
    
    return () => {
      delete window._refreshVideoTracks
    }
  }, [isMicOn, isPublishing])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isMicOn) {
        // Turn off mic when component unmounts
        if (room && localParticipant) {
          const videoPublication = localParticipant.getTrackPublication('camera')
          const audioPublication = localParticipant.getTrackPublication('microphone')
          
          if (videoPublication) {
            localParticipant.unpublishTrack(videoPublication.track)
          }
          if (audioPublication) {
            localParticipant.unpublishTrack(audioPublication.track)
          }
        }
      }
    }
  }, [isMicOn, room, localParticipant])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.625rem 1rem',
        userSelect: 'none',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.2s ease'
      }}
      {...props}
    >
      <span
        style={{
          color: disabled ? '#666' : 'var(--lk-control-fg)',
          fontSize: '0.875rem',
          fontWeight: '500'
        }}
      >
        Video chat
      </span>
      
      {/* iOS-style switch */}
      <div
        onClick={handleClick}
        style={{
          position: 'relative',
          width: '44px',
          height: '24px',
          backgroundColor: disabled ? 'rgba(255, 255, 255, 0.1)' : (isMicOn ? '#34c759' : 'rgba(255, 255, 255, 0.3)'),
          borderRadius: '12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s ease',
          border: disabled ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
        }}
      >
        {/* Switch handle */}
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: isMicOn ? '22px' : '2px',
            width: '20px',
            height: '20px',
            backgroundColor: disabled ? '#999' : 'white',
            borderRadius: '50%',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
          }}
        />
      </div>
      
      {isPublishing && (
        <span
          style={{
            color: 'var(--lk-control-fg)',
            fontSize: '0.75rem',
            opacity: 0.7
          }}
        >
          ⏳
        </span>
      )}
    </div>
  )
}