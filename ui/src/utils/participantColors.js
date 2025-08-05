// Color palette for participants - 12 distinct colors with low saturation
const colorPalette = [
  'hsl(0, 35%, 55%)',    // Soft red
  'hsl(30, 35%, 55%)',   // Soft orange
  'hsl(60, 35%, 55%)',   // Soft yellow
  'hsl(90, 35%, 50%)',   // Soft yellow-green
  'hsl(120, 35%, 45%)',  // Soft green
  'hsl(150, 35%, 45%)',  // Soft teal
  'hsl(180, 35%, 50%)',  // Soft cyan
  'hsl(210, 35%, 55%)',  // Soft blue
  'hsl(240, 35%, 60%)',  // Soft indigo
  'hsl(270, 35%, 60%)',  // Soft purple
  'hsl(300, 35%, 55%)',  // Soft magenta
  'hsl(330, 35%, 55%)',  // Soft pink
]

// Store color assignments
const participantColors = new Map()
let colorIndex = 0

export function getParticipantColor(identity) {
  if (!identity) return null
  
  // Check if we already have a color for this participant
  if (participantColors.has(identity)) {
    return participantColors.get(identity)
  }
  
  // Assign a new color - jump 3 indices for better contrast
  const actualIndex = (colorIndex * 3) % colorPalette.length
  const color = colorPalette[actualIndex]
  participantColors.set(identity, color)
  colorIndex++
  
  return color
}

export function clearParticipantColor(identity) {
  participantColors.delete(identity)
}

export function clearAllColors() {
  participantColors.clear()
  colorIndex = 0
}