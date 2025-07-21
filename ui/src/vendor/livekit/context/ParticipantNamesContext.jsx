import { createContext, useContext, useState, useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'

const ParticipantNamesContext = createContext()

export function ParticipantNamesProvider({ children }) {
  const room = useRoomContext()
  const [participantNames, setParticipantNames] = useState(new Map())

  useEffect(() => {
    if (!room) return

    // Listen for dataReceived events to capture participant names
    const handleDataReceived = (payload, participant, kind, topic) => {
      if (participant && participant.identity) {
        setParticipantNames(prev => {
          const newMap = new Map(prev)
          // Store both identity and name if available
          newMap.set(participant.identity, {
            identity: participant.identity,
            name: participant.name || participant.identity,
            metadata: participant.metadata
          })
          return newMap
        })
      }
    }

    // Listen for participant connected events to capture names
    const handleParticipantConnected = (participant) => {
      if (participant && participant.identity) {
        setParticipantNames(prev => {
          const newMap = new Map(prev)
          newMap.set(participant.identity, {
            identity: participant.identity,
            name: participant.name || participant.identity,
            metadata: participant.metadata
          })
          return newMap
        })
      }
    }

    // Listen for participant metadata changes
    const handleParticipantMetadataChanged = (participant) => {
      console.log('Metadata changed for participant:', participant.identity, participant.metadata)
      if (participant && participant.identity) {
        setParticipantNames(prev => {
          const newMap = new Map(prev)
          newMap.set(participant.identity, {
            identity: participant.identity,
            name: participant.name || participant.identity,
            metadata: participant.metadata
          })
          return newMap
        })
      }
    }

    // Initialize with current participants
    if (room.participants) {
      room.participants.forEach(participant => {
        setParticipantNames(prev => {
          const newMap = new Map(prev)
          newMap.set(participant.identity, {
            identity: participant.identity,
            name: participant.name || participant.identity,
            metadata: participant.metadata
          })
          return newMap
        })
      })
    }

    // Add local participant too
    if (room.localParticipant) {
      setParticipantNames(prev => {
        const newMap = new Map(prev)
        newMap.set(room.localParticipant.identity, {
          identity: room.localParticipant.identity,
          name: room.localParticipant.name || room.localParticipant.identity,
          metadata: room.localParticipant.metadata
        })
        return newMap
      })
    }

    room.on('dataReceived', handleDataReceived)
    room.on('participantConnected', handleParticipantConnected)
    room.on('participantMetadataChanged', handleParticipantMetadataChanged)
    
    // Also listen for local participant metadata changes
    const handleLocalMetadataChanged = (metadata) => {
      handleParticipantMetadataChanged(room.localParticipant)
    }
    
    if (room.localParticipant) {
      room.localParticipant.on('metadataChanged', handleLocalMetadataChanged)
    }

    return () => {
      room.off('dataReceived', handleDataReceived)
      room.off('participantConnected', handleParticipantConnected)
      room.off('participantMetadataChanged', handleParticipantMetadataChanged)
      
      // Clean up local participant listener
      if (room.localParticipant) {
        room.localParticipant.off('metadataChanged', handleLocalMetadataChanged)
      }
    }
  }, [room])

  const getParticipantDisplayName = (identity) => {
    const participant = participantNames.get(identity)
    if (!participant) return identity

    // Try to extract display name from metadata first
    try {
      if (participant.metadata) {
        const metadata = JSON.parse(participant.metadata)
        if (metadata.displayName) {
          return metadata.displayName
        }
      }
    } catch (error) {
      console.log('Error parsing metadata in context:', error)
    }

    return participant.name || identity
  }

  return (
    <ParticipantNamesContext.Provider value={{ participantNames, getParticipantDisplayName }}>
      {children}
    </ParticipantNamesContext.Provider>
  )
}

export function useParticipantNames() {
  const context = useContext(ParticipantNamesContext)
  if (!context) {
    throw new Error('useParticipantNames must be used within a ParticipantNamesProvider')
  }
  return context
}
