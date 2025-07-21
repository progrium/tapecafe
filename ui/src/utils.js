export function parseJwt(token) {
  try {
    if (!token || typeof token !== 'string') {
      console.error('Invalid token provided to parseJwt')
      return null
    }

    const parts = token.split('.')
    if (parts.length !== 3) {
      console.error('Invalid JWT format - should have 3 parts')
      return null
    }

    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    
    // Add padding if needed
    const padded = base64 + '=='.substring(0, (4 - base64.length % 4) % 4)
    
    try {
      const decoded = atob(padded)
      // Use a safer approach that doesn't require decodeURIComponent
      const jsonPayload = decoded
      return JSON.parse(jsonPayload)
    } catch (decodeError) {
      // Fallback to the original method if the simple approach fails
      try {
        const jsonPayload = decodeURIComponent(
          atob(padded)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        )
        return JSON.parse(jsonPayload)
      } catch (fallbackError) {
        console.error('Both JWT decoding methods failed:', fallbackError)
        return null
      }
    }
  } catch (error) {
    console.error('Failed to parse JWT:', error)
    return null
  }
}

export function getRoomFromToken(token) {
  const payload = parseJwt(token)
  return payload?.video?.room || null
}

export function getParticipantFromToken(token) {
  const payload = parseJwt(token)
  console.log('Decoded JWT payload:', payload);
  return {
    identity: payload?.sub || null,
    name: payload?.name || null
  }
}