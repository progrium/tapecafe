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
  const participantNames = useRef(new Map()) // Track previous names

  useEffect(() => {
    if (!room) return

    const handleLocalParticipantConnected = () => {
      if (room.localParticipant) {
        const participantName = getDisplayName(room.localParticipant)
        // Store initial name for tracking changes
        participantNames.current.set(room.localParticipant.identity, participantName)
        
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
      // Store initial name for tracking changes
      participantNames.current.set(participant.identity, participantName)
      
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
      // Clean up tracked name
      participantNames.current.delete(participant.identity)
      
      const systemMessage = {
        id: `system-${messageIdCounter.current++}`,
        timestamp: Date.now(),
        message: `${participantName} left the room`,
        from: { identity: 'system', name: 'System', isLocal: false },
        isSystemMessage: true
      }
      setSystemMessages(prev => [...prev, systemMessage])
    }

    const handleParticipantMetadataChanged = (metadata, participant) => {
      // Handle different event parameter orders
      const actualParticipant = participant || metadata
      const actualMetadata = typeof metadata === 'string' ? metadata : actualParticipant?.metadata
      
      console.log('🔄 useChat: Metadata change event:', { metadata: actualMetadata, participant: actualParticipant?.identity })
      
      if (!actualParticipant?.identity) {
        console.warn('⚠️ useChat: No participant or identity in metadata change event')
        return
      }
      
      const newName = getDisplayName(actualParticipant)
      const oldName = participantNames.current.get(actualParticipant.identity)
      console.log('📝 useChat: Name change detected:', { oldName, newName, identity: actualParticipant.identity })
      
      // Only create message if name actually changed
      if (oldName && oldName !== newName) {
        console.log('✅ useChat: Creating name change system message')
        const systemMessage = {
          id: `system-${messageIdCounter.current++}`,
          timestamp: Date.now(),
          message: `<b>${oldName}</b> changed their name to <b>${newName}</b>`,
          from: { identity: 'system', name: 'System', isLocal: false },
          isSystemMessage: true
        }
        setSystemMessages(prev => [...prev, systemMessage])
        
        // Update tracked name
        participantNames.current.set(actualParticipant.identity, newName)
      } else if (!oldName) {
        // First time we're seeing this participant's name, store it
        console.log('📝 useChat: Storing initial name for tracking:', newName)
        participantNames.current.set(actualParticipant.identity, newName)
      } else {
        console.log('ℹ️ useChat: No name change detected (same name)')
      }
    }

    // Listen for when the room connection is established and local participant is ready
    room.on(RoomEvent.Connected, handleLocalParticipantConnected)
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected)
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    room.on(RoomEvent.ParticipantMetadataChanged, handleParticipantMetadataChanged)

    return () => {
      room.off(RoomEvent.Connected, handleLocalParticipantConnected)
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected)
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
      room.off(RoomEvent.ParticipantMetadataChanged, handleParticipantMetadataChanged)
    }
  }, [room])

  // Merge original messages with system messages and sort by timestamp
  const chatMessages = [...originalMessages, ...systemMessages].sort((a, b) => a.timestamp - b.timestamp)

  return { chatMessages, send, isSending }
}