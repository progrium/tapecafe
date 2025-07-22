import { ParticipantTile, VideoTrack } from '@livekit/components-react'
import { useMaybeTrackRefContext } from '@livekit/components-react'
import { forwardRef } from 'react'

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

// Custom ParticipantName that shows display name
function CustomParticipantName() {
  const trackRef = useMaybeTrackRefContext()
  const displayName = getDisplayName(trackRef?.participant)

  return (
    <div style={{
      position: 'absolute',
      bottom: '100%', // Anchor to bottom edge of text, grows upward
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0, 0, 0, 0.7)', // Back to proper styling
      color: 'white',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      textAlign: 'center',
      width: '100px',
      minWidth: '100px',
      whiteSpace: 'normal',
      boxSizing: 'border-box',
      zIndex: 100,
      marginBottom: '2px' // Small gap between name and video
    }}>
      {displayName}
    </div>
  )
}

// Custom ParticipantTile that uses our display name - Fixed height with floating name
export const CustomParticipantTile = forwardRef((props, ref) => {
  return (
    <div style={{
      position: 'relative',
      height: '100px', // Fixed height for consistent video size
      width: '100px',  // Fixed width for square aspect
      margin: '0 auto' // Center in carousel
    }}>
      <CustomParticipantName />
      <ParticipantTile ref={ref} {...props} style={{ width: '100%', height: '100%' }}>
        <VideoTrack style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover' // Crop to fill the square
        }} />
      </ParticipantTile>
    </div>
  )
})
