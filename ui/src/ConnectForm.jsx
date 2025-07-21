import { useState, useRef, useEffect } from 'react'

function ConnectForm({ onConnect }) {
  const [url, setUrl] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('liveKitUrl') || ''
  })
  const [token, setToken] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('token') || ''
  })
  const [displayName, setDisplayName] = useState(() => 
    localStorage.getItem('displayName') || ''
  )
  const [devices, setDevices] = useState({ cameras: [], microphones: [] })
  const [selectedCamera, setSelectedCamera] = useState(() => 
    localStorage.getItem('selectedCamera') || ''
  )
  const [selectedMicrophone, setSelectedMicrophone] = useState(() => 
    localStorage.getItem('selectedMicrophone') || ''
  )
  const [stream, setStream] = useState(null)
  // Audio and video are always enabled (hardcoded to ON)
  const audioEnabled = true
  const videoEnabled = true
  const videoRef = useRef(null)

  // Save device selections to localStorage
  const handleCameraChange = (deviceId) => {
    setSelectedCamera(deviceId)
    localStorage.setItem('selectedCamera', deviceId)
  }

  const handleMicrophoneChange = (deviceId) => {
    setSelectedMicrophone(deviceId)
    localStorage.setItem('selectedMicrophone', deviceId)
  }

  // Get available devices
  useEffect(() => {
    async function getDevices() {
      try {
        // First request permissions to get device labels
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        
        const deviceList = await navigator.mediaDevices.enumerateDevices()
        
        const cameras = deviceList.filter(device => device.kind === 'videoinput')
        const microphones = deviceList.filter(device => device.kind === 'audioinput')
        
        console.log('Found', cameras.length, 'cameras and', microphones.length, 'microphones')
        
        setDevices({ cameras, microphones })
        
        // Validate saved camera selection or set default
        const savedCamera = localStorage.getItem('selectedCamera')
        const cameraExists = cameras.find(cam => cam.deviceId === savedCamera)
        if (cameras.length > 0) {
          if (cameraExists) {
            setSelectedCamera(savedCamera)
          } else if (!selectedCamera) {
            handleCameraChange(cameras[0].deviceId)
          }
        }
        
        // Validate saved microphone selection or set default
        const savedMicrophone = localStorage.getItem('selectedMicrophone')
        const microphoneExists = microphones.find(mic => mic.deviceId === savedMicrophone)
        if (microphones.length > 0) {
          if (microphoneExists) {
            setSelectedMicrophone(savedMicrophone)
          } else if (!selectedMicrophone) {
            handleMicrophoneChange(microphones[0].deviceId)
          }
        }
      } catch (error) {
        console.error('Error getting devices:', error)
        alert('Error accessing camera/microphone. Please allow permissions and refresh.')
      }
    }
    
    getDevices()
  }, [])

  // Start preview stream
  useEffect(() => {
    async function startPreview() {
      try {
        if (stream) {
          stream.getTracks().forEach(track => track.stop())
        }

        if (!videoEnabled && !audioEnabled) {
          setStream(null)
          if (videoRef.current) {
            videoRef.current.srcObject = null
          }
          return
        }

        const constraints = {
          video: videoEnabled ? { deviceId: selectedCamera ? { exact: selectedCamera } : undefined } : false,
          audio: audioEnabled ? { deviceId: selectedMicrophone ? { exact: selectedMicrophone } : undefined } : false
        }

        const newStream = await navigator.mediaDevices.getUserMedia(constraints)
        setStream(newStream)

        if (videoRef.current && videoEnabled) {
          videoRef.current.srcObject = newStream
        }
      } catch (error) {
        console.error('Error accessing media devices:', error)
        alert(`Error starting preview: ${error.message}`)
      }
    }

    if ((selectedCamera && videoEnabled) || (selectedMicrophone && audioEnabled)) {
      startPreview()
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [selectedCamera, selectedMicrophone])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (url && token && displayName.trim()) {
      // Save display name to localStorage
      localStorage.setItem('displayName', displayName.trim())
      
      // Stop preview stream before connecting
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
      onConnect(url, token, displayName.trim())
    } else if (!displayName.trim()) {
      alert('Please enter a display name')
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>LiveKit Video Conference</h1>
      
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {/* Device Preview */}
        <div style={{ flex: 1 }}>
          <h3>Camera Preview</h3>
          <div style={{ position: 'relative', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ 
                width: '100%', 
                height: '240px', 
                objectFit: 'cover',
                display: videoEnabled ? 'block' : 'none'
              }}
            />
            {!videoEnabled && (
              <div style={{ 
                width: '100%', 
                height: '240px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'white',
                fontSize: '18px'
              }}>
                Camera Off
              </div>
            )}
          </div>
          
          {/* Device Controls */}
          <div style={{ marginTop: '10px' }}>
            <div style={{ marginBottom: '10px' }}>
              <label htmlFor="camera">Camera:</label>
              <select
                id="camera"
                value={selectedCamera}
                onChange={(e) => handleCameraChange(e.target.value)}
                style={{ marginLeft: '10px', width: '200px' }}
              >
                <option value="">Select Camera</option>
                {devices.cameras.map(camera => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `Camera ${camera.deviceId.substr(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            
            <div style={{ marginBottom: '10px' }}>
              <label htmlFor="microphone">Microphone:</label>
              <select
                id="microphone"
                value={selectedMicrophone}
                onChange={(e) => handleMicrophoneChange(e.target.value)}
                style={{ marginLeft: '10px', width: '200px' }}
              >
                <option value="">Select Microphone</option>
                {devices.microphones.map(mic => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Microphone ${mic.deviceId.substr(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Camera and microphone are always enabled */}
            <div style={{ 
              padding: '8px', 
              backgroundColor: '#e8f5e8', 
              borderRadius: '4px', 
              textAlign: 'center',
              fontSize: '14px',
              color: '#2e7d2e'
            }}>
              📹 Camera: ON • 🎤 Microphone: ON
            </div>
          </div>
        </div>

        {/* Connection Form */}
        <div style={{ flex: 1 }}>
          <h3>Room Connection</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="displayName">Display Name:</label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                required
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  marginTop: '5px',
                  border: '1px solid #ccc',
                  borderRadius: '4px'
                }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="url">LiveKit URL:</label>
              <input
                type="text"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="wss://your-livekit-server.com"
                required
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  marginTop: '5px',
                  border: '1px solid #ccc',
                  borderRadius: '4px'
                }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="token">Token:</label>
              <input
                type="text"
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Your access token"
                required
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  marginTop: '5px',
                  border: '1px solid #ccc',
                  borderRadius: '4px'
                }}
              />
            </div>
            <button 
              type="submit"
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              Join Room
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ConnectForm