import { ParticipantTile, VideoTrack } from '@livekit/components-react'
import { forwardRef } from 'react'

// ParticipantTile for stream video without any name display
export const StreamParticipantTile = forwardRef((props, ref) => {
  return (
    <ParticipantTile ref={ref} {...props}>
      <VideoTrack style={{ objectFit: 'contain' }} />
    </ParticipantTile>
  )
})