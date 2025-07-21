import { useState, useEffect } from 'react'
import { Track } from 'livekit-client'
import { useRoomContext, useLocalParticipant } from '@livekit/components-react'
import { useMaybeRoomContext } from '@livekit/components-react'

export function FastTrackToggle({ source, showIcon = true, initialState, onDeviceError, ...props }) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [enabled, setEnabled] = useState(initialState ?? false)
  const [pending, setPending] = useState(false)
  const [track, setTrack] = useState(null)

  // Get the current track state
  useEffect(() => {
    if (!localParticipant) return

    const updateTrackState = () => {
      if (source === Track.Source.Camera) {
        const camPub = localParticipant.getTrackPublication(Track.Source.Camera)
        const isPublished = !!camPub && !camPub.isMuted
        console.log('Camera track state:', { 
          publication: !!camPub, 
          track: !!camPub?.track, 
          isPublished,
          isMuted: camPub?.isMuted 
        })
        setTrack(camPub?.track)
        setEnabled(isPublished)
      } else if (source === Track.Source.Microphone) {
        const micPub = localParticipant.getTrackPublication(Track.Source.Microphone)
        const isPublished = !!micPub && !micPub.isMuted
        console.log('Microphone track state:', { 
          publication: !!micPub, 
          track: !!micPub?.track, 
          isPublished,
          isMuted: micPub?.isMuted 
        })
        setTrack(micPub?.track)
        setEnabled(isPublished)
      }
    }

    updateTrackState()

    // Listen for track changes
    const handleTrackPublished = () => updateTrackState()
    const handleTrackUnpublished = () => updateTrackState()
    const handleTrackMuted = () => updateTrackState()
    const handleTrackUnmuted = () => updateTrackState()

    localParticipant.on('trackPublished', handleTrackPublished)
    localParticipant.on('trackUnpublished', handleTrackUnpublished)
    localParticipant.on('trackMuted', handleTrackMuted)
    localParticipant.on('trackUnmuted', handleTrackUnmuted)

    return () => {
      localParticipant.off('trackPublished', handleTrackPublished)
      localParticipant.off('trackUnpublished', handleTrackUnpublished)
      localParticipant.off('trackMuted', handleTrackMuted)
      localParticipant.off('trackUnmuted', handleTrackUnmuted)
    }
  }, [localParticipant, source])

  const toggle = async () => {
    if (!room || !localParticipant || pending) return

    console.log(`Toggling ${source}, current state:`, { enabled, track: !!track })
    setPending(true)
    try {
      if (source === Track.Source.Camera) {
        const camPub = localParticipant.getTrackPublication(Track.Source.Camera)
        
        if (!camPub || !camPub.track) {
          // Check if we have a pre-acquired track to publish
          const preAcquiredTrack = room._preAcquiredVideoTrack
          
          if (preAcquiredTrack) {
            console.log('Publishing pre-acquired camera track (instant)')
            await localParticipant.publishTrack(preAcquiredTrack)
            setEnabled(true)
          } else {
            console.log('Creating and publishing camera track (slow)')
            await localParticipant.setCameraEnabled(true)
            setEnabled(true)
          }
        } else {
          // Track is already published - unpublish it
          if (enabled) {
            console.log('Unpublishing camera track (instant)')
            await localParticipant.unpublishTrack(camPub.track)
            setEnabled(false)
          } else {
            console.log('Re-publishing camera track (instant)')
            await localParticipant.publishTrack(camPub.track)
            setEnabled(true)
          }
        }
      } else if (source === Track.Source.Microphone) {
        const micPub = localParticipant.getTrackPublication(Track.Source.Microphone)
        
        if (!micPub || !micPub.track) {
          // Check if we have a pre-acquired track to publish
          const preAcquiredTrack = room._preAcquiredAudioTrack
          
          if (preAcquiredTrack) {
            console.log('Publishing pre-acquired microphone track (instant)')
            await localParticipant.publishTrack(preAcquiredTrack)
            setEnabled(true)
          } else {
            console.log('Creating and publishing microphone track (slow)')
            await localParticipant.setMicrophoneEnabled(true)
            setEnabled(true)
          }
        } else {
          // Track is already published - unpublish it
          if (enabled) {
            console.log('Unpublishing microphone track (instant)')
            await localParticipant.unpublishTrack(micPub.track)
            setEnabled(false)
          } else {
            console.log('Re-publishing microphone track (instant)')
            await localParticipant.publishTrack(micPub.track)
            setEnabled(true)
          }
        }
      }
    } catch (error) {
      console.error(`Error toggling ${source}:`, error)
      if (onDeviceError) {
        onDeviceError(error)
      }
    } finally {
      setPending(false)
    }
  }

  const getSourceIcon = () => {
    if (source === Track.Source.Camera) {
      return enabled ? '📹' : '📷'
    } else if (source === Track.Source.Microphone) {
      return enabled ? '🎤' : '🔇'
    }
    return ''
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={enabled}
      data-lk-source={source}
      className={`lk-button lk-track-toggle ${enabled ? 'lk-active' : ''}`}
      {...props}
    >
      {showIcon && (
        <span className="lk-icon" aria-hidden="true">
          {getSourceIcon()}
        </span>
      )}
      {props.children}
    </button>
  )
}