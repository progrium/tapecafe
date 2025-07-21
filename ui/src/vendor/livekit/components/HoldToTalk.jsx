import { useState, useRef, useEffect } from 'react'
import { useRoomContext, useLocalParticipant } from '@livekit/components-react'

export function HoldToTalk({ onDeviceError, ...props }) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [isHolding, setIsHolding] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const isHoldingRef = useRef(false)

  const startTalking = async () => {
    if (!room || !localParticipant || isPublishing) return

    console.log('🎙️ Starting to talk - publishing audio and video')
    setIsHolding(true)
    setIsPublishing(true)
    isHoldingRef.current = true

    try {
      // Check for pre-acquired tracks first
      const preAcquiredVideoTrack = room._preAcquiredVideoTrack
      const preAcquiredAudioTrack = room._preAcquiredAudioTrack

      if (preAcquiredVideoTrack) {
        console.log('📷 Publishing pre-acquired video track')
        await localParticipant.publishTrack(preAcquiredVideoTrack)
      } else {
        console.log('📷 Creating and publishing video track')
        await localParticipant.setCameraEnabled(true)
      }

      if (preAcquiredAudioTrack) {
        console.log('🎤 Publishing pre-acquired audio track')
        await localParticipant.publishTrack(preAcquiredAudioTrack)
      } else {
        console.log('🎤 Creating and publishing audio track')
        await localParticipant.setMicrophoneEnabled(true)
      }

      console.log('✅ Audio and video published')
    } catch (error) {
      console.error('Error starting to talk:', error)
      if (onDeviceError) {
        onDeviceError(error)
      }
    } finally {
      setIsPublishing(false)
    }
  }

  const stopTalking = async () => {
    if (!room || !localParticipant || !isHoldingRef.current) return

    console.log('🔇 Stopping talking - unpublishing audio and video')
    setIsHolding(false)
    isHoldingRef.current = false

    try {
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

      console.log('✅ Audio and video unpublished')
    } catch (error) {
      console.error('Error stopping talking:', error)
      if (onDeviceError) {
        onDeviceError(error)
      }
    }
  }

  // Handle mouse events
  const handleMouseDown = (e) => {
    e.preventDefault()
    startTalking()
  }

  const handleMouseUp = (e) => {
    e.preventDefault()
    stopTalking()
  }

  // Handle touch events for mobile
  const handleTouchStart = (e) => {
    e.preventDefault()
    startTalking()
  }

  const handleTouchEnd = (e) => {
    e.preventDefault()
    stopTalking()
  }

  // Handle mouse leave to ensure we stop if cursor leaves button while holding
  const handleMouseLeave = (e) => {
    if (isHoldingRef.current) {
      stopTalking()
    }
    // Reset to default background (slightly brighter than push-to-talk section)
    if (!isHolding) {
      e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'
    }
  }

  // Handle mouse enter for hover effect
  const handleMouseEnter = (e) => {
    if (!isHolding) {
      e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.20)'
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isHoldingRef.current) {
        stopTalking()
      }
    }
  }, [])

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      disabled={isPublishing}
      style={{
        padding: '0.625rem 1rem',
        backgroundColor: isHolding ? '#ff4444' : 'rgba(255, 255, 255, 0.12)',
        color: isHolding ? 'white' : 'var(--lk-control-fg)',
        border: 'none',
        borderRadius: 'var(--lk-border-radius)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        transition: 'background-color 0.1s ease',
        userSelect: 'none',
        touchAction: 'none'
      }}
      {...props}
    >
      {isHolding ? '🔴 Release to stop' : '🎙️ Hold to talk'}
    </button>
  )
}