import { useMemo, forwardRef } from 'react'
import { tokenize, createDefaultGrammar } from '@livekit/components-core'
import { useParticipantNames } from '../context/ParticipantNamesContext'

export const ChatEntry = forwardRef(function ChatEntry(
  { entry, hideName = false, hideTimestamp = false, messageFormatter, onMouseEnter, onMouseLeave, isAuthorHovered = false, ...props },
  ref
) {
  const { getParticipantDisplayName } = useParticipantNames()

  const hasBeenEdited = !!entry.editTimestamp
  const time = new Date(entry.timestamp)
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'

  // Check if this is a system message
  const isSystemMessage = entry.isSystemMessage || entry.from?.identity === 'system'

  const formattedMessage = useMemo(() => {
    return messageFormatter ? messageFormatter(entry.message, isSystemMessage) : entry.message
  }, [entry.message, messageFormatter, isSystemMessage])

  // Get participant display name from our context
  const participantDisplayName = entry.from?.identity
    ? getParticipantDisplayName(entry.from.identity)
    : (entry.from?.name ?? entry.from?.identity)

  // Debug logging for chat names
  console.log('💬 ChatEntry render:', {
    identity: entry.from?.identity,
    participantDisplayName,
    originalName: entry.from?.name,
    message: entry.message?.substring(0, 50)
  })
  const name = entry.from?.name ?? entry.from?.identity

  // System messages have a simpler structure
  if (isSystemMessage) {
    return (
      <li
        ref={ref}
        className="lk-chat-entry lk-chat-system-message"
        style={{ fontStyle: 'italic', color: '#888', textAlign: 'center', margin: '4px 0' }}
        {...props}
      >
        <span className="lk-message-body" style={{ whiteSpace: 'pre-wrap' }}>{formattedMessage}</span>
      </li>
    )
  }

  return (
    <li
      ref={ref}
      className={`lk-chat-entry ${isAuthorHovered ? 'same-author-hover' : ''}`}
      title={time.toLocaleTimeString(locale, { timeStyle: 'full' })}
      data-lk-message-origin={entry.from?.isLocal ? 'local' : 'remote'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...props}
    >
      {(!hideTimestamp || !hideName || hasBeenEdited) && (
        <span className="lk-meta-data">
          {!hideName && <strong className="lk-participant-name">{participantDisplayName}</strong>}

          {(!hideTimestamp || hasBeenEdited) && (
            <span className="lk-timestamp">
              {hasBeenEdited && 'edited '}
              {time.toLocaleTimeString(locale, { timeStyle: 'short' })}
            </span>
          )}
        </span>
      )}

      <span className="lk-message-body" style={{ whiteSpace: 'pre-wrap' }}>{formattedMessage}</span>
      <span className="lk-message-attachements">
        {entry.attachedFiles?.map(
          (file) =>
            file.type.startsWith('image/') && (
              <img
                style={{ maxWidth: '300px', maxHeight: '300px' }}
                key={file.name}
                src={URL.createObjectURL(file)}
                alt={file.name}
              />
            )
        )}
      </span>
    </li>
  )
})

export function formatChatMessageLinks(message, isSystemMessage = false) {
  // For system messages, allow HTML rendering (since we control the content)
  if (isSystemMessage && (message.includes('<b>') || message.includes('<i>'))) {
    return (
      <span dangerouslySetInnerHTML={{ __html: message }} />
    )
  }

  // For regular messages, tokenize links but escape HTML
  return tokenize(message, createDefaultGrammar()).map((tok, i) => {
    if (typeof tok === 'string') {
      return tok
    } else {
      const content = tok.content.toString()
      const href =
        tok.type === 'url'
          ? /^http(s?):\/\//.test(content)
            ? content
            : `https://${content}`
          : `mailto:${content}`
      return (
        <a className="lk-chat-link" key={i} href={href} target="_blank" rel="noreferrer">
          {content}
        </a>
      )
    }
  })
}
