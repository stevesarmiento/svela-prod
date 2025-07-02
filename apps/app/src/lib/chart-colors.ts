// Predefined pastel color palette
const PASTEL_COLORS = [
    'hsl(210, 40%, 75%)', // Soft blue
    'hsl(340, 45%, 78%)', // Soft pink
    'hsl(160, 42%, 72%)', // Soft green
    'hsl(45, 55%, 78%)',  // Soft yellow
    'hsl(280, 40%, 75%)', // Soft purple
    'hsl(15, 50%, 76%)',  // Soft coral
    'hsl(190, 45%, 72%)', // Soft cyan
    'hsl(120, 38%, 72%)', // Soft lime
    'hsl(300, 42%, 78%)', // Soft magenta
    'hsl(35, 48%, 75%)',  // Soft orange
    'hsl(200, 40%, 75%)', // Soft sky blue
    'hsl(85, 40%, 75%)',  // Soft sage
  ]
  
  export function generatePastelColors(count: number): string[] {
    if (count <= PASTEL_COLORS.length) {
      return PASTEL_COLORS.slice(0, count)
    }
  
    // If we need more colors than predefined, generate additional pastels
    const colors = [...PASTEL_COLORS]
    const hueStep = 360 / count
    
    for (let i = PASTEL_COLORS.length; i < count; i++) {
      const hue = (i * hueStep) % 360
      const saturation = 38 + (i % 3) * 4 // Low saturation (38-46%)
      const lightness = 72 + (i % 2) * 4  // High lightness (72-76%)
      colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`)
    }
    
    return colors
  }
  
  export function addOpacityToColor(color: string, opacity: number): string {
    if (color.startsWith('hsl(')) {
      const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
      if (hslMatch) {
        const [, h, s, l] = hslMatch
        return `hsla(${h}, ${s}%, ${l}%, ${opacity})`
      }
    }
    return color
  }