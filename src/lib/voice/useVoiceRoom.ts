"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { SignalingService } from "./signaling"
import type { VoicePeer, VoiceState, SignalingMessage } from "./types"

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

interface AudioAnalyser {
  analyser: AnalyserNode
  dataArray: Uint8Array<ArrayBuffer>
}

export interface RemoteTranscript {
  userId: string
  username: string
  text: string
  isFinal: boolean
}

export function useVoiceRoom(
  roomCode: string,
  userId: string,
  username: string,
  onAIStateChange?: (enabled: boolean) => void,
  onRemoteTranscript?: (t: RemoteTranscript) => void,
  onPeerLeave?: (peerUserId: string) => void
) {
  const [peers, setPeers] = useState<VoicePeer[]>([])
  const [voiceState, setVoiceState] = useState<VoiceState>({
    micEnabled: true,
    speakerEnabled: true,
    speaking: false,
    audioLevel: 0,
  })
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)

  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const signallingRef = useRef<SignalingService | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AudioAnalyser | null>(null)
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map())
  const speakingPeers = useRef<Set<string>>(new Set())
  const [participants, setParticipants] = useState<
    { userId: string; username: string }[]
  >([])

  // --- Audio analysis for speaking detection ---
  const setupAudioAnalyser = useCallback((stream: MediaStream) => {
    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    audioContextRef.current = audioCtx
    analyserRef.current = { analyser, dataArray }

    let lastLevel = 0
    let lastSpeaking = false
    const checkAudio = () => {
      if (!analyserRef.current) return
      const { analyser, dataArray } = analyserRef.current
      analyser.getByteFrequencyData(dataArray)
      const avg =
        dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      const level = Math.min(1, avg / 128)
      const speaking = level > 0.08
      if (level !== lastLevel || speaking !== lastSpeaking) {
        lastLevel = level
        lastSpeaking = speaking
        setVoiceState((prev) => ({
          ...prev,
          audioLevel: level,
          speaking,
        }))
      }
      requestAnimationFrame(checkAudio)
    }
    checkAudio()
  }, [])

  // --- Get local microphone stream ---
  useEffect(() => {
    let cancelled = false

    const initMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        localStreamRef.current = stream
        setLocalStream(stream)
        setupAudioAnalyser(stream)
      } catch {
        setVoiceState((prev) => ({ ...prev, micEnabled: false }))
      }
    }

    initMic()
    return () => {
      cancelled = true
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      audioContextRef.current?.close()
    }
  }, [setupAudioAnalyser])

  // --- Create a peer connection to a remote user ---
  const createPeerConnection = useCallback(
    (targetId: string, targetUsername: string, isPolite: boolean) => {
      const existing = peerConnections.current.get(targetId)
      if (existing) {
        existing.close()
        peerConnections.current.delete(targetId)
      }

      const pc = new RTCPeerConnection(ICE_SERVERS)
      peerConnections.current.set(targetId, pc)

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!)
        })
      }

      // Audio element for remote audio
      let audioEl = audioElements.current.get(targetId)
      if (!audioEl) {
        audioEl = new Audio()
        audioEl.autoplay = true
        audioElements.current.set(targetId, audioEl)
      }

      let makingOffer = false

      pc.ontrack = (event) => {
        if (audioEl && event.streams[0]) {
          audioEl.srcObject = event.streams[0]
        }
        setPeers((prev) =>
          prev.map((p) =>
            p.userId === targetId
              ? { ...p, stream: event.streams[0], connected: true }
              : p
          )
        )
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signallingRef.current?.sendIceCandidate(
            userId,
            targetId,
            event.candidate.toJSON()
          )
        }
      }

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          removePeer(targetId)
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed"
        ) {
          removePeer(targetId)
        }
      }

      pc.onnegotiationneeded = async () => {
        try {
          makingOffer = true
          await pc.setLocalDescription()
          signallingRef.current?.sendOffer(
            userId,
            username,
            targetId,
            pc.localDescription!
          )
        } catch {
          // ignore
        } finally {
          makingOffer = false
        }
      }

      // Add to peers list
      setPeers((prev) => {
        if (prev.find((p) => p.userId === targetId)) return prev
        return [
          ...prev,
          {
            userId: targetId,
            username: targetUsername,
            connection: pc,
            connected: false,
          },
        ]
      })

      // If we are the polite peer (existing user), trigger offer
      if (isPolite) {
        pc.restartIce()
      }

      return pc
    },
    [userId, username]
  )

  const removePeer = useCallback((targetId: string) => {
    const pc = peerConnections.current.get(targetId)
    if (pc) {
      pc.close()
      peerConnections.current.delete(targetId)
    }
    const audioEl = audioElements.current.get(targetId)
    if (audioEl) {
      audioEl.pause()
      audioEl.srcObject = null
      audioElements.current.delete(targetId)
    }
    setPeers((prev) => prev.filter((p) => p.userId !== targetId))
    onPeerLeaveRef.current?.(targetId)
  }, [])

  // Stable refs for callbacks to prevent handleMessage from changing on every render
  const onAIStateChangeRef = useRef(onAIStateChange)
  onAIStateChangeRef.current = onAIStateChange
  const onRemoteTranscriptRef = useRef(onRemoteTranscript)
  onRemoteTranscriptRef.current = onRemoteTranscript
  const onPeerLeaveRef = useRef(onPeerLeave)
  onPeerLeaveRef.current = onPeerLeave

  // --- Handle incoming signaling messages ---
  const handleMessage = useCallback(
    async (msg: SignalingMessage) => {
      if (msg.senderId === userId) return // ignore self

      switch (msg.type) {
        case "join": {
          createPeerConnection(msg.senderId, msg.senderUsername, true)
          break
        }

        case "leave": {
          removePeer(msg.senderId)
          break
        }

        case "offer": {
          if (msg.targetId !== userId) return
          const pc = createPeerConnection(
            msg.senderId,
            msg.senderUsername,
            false
          )
          if (msg.sdp) {
            // Handle glare: rollback local offer if we have one
            if (pc.signalingState !== "stable") {
              await pc.setLocalDescription({ type: "rollback" })
            }
            await pc.setRemoteDescription(
              new RTCSessionDescription(msg.sdp)
            )
            await pc.setLocalDescription()
            signallingRef.current?.sendAnswer(
              userId,
              username,
              msg.senderId,
              pc.localDescription!
            )
          }
          break
        }

        case "answer": {
          if (msg.targetId !== userId) return
          const pc = peerConnections.current.get(msg.senderId)
          if (pc && msg.sdp) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(msg.sdp)
            )
          }
          break
        }

        case "ice-candidate": {
          if (msg.targetId !== userId) return
          const pc = peerConnections.current.get(msg.senderId)
          if (pc && msg.candidate) {
            try {
              await pc.addIceCandidate(
                new RTCIceCandidate(msg.candidate)
              )
            } catch {
              // ignore invalid candidates
            }
          }
          break
        }

        case "ai-state": {
          onAIStateChangeRef.current?.(msg.aiEnabled ?? false)
          break
        }

        case "transcript": {
          if (msg.transcriptText) {
            onRemoteTranscriptRef.current?.({
              userId: msg.senderId,
              username: msg.senderUsername,
              text: msg.transcriptText,
              isFinal: msg.transcriptIsFinal ?? false,
            })
          }
          break
        }
      }
    },
    [userId, username, createPeerConnection, removePeer]
  )

  // --- Subscribe to signaling channel ---
  useEffect(() => {
    const signaling = new SignalingService()
    signallingRef.current = signaling

    const unsub = signaling.subscribe(
      roomCode,
      userId,
      username,
      handleMessage,
      (p) => {
        setParticipants(p)
      }
    )

    signaling.announceJoin(userId, username)

    return () => {
      signaling.announceLeave(userId)
      unsub()

      // Clean up all peer connections
      peerConnections.current.forEach((pc) => pc.close())
      peerConnections.current.clear()
      audioElements.current.forEach((el) => {
        el.pause()
        el.srcObject = null
      })
      audioElements.current.clear()
      setPeers([])
      setParticipants([])
    }
  }, [roomCode, userId, username, handleMessage])

  // --- Mic toggle ---
  const toggleMic = useCallback(() => {
    setVoiceState((prev) => {
      const enabled = !prev.micEnabled
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = enabled
      })
      return { ...prev, micEnabled: enabled }
    })
  }, [])

  // --- Speaker toggle ---
  const toggleSpeaker = useCallback(() => {
    setVoiceState((prev) => {
      const enabled = !prev.speakerEnabled
      audioElements.current.forEach((el) => {
        el.muted = !enabled
      })
      return { ...prev, speakerEnabled: enabled }
    })
  }, [])

  const broadcastAIState = useCallback(
    (enabled: boolean) => {
      signallingRef.current?.announceAIState(userId, username, enabled)
    },
    [userId, username]
  )

  const broadcastTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      signallingRef.current?.sendTranscript(userId, username, text, isFinal)
    },
    [userId, username]
  )

  return {
    peers,
    participants,
    voiceState,
    localStream,
    toggleMic,
    toggleSpeaker,
    broadcastAIState,
    broadcastTranscript,
  }
}
