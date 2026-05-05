// Convert audio blob to MP3 format for WhatsApp compatibility
// WhatsApp supports: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg (OPUS only, mono)

export async function convertToMp3(audioBlob: Blob): Promise<Blob> {
  console.log("[v0] Starting audio conversion, blob type:", audioBlob.type, "size:", audioBlob.size)
  
  // Create an audio element to decode the WebM
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    const audioUrl = URL.createObjectURL(audioBlob)
    
    audio.onloadedmetadata = async () => {
      console.log("[v0] Audio metadata loaded, duration:", audio.duration)
      
      try {
        // Create offline audio context for processing
        const sampleRate = 44100
        const duration = audio.duration
        const numberOfChannels = 1 // Mono for WhatsApp
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const OfflineAudioContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext
        const offlineContext = new OfflineAudioContext(
          numberOfChannels,
          Math.ceil(sampleRate * duration),
          sampleRate
        )
        
        // Fetch and decode the audio data
        const arrayBuffer = await audioBlob.arrayBuffer()
        console.log("[v0] Decoding audio data...")
        
        let audioBuffer: AudioBuffer
        try {
          audioBuffer = await offlineContext.decodeAudioData(arrayBuffer)
          console.log("[v0] Audio decoded successfully")
        } catch (decodeError) {
          console.error("[v0] decodeAudioData failed:", decodeError)
          // If decoding fails, try using MediaRecorder to re-record in a compatible format
          throw new Error("Audio format not supported for conversion")
        }
        
        // Get the audio samples
        const samples = audioBuffer.getChannelData(0)
        
        // Convert to Int16
        const samples16 = new Int16Array(samples.length)
        for (let i = 0; i < samples.length; i++) {
          const s = Math.max(-1, Math.min(1, samples[i]))
          samples16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        
        // Load lamejs dynamically
        console.log("[v0] Loading lamejs encoder...")
        const lamejsModule = await import('lamejs')
        const lamejs = lamejsModule.default || lamejsModule
        
        console.log("[v0] lamejs module:", Object.keys(lamejs))
        
        if (!lamejs.Mp3Encoder) {
          throw new Error("Mp3Encoder not available in lamejs")
        }
        
        // Create MP3 encoder - 1 channel (mono), sample rate, 128kbps for better quality
        const mp3encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, 128)
        
        // Encode to MP3 in chunks
        const mp3Data: Uint8Array[] = []
        const blockSize = 1152
        
        for (let i = 0; i < samples16.length; i += blockSize) {
          const chunk = samples16.subarray(i, Math.min(i + blockSize, samples16.length))
          const mp3buf = mp3encoder.encodeBuffer(chunk)
          if (mp3buf.length > 0) {
            mp3Data.push(new Uint8Array(mp3buf))
          }
        }
        
        // Flush remaining data
        const mp3buf = mp3encoder.flush()
        if (mp3buf.length > 0) {
          mp3Data.push(new Uint8Array(mp3buf))
        }
        
        // Combine all MP3 chunks
        const totalLength = mp3Data.reduce((acc, arr) => acc + arr.length, 0)
        const mp3Array = new Uint8Array(totalLength)
        let offset = 0
        for (const chunk of mp3Data) {
          mp3Array.set(chunk, offset)
          offset += chunk.length
        }
        
        console.log("[v0] MP3 conversion complete, size:", mp3Array.length)
        URL.revokeObjectURL(audioUrl)
        
        resolve(new Blob([mp3Array], { type: 'audio/mpeg' }))
      } catch (error) {
        console.error("[v0] Conversion error:", error)
        URL.revokeObjectURL(audioUrl)
        reject(error)
      }
    }
    
    audio.onerror = (e) => {
      console.error("[v0] Audio load error:", e)
      URL.revokeObjectURL(audioUrl)
      reject(new Error("Failed to load audio file"))
    }
    
    audio.src = audioUrl
  })
}
