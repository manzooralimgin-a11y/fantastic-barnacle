import { useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { authApi } from '../services/api'
import { ROUTES } from '../constants'

export default function SplashScreen() {
  const { accessToken, guest, navigate } = useApp()

  useEffect(() => {
    const init = async () => {
      await new Promise((r) => setTimeout(r, 1600)) // min splash duration

      if (accessToken && guest) {
        try {
          await authApi.validateToken(accessToken)
          navigate(ROUTES.HOME)
        } catch {
          navigate(ROUTES.LOGIN)
        }
      } else {
        navigate(ROUTES.LOGIN)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-800 to-emerald-600">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32  w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Logo */}
      <div className="relative flex flex-col items-center gap-6 animate-[fadeIn_0.8s_ease-out]">
        <div className="w-24 h-24 rounded-3xl bg-white/15 border border-white/25 flex items-center justify-center shadow-2xl backdrop-blur-sm">
          <span className="text-white font-bold text-3xl tracking-tighter">DE</span>
        </div>
        <div className="text-center">
          <h1 className="text-white text-3xl font-bold tracking-tight">das elb</h1>
          <p className="text-white/50 text-sm mt-1 tracking-widest uppercase">Magdeburg</p>
        </div>
      </div>

      {/* Loading dots */}
      <div className="absolute bottom-16 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-white/40 animate-[bounce_1.2s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
