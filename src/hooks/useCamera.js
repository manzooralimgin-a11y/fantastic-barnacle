import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Manages getUserMedia lifecycle, camera switching, and capture.
 * Returns everything the UI needs; owns no DOM itself.
 */
export function useCamera() {
  const videoRef    = useRef(null)
  const streamRef   = useRef(null)

  const [facingMode,  setFacingMode]  = useState('environment') // back camera first for ID
  const [permission,  setPermission]  = useState('idle')        // idle | requesting | granted | denied | unsupported
  const [cameraError, setCameraError] = useState(null)
  const [isReady,     setIsReady]     = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setIsReady(false)
  }, [])

  const startStream = useCallback(async (facing = facingMode) => {
    stopStream()
    setCameraError(null)
    setIsReady(false)

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('unsupported')
      setCameraError('Camera is not supported on this device or browser.')
      return
    }

    setPermission('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width:      { ideal: 1280 },
          height:     { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream
      setPermission('granted')

      // Attach to <video> element once React has rendered it
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {})
          setIsReady(true)
        }
      }
    } catch (err) {
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
      setPermission(isDenied ? 'denied' : 'unsupported')
      setCameraError(
        isDenied
          ? 'Camera access was denied. Please allow camera access in your browser settings and try again.'
          : `Unable to access camera: ${err.message}`
      )
    }
  }, [facingMode, stopStream])

  // Start on mount and when facingMode changes
  useEffect(() => {
    startStream(facingMode)
    return stopStream
  }, [facingMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const flipCamera = useCallback(() => {
    setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))
  }, [])

  /**
   * Capture current video frame to a base64 JPEG data URL.
   * Returns { dataUrl, mimeType } or throws if video not ready.
   */
  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || !isReady) throw new Error('Camera not ready.')

    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const dataUrl  = canvas.toDataURL('image/jpeg', 0.92)
    const mimeType = 'image/jpeg'
    return { dataUrl, mimeType }
  }, [isReady])

  return {
    videoRef,
    permission,
    cameraError,
    isReady,
    facingMode,
    flipCamera,
    capture,
    retry: () => startStream(facingMode),
  }
}
