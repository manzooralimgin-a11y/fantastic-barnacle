import { useState, useEffect, useRef } from 'react'
import {
  Camera, RefreshCw, CheckCircle2, AlertCircle, FlipHorizontal2,
  ChevronLeft, CreditCard, ScanLine, ShieldCheck, Loader2, X,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCamera } from '../hooks/useCamera'
import { useMutation } from '../hooks/useFetch'
import { idVerificationApi } from '../services/api'
import { ROUTES } from '../constants'

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------
const STEPS = [
  {
    id:          'front',
    label:       'Front of ID',
    instruction: 'Place the front of your ID or passport flat in good lighting.',
    icon:        CreditCard,
  },
  {
    id:          'back',
    label:       'Back of ID',
    instruction: 'Flip your ID over and capture the back side.',
    icon:        ScanLine,
  },
  {
    id:          'complete',
    label:       'Verified',
    instruction: 'Identity verified successfully.',
    icon:        ShieldCheck,
  },
]

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------
function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300',
            i < current
              ? 'bg-emerald-500 text-white scale-95'
              : i === current
                ? 'bg-blue-500 text-white ring-2 ring-blue-400/40 ring-offset-2 ring-offset-stone-950'
                : 'bg-stone-800 text-stone-500',
          ].join(' ')}>
            {i < current ? <CheckCircle2 size={14} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-8 h-0.5 rounded-full transition-all duration-500 ${i < current ? 'bg-emerald-500' : 'bg-stone-800'}`} />
          )}
        </div>
      ))}
      <span className="ml-2 text-xs font-medium text-stone-400">
        {current + 1}/{total}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Camera permission error panel
// ---------------------------------------------------------------------------
function PermissionError({ error, onRetry, onSkip }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
      <div className="w-20 h-20 rounded-2xl bg-stone-800 border border-stone-700 flex items-center justify-center">
        <Camera size={32} className="text-stone-500" />
      </div>
      <div>
        <h3 className="text-white font-semibold text-lg">Camera Access Required</h3>
        <p className="text-stone-400 text-sm mt-2 leading-relaxed max-w-xs">{error}</p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={onRetry}
          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <RefreshCw size={15} />
          Try Again
        </button>
        <button
          onClick={onSkip}
          className="w-full h-12 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium text-sm transition-colors"
        >
          Skip for Now
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live camera viewfinder
// ---------------------------------------------------------------------------
function CameraViewfinder({ videoRef, isReady, facingMode, onFlip, onCapture }) {
  return (
    <div className="relative flex-1 flex flex-col">
      {/* Video element */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={[
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            isReady ? 'opacity-100' : 'opacity-0',
            facingMode === 'user' ? 'scale-x-[-1]' : '',  // mirror front camera
          ].join(' ')}
        />

        {/* Loading overlay */}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-stone-500" />
          </div>
        )}

        {/* ID frame overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Dim corners */}
          <div className="absolute inset-0 bg-black/40" />
          {/* Cut-out rectangle */}
          <div
            className="relative rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{ width: '82%', aspectRatio: '1.586' }}  // ID-1 aspect ratio
          >
            {/* Corner marks */}
            {[
              'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
              'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
              'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
              'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
            ].map((cls, i) => (
              <div key={i} className={`absolute w-5 h-5 border-white/0 -m-px ${cls.replace('border-t-2 border-l-2', '').replace('border-t-2 border-r-2', '').replace('border-b-2 border-l-2', '').replace('border-b-2 border-r-2', '')}`} />
            ))}
            {/* Scan line animation */}
            <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400/70 animate-[scanLine_2.5s_ease-in-out_infinite]" />
          </div>
        </div>

        {/* Flip camera button */}
        <button
          onClick={onFlip}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
        >
          <FlipHorizontal2 size={18} />
        </button>
      </div>

      {/* Capture button */}
      <div className="flex justify-center py-6 bg-stone-950">
        <button
          onClick={onCapture}
          disabled={!isReady}
          className={[
            'w-18 h-18 rounded-full border-4 flex items-center justify-center transition-all',
            isReady
              ? 'border-white bg-white/10 hover:bg-white/20 active:scale-90'
              : 'border-stone-600 bg-stone-800/40 cursor-not-allowed',
          ].join(' ')}
          style={{ width: 72, height: 72 }}
        >
          <div className={`w-12 h-12 rounded-full transition-colors ${isReady ? 'bg-white' : 'bg-stone-600'}`} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Image review panel
// ---------------------------------------------------------------------------
function ImageReview({ imageUrl, onRetake, onSubmit, loading, stepLabel }) {
  return (
    <div className="flex-1 flex flex-col">
      {/* Preview */}
      <div className="relative flex-1 bg-black overflow-hidden">
        <img
          src={imageUrl}
          alt="Captured ID"
          className="absolute inset-0 w-full h-full object-contain"
        />
        <div className="absolute bottom-4 inset-x-0 flex justify-center">
          <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-xs text-white/70 border border-white/10">
            {stepLabel} captured — review before submitting
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 px-5 py-5 bg-stone-950">
        <button
          onClick={onRetake}
          disabled={loading}
          className="flex-1 h-12 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={15} />
          Retake
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-[2] h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> Verifying…</>
          ) : (
            <><ShieldCheck size={16} /> Submit & Verify</>
          )}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Success panel
// ---------------------------------------------------------------------------
function SuccessPanel({ onContinue }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
      {/* Animated checkmark */}
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center animate-[scaleIn_0.5s_cubic-bezier(0.34,1.56,0.64,1)]">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center animate-[scaleIn_0.5s_cubic-bezier(0.34,1.56,0.64,1)_0.1s_both]">
            <CheckCircle2 size={36} className="text-emerald-400 animate-[scaleIn_0.4s_cubic-bezier(0.34,1.56,0.64,1)_0.2s_both]" />
          </div>
        </div>
        {/* Pulse rings */}
        <div className="absolute inset-0 rounded-full border-2 border-emerald-400/20 animate-ping" />
      </div>

      <div className="animate-[fadeUp_0.5s_ease-out_0.3s_both]">
        <h2 className="text-white text-xl font-bold">Identity Verified</h2>
        <p className="text-stone-400 text-sm mt-2 leading-relaxed">
          Your ID has been verified successfully.<br />
          Redirecting to your dashboard…
        </p>
      </div>

      <div className="flex gap-1.5 animate-[fadeUp_0.4s_ease-out_0.5s_both]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-[bounce_1s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Submission error banner
// ---------------------------------------------------------------------------
function ErrorBanner({ message, onDismiss }) {
  return (
    <div className="mx-5 mt-3 flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25">
      <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
      <p className="text-sm text-red-300 leading-snug flex-1">{message}</p>
      <button onClick={onDismiss} className="text-red-400/60 hover:text-red-400">
        <X size={14} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function IDVerificationScreen() {
  const { navigate, setIdVerified } = useApp()
  const { videoRef, permission, cameraError, isReady, facingMode, flipCamera, capture, retry } = useCamera()

  // step index: 0 = front, 1 = back
  const [stepIndex,    setStepIndex]    = useState(0)
  const [capturedImage, setCapturedImage] = useState(null)  // { dataUrl, mimeType }
  const [phase,        setPhase]        = useState('camera') // camera | review | success
  const [submitError,  setSubmitError]  = useState(null)
  // collect verificationIds for final completeVerification call
  const verificationIds = useRef([])

  const { mutate: submitVerification, loading: submitting } = useMutation(
    idVerificationApi.submitIDVerification
  )

  const currentStep = STEPS[stepIndex]

  // Auto-redirect after success
  useEffect(() => {
    if (phase === 'success') {
      const t = setTimeout(() => {
        setIdVerified(true)
        navigate(ROUTES.HOME)
      }, 2000)
      return () => clearTimeout(t)
    }
  }, [phase, navigate, setIdVerified])

  const handleCapture = () => {
    try {
      const result = capture()
      setCapturedImage(result)
      setPhase('review')
      setSubmitError(null)
    } catch (err) {
      setSubmitError(err.message)
    }
  }

  const handleRetake = () => {
    setCapturedImage(null)
    setPhase('camera')
    setSubmitError(null)
  }

  const handleSubmit = async () => {
    setSubmitError(null)
    try {
      const result = await submitVerification({
        imageData: capturedImage.dataUrl,
        mimeType:  capturedImage.mimeType,
        side:      currentStep.id,
      })
      verificationIds.current.push(result.verificationId)

      if (stepIndex < STEPS.length - 2) {
        // Move to next capture step (back of ID)
        setCapturedImage(null)
        setPhase('camera')
        setStepIndex((i) => i + 1)
      } else {
        // All sides captured — complete
        await idVerificationApi.completeVerification(verificationIds.current)
        setStepIndex(STEPS.length - 1) // "complete" step
        setPhase('success')
      }
    } catch (err) {
      setSubmitError(err.message || 'Verification failed. Please try again.')
    }
  }

  const isPermissionBlocked = permission === 'denied' || permission === 'unsupported'
  const showingCamera       = phase === 'camera' && !isPermissionBlocked
  const captureStepCount    = STEPS.length - 1  // exclude the "complete" step

  return (
    <div className="fixed inset-0 flex flex-col bg-stone-950 text-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
        <button
          onClick={() => navigate(ROUTES.HOME)}
          className="w-9 h-9 rounded-xl bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest">
            ID Verification
          </span>
          <StepIndicator
            current={Math.min(stepIndex, captureStepCount - 1)}
            total={captureStepCount}
          />
        </div>

        {/* Placeholder to balance the back button */}
        <div className="w-9" />
      </div>

      {/* ── Step label + instruction ── */}
      {phase !== 'success' && (
        <div className={`px-5 pb-4 shrink-0 transition-all duration-300 ${isPermissionBlocked ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-stone-900 border border-stone-800">
            <div className="w-9 h-9 rounded-xl bg-stone-800 flex items-center justify-center shrink-0">
              {currentStep.icon && <currentStep.icon size={18} className="text-blue-400" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">{currentStep.label}</p>
              <p className="text-xs text-stone-400 mt-0.5 leading-snug">{currentStep.instruction}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Error banner (submission errors) ── */}
      {submitError && phase !== 'success' && (
        <ErrorBanner message={submitError} onDismiss={() => setSubmitError(null)} />
      )}

      {/* ── Main content area ── */}
      {phase === 'success' ? (
        <SuccessPanel />
      ) : isPermissionBlocked ? (
        <PermissionError
          error={cameraError}
          onRetry={retry}
          onSkip={() => navigate(ROUTES.HOME)}
        />
      ) : phase === 'review' && capturedImage ? (
        <ImageReview
          imageUrl={capturedImage.dataUrl}
          stepLabel={currentStep.label}
          onRetake={handleRetake}
          onSubmit={handleSubmit}
          loading={submitting}
        />
      ) : (
        <CameraViewfinder
          videoRef={videoRef}
          isReady={isReady}
          facingMode={facingMode}
          onFlip={flipCamera}
          onCapture={handleCapture}
        />
      )}

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scanLine {
          0%   { top: 0%; opacity: 1; }
          45%  { top: calc(100% - 2px); opacity: 1; }
          50%  { opacity: 0; }
          55%  { top: 0%; opacity: 0; }
          60%  { opacity: 1; }
          100% { top: calc(100% - 2px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
