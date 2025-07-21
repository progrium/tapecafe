import { useChat as useOriginalChat } from '@livekit/components-react'
import { useRoomContext } from '@livekit/components-react'
import { useEffect, useRef, useState } from 'react'
import { RoomEvent } from 'livekit-client'

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
    // Ignore JSON parse errors, fall back to identity/name
  }
  
  return participant.name || participant.identity || 'Unknown'
}

export function useChat(options) {
  const room = useRoomContext()
  const { chatMessages: originalMessages, send, isSending } = useOriginalChat(options)
  const [systemMessages, setSystemMessages] = useState([])
  const messageIdCounter = useRef(0)

  useEffect(() => {
    if (!room) return

    const handleLocalParticipantConnected = () => {
      if (room.localParticipant) {
        const participantName = getDisplayName(room.localParticipant)
        const localJoinMessage = {
          id: `system-${messageIdCounter.current++}`,
          timestamp: Date.now(),
          message: `${participantName} entered the room`,
          from: { identity: 'system', name: 'System', isLocal: false },
          isSystemMessage: true
        }
        setSystemMessages(prev => [...prev, localJoinMessage])
      }
    }

    const handleParticipantConnected = (participant) => {
      const participantName = getDisplayName(participant)
      const systemMessage = {
        id: `system-${messageIdCounter.current++}`,
        timestamp: Date.now(),
        message: `${participantName} entered the room`,
        from: { identity: 'system', name: 'System', isLocal: false },
        isSystemMessage: true
      }
      setSystemMessages(prev => [...prev, systemMessage])
    }

    const handleParticipantDisconnected = (participant) => {
      const participantName = getDisplayName(participant)
      const systemMessage = {
        id: `system-${messageIdCounter.current++}`,
        timestamp: Date.now(),
        message: `${participantName} left the room`,
        from: { identity: 'system', name: 'System', isLocal: false },
        isSystemMessage: true
      }
      setSystemMessages(prev => [...prev, systemMessage])
    }

    // Listen for when the room connection is established and local participant is ready
    room.on(RoomEvent.Connected, handleLocalParticipantConnected)
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected)
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)

    return () => {
      room.off(RoomEvent.Connected, handleLocalParticipantConnected)
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected)
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    }
  }, [room])

  // Merge original messages with system messages and sort by timestamp
  const chatMessages = [...originalMessages, ...systemMessages].sort((a, b) => a.timestamp - b.timestamp)

  return { chatMessages, send, isSending }
}