import { useRef, useEffect, useMemo, useImperativeHandle, forwardRef, useState } from 'react'
import { useChat } from '../hooks/useChat'
import { ChatEntry } from './ChatEntry'
import { formatChatMessageLinks } from './ChatEntry'
import { ParticipantNamesProvider } from '../context/ParticipantNamesContext'

export const Chat = forwardRef(function Chat({
  messageFormatter,
  messageDecoder,
  messageEncoder,
  channelTopic,
  children,
  ...props
}, ref) {
  const ulRef = useRef(null)
  const inputRef = useRef(null)
  const [wasAtBottom, setWasAtBottom] = useState(true)
  const [justSentMessage, setJustSentMessage] = useState(false)

  const chatOptions = useMemo(() => {
    return { messageDecoder, messageEncoder, channelTopic }
  }, [messageDecoder, messageEncoder, channelTopic])

  const { chatMessages, send, isSending } = useChat(chatOptions)

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
      await send(inputRef.current.value)
      inputRef.current.value = ''
      inputRef.current.focus()
    }
  }

  // Track scroll position before messages change
  useEffect(() => {
    if (ulRef.current) {
      const element = ulRef.current
      const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 10
      setWasAtBottom(isAtBottom)
    }
  }, [chatMessages.length - 1]) // Run before the latest message is processed

  // Handle scrolling after messages change
  useEffect(() => {
    if (ulRef.current) {
      const element = ulRef.current
      
      // Scroll to bottom if:
      // 1. User was at bottom before new message
      // 2. User just sent a message 
      // 3. This is the first message
      if (wasAtBottom || justSentMessage || chatMessages.length === 1) {
        element.scrollTo({ top: element.scrollHeight })
      }
      
      // Reset the justSentMessage flag
      if (justSentMessage) {
        setJustSentMessage(false)
      }
    }
  }, [chatMessages, wasAtBottom, justSentMessage])

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

        <ul className="lk-list lk-chat-messages" ref={ulRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {children
            ? chatMessages.map((msg, idx) =>
                children({ entry: msg, key: msg.id ?? idx, messageFormatter })
              )
            : chatMessages.map((msg, idx, allMsg) => {
                const hideName = idx >= 1 && allMsg[idx - 1].from === msg.from
                const hideTimestamp = idx >= 1 && msg.timestamp - allMsg[idx - 1].timestamp < 60_000

                return (
                  <ChatEntry
                    key={msg.id ?? idx}
                    hideName={hideName}
                    hideTimestamp={hideName === false ? false : hideTimestamp}
                    entry={msg}
                    messageFormatter={messageFormatter}
                  />
                )
              })}
        </ul>
        <form className="lk-chat-form" onSubmit={handleSubmit} style={{ flexShrink: 0 }}>
          <input
            className="lk-form-control lk-chat-form-input"
            disabled={isSending}
            ref={inputRef}
            type="text"
            placeholder="Enter a message..."
            onInput={(ev) => ev.stopPropagation()}
            onKeyDown={(ev) => ev.stopPropagation()}
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