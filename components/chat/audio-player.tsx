"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Play, Pause } from "lucide-react"
import { cn } from "@/lib/utils"

interface AudioPlayerProps {
  src: string
  isOutgoing?: boolean
  avatarUrl?: string
  avatarFallback?: string
}

export function AudioPlayer({ src, isOutgoing, avatarUrl, avatarFallback }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)

  // Convert whatsapp-media: URLs to API URLs
  const audioSrc = useMemo(() => {
    if (src.startsWith("whatsapp-media:")) {
      const mediaId = src.replace("whatsapp-media:", "")
      return `/api/whatsapp/media/${mediaId}`
    }
    return src
  }, [src])

  // Generate random waveform heights (memoized to prevent re-renders)
  const waveformHeights = useMemo(() => 
    Array.from({ length: 35 }).map(() => Math.random() * 14 + 3),
  [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration || 0)
    const handleEnded = () => setIsPlaying(false)
    const handleLoadStart = () => setIsLoading(true)
    const handleCanPlay = () => setIsLoading(false)
    const handleError = () => {
      setIsLoading(false)
      setError(true)
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("durationchange", handleDurationChange)
    audio.addEventListener("ended", handleEnded)
    audio.addEventListener("loadstart", handleLoadStart)
    audio.addEventListener("canplay", handleCanPlay)
    audio.addEventListener("error", handleError)

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("durationchange", handleDurationChange)
      audio.removeEventListener("ended", handleEnded)
      audio.removeEventListener("loadstart", handleLoadStart)
      audio.removeEventListener("canplay", handleCanPlay)
      audio.removeEventListener("error", handleError)
    }
  }, [])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      try {
        await audio.play()
        setIsPlaying(true)
      } catch (err) {
        console.error("Play error:", err)
      }
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    audio.currentTime = percentage * duration
  }

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={cn(
      "flex items-center gap-2 py-1",
      isOutgoing ? "min-w-[180px]" : "min-w-[220px]"
    )}>
      {/* Avatar for incoming audio - shown on left like WhatsApp */}
      {!isOutgoing && (
        <div className="shrink-0 h-11 w-11 rounded-full bg-[#dfe5e7] flex items-center justify-center overflow-hidden relative">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg className="h-6 w-6 text-[#8696a0]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          )}
          {/* Microphone icon overlay */}
          <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#00a884] flex items-center justify-center">
            <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </div>
        </div>
      )}

      {/* Play/Pause button */}
      <button 
        onClick={togglePlay}
        disabled={error}
        className={cn(
          "shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors",
          error 
            ? "bg-red-100 text-red-500 cursor-not-allowed"
            : isOutgoing
              ? "bg-[#b3d9b3] text-[#075e54] hover:bg-[#a3c9a3]"
              : "bg-[#e9edef] text-[#54656f] hover:bg-[#d9dfe4]"
        )}
      >
        {isLoading ? (
          <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform and duration */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Waveform - clickable for seeking */}
        <div 
          className="flex items-center gap-[2px] h-[22px] cursor-pointer"
          onClick={handleSeek}
        >
          {waveformHeights.map((height, i) => {
            const barProgress = (i / waveformHeights.length) * 100
            const isPlayed = barProgress < progress
            return (
              <div 
                key={i} 
                className={cn(
                  "w-[3px] rounded-full transition-colors",
                  isPlayed
                    ? isOutgoing ? "bg-[#075e54]" : "bg-[#00a884]"
                    : isOutgoing ? "bg-[#8696a0]/60" : "bg-[#8696a0]/50"
                )}
                style={{ height: `${height}px` }}
              />
            )
          })}
        </div>
        {/* Duration */}
        <span className={cn(
          "text-[11px]",
          isOutgoing ? "text-[#667781]" : "text-[#667781]"
        )}>
          {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>

      {/* Avatar for outgoing audio - shown on right */}
      {isOutgoing && (
        <div className="shrink-0 h-11 w-11 rounded-full bg-[#00a884] flex items-center justify-center overflow-hidden">
          <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} src={audioSrc} preload="metadata" className="hidden" />
    </div>
  )
}
