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
      background: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      textAlign: 'center',
      marginBottom: '4px'
    }}>
      {displayName}
    </div>
  )
}

// Custom ParticipantTile that uses our display name
export const CustomParticipantTile = forwardRef((props, ref) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <CustomParticipantName />
      <ParticipantTile ref={ref} {...props}>
        <VideoTrack />
      </ParticipantTile>
    </div>
  )
})