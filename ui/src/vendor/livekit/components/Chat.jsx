import { useRef, useEffect, useMemo, useImperativeHandle, forwardRef, useState, useCallback } from 'react'
import { useChat } from '../hooks/useChat'
import { ChatEntry } from './ChatEntry'
import { formatChatMessageLinks } from './ChatEntry'
import { ParticipantNamesProvider } from '../context/ParticipantNamesContext'
import { getParticipantColor } from '../../../utils/participantColors'
import { useLocalParticipant } from '@livekit/components-react'

export const Chat = forwardRef(function Chat({
  messageFormatter,
  messageDecoder,
  messageEncoder,
  channelTopic,
  children,
  hoveredAuthor,
  setHoveredAuthor,
  ...props
}, ref) {
  const ulRef = useRef(null)
  const inputRef = useRef(null)
  const [wasAtBottom, setWasAtBottom] = useState(true)
  const [justSentMessage, setJustSentMessage] = useState(false)
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false)
  const [localHoveredAuthor, setLocalHoveredAuthor] = useState(null)
  const [lastMessageCount, setLastMessageCount] = useState(0)
  const { localParticipant } = useLocalParticipant()

  // Use provided hover state or local fallback
  const currentHoveredAuthor = hoveredAuthor !== undefined ? hoveredAuthor : localHoveredAuthor
  const setCurrentHoveredAuthor = setHoveredAuthor || setLocalHoveredAuthor

  const chatOptions = useMemo(() => {
    return { messageDecoder, messageEncoder, channelTopic }
  }, [messageDecoder, messageEncoder, channelTopic])

  const { chatMessages, send, isSending } = useChat(chatOptions)

  // Play notification sound for new messages when app is not focused
  useEffect(() => {
    if (chatMessages.length > lastMessageCount && lastMessageCount > 0) {
      // Only play sound if window is not focused and it's not our own message
      const latestMessage = chatMessages[chatMessages.length - 1]
      const isOwnMessage = latestMessage.from?.identity === localParticipant?.identity

      if (!document.hasFocus() && !isOwnMessage) {
        // Check if notification sounds are enabled
        const notificationSoundsEnabled = localStorage.getItem('notificationSounds') !== 'false'
        
        if (notificationSoundsEnabled) {
          try {
            const audio = new Audio('/assets/tapemsg.wav')
            audio.volume = 0.3 // Keep it subtle
            audio.play().catch(err => {
              console.log('Could not play notification sound:', err)
            })
          } catch (error) {
            console.log('Error creating notification audio:', error)
          }
        }
      }
    }

    setLastMessageCount(chatMessages.length)
  }, [chatMessages, lastMessageCount, localParticipant])

  // Wrap send function to track when user sends messages
  const wrappedSend = async (message) => {
    setJustSentMessage(true)
    return await send(message)
  }

  // Expose the wrapped send function via ref
  useImperativeHandle(ref, () => ({
    send: wrappedSend
  }), [send])

  async function handleSubmit(event) {
    event.preventDefault()
    if (inputRef.current && inputRef.current.value.trim() !== '') {
      setJustSentMessage(true)
      await send(inputRef.current.value.trim())
      inputRef.current.value = ''
      inputRef.current.focus()
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      // Enter without shift submits the form
      event.preventDefault()
      handleSubmit(event)
    }
    // Shift+Enter allows newlines (default textarea behavior)
  }

  // Check if user is at bottom of chat
  const checkIfAtBottom = useCallback(() => {
    if (ulRef.current) {
      const element = ulRef.current
      return element.scrollTop + element.clientHeight >= element.scrollHeight - 10
    }
    return true
  }, [])

  // Handle scrolling when messages change
  useEffect(() => {
    if (ulRef.current) {
      const element = ulRef.current
      const wasAtBottomBefore = wasAtBottom
      const isAtBottomNow = checkIfAtBottom()

      // Update wasAtBottom state for next time
      setWasAtBottom(isAtBottomNow)

      // Scroll to bottom if:
      // 1. User was at bottom before new message
      // 2. User just sent a message
      // 3. This is the first message
      if (wasAtBottomBefore || justSentMessage || chatMessages.length === 1) {
        element.scrollTo({ top: element.scrollHeight })
        setShowNewMessageIndicator(false)
      } else {
        // Show new message indicator if user is scrolled up and new message arrived
        setShowNewMessageIndicator(true)
      }

      // Reset the justSentMessage flag
      if (justSentMessage) {
        setJustSentMessage(false)
      }
    }
  }, [chatMessages, wasAtBottom, justSentMessage, checkIfAtBottom])

  // Handle manual scrolling to update indicator
  const handleScroll = useCallback(() => {
    const isAtBottom = checkIfAtBottom()
    setWasAtBottom(isAtBottom)

    // Hide indicator when user scrolls to bottom
    if (isAtBottom) {
      setShowNewMessageIndicator(false)
    }
  }, [checkIfAtBottom])

  // Handle clicking the new message indicator
  const handleNewMessageClick = useCallback(() => {
    if (ulRef.current) {
      ulRef.current.scrollTo({ top: ulRef.current.scrollHeight, behavior: 'smooth' })
      setShowNewMessageIndicator(false)
    }
  }, [])

  return (
    <ParticipantNamesProvider>
      <div {...props} className="lk-chat" style={{ ...props.style, alignItems: 'stretch' }}>
        <div className="lk-chat-header" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          width: '100%'
        }}>
          Messages
        </div>

        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <ul className="lk-list lk-chat-messages" ref={ulRef} style={{ height: '100%', overflowY: 'auto', minHeight: 0 }} onScroll={handleScroll}>
          {children
            ? chatMessages.map((msg, idx) =>
                children({ entry: msg, key: msg.id ?? idx, messageFormatter })
              )
            : chatMessages.map((msg, idx, allMsg) => {
                // System messages should never hide name/timestamp
                const isSystemMessage = msg.isSystemMessage || msg.from?.identity === 'system'
                const hideName = !isSystemMessage && idx >= 1 && allMsg[idx - 1].from?.identity === msg.from?.identity
                const hideTimestamp = !isSystemMessage && idx >= 1 && msg.timestamp - allMsg[idx - 1].timestamp < 60_000

                const participantColor = getParticipantColor(msg.from?.identity)
                const isOwnMessage = msg.from?.identity === localParticipant?.identity

                return (
                  <ChatEntry
                    key={msg.id ?? idx}
                    hideName={hideName}
                    hideTimestamp={hideName === false ? false : hideTimestamp}
                    entry={msg}
                    messageFormatter={messageFormatter}
                    onMouseEnter={() => setCurrentHoveredAuthor(msg.from?.identity)}
                    onMouseLeave={() => setCurrentHoveredAuthor(null)}
                    isAuthorHovered={currentHoveredAuthor === msg.from?.identity}
                    participantColor={isOwnMessage ? 'white' : participantColor}
                  />
                )
              })}
          </ul>

          {/* New message indicator */}
          {showNewMessageIndicator && (
            <div
              onClick={handleNewMessageClick}
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'var(--lk-accent-color, #0066cc)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '16px',
                cursor: 'pointer',
                fontSize: '12px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                zIndex: 10,
                userSelect: 'none'
              }}
            >
              new messages ↓
            </div>
          )}
        </div>
        <form className="lk-chat-form" onSubmit={handleSubmit} style={{ flexShrink: 0 }}>
          <textarea
            className="lk-form-control lk-chat-form-input"
            disabled={isSending}
            ref={inputRef}
            placeholder="Enter a message..."
            style={{
              resize: 'none',
              overflowY: 'auto'
            }}
            onInput={(ev) => ev.stopPropagation()}
            onKeyDown={(ev) => {
              ev.stopPropagation()
              handleKeyDown(ev)
            }}
            onKeyUp={(ev) => ev.stopPropagation()}
          />
          <button type="submit" className="lk-button lk-chat-form-button" disabled={isSending}>
            Send
          </button>
        </form>
      </div>
    </ParticipantNamesProvider>
  )
})

export { formatChatMessageLinks }
