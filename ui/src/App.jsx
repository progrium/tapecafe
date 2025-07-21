import { useState, useEffect } from 'react'
import ConnectForm from './ConnectForm'
import VideoRoom from './VideoRoom'

function App() {
  const [connectionData, setConnectionData] = useState(null)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const liveKitUrl = urlParams.get('liveKitUrl')
    const token = urlParams.get('token')
    
    if (liveKitUrl && token) {
      setConnectionData({ url: liveKitUrl, token })
    }
  }, [])

  const handleConnect = (url, token, displayName) => {
    setConnectionData({ url, token, displayName })
  }

  const handleDisconnect = () => {
    setConnectionData(null)
  }

  return (
    <div>
      {!connectionData ? (
        <ConnectForm onConnect={handleConnect} />
      ) : (
        <VideoRoom 
          url={connectionData.url} 
          token={connectionData.token} 
          displayName={connectionData.displayName}
          onDisconnect={handleDisconnect} 
        />
      )}
    </div>
  )
}

export default App