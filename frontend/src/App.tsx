import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { AuthLayout } from '@/components/AuthLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Dashboard } from '@/pages/Dashboard'
import { Lobby } from '@/pages/Lobby'
import { NotFound } from '@/pages/NotFound'

// Room pulls in the heavy LiveKit client — load it only when entering a call.
const Room = lazy(() => import('@/pages/Room').then((m) => ({ default: m.Room })))

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth pages — full-bleed split layout */}
        <Route element={<AuthLayout />}>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
        </Route>

        {/* Full-screen room — PUBLIC (guest join allowed via shared link), no header/footer chrome */}
        <Route
          path="room/:slug"
          element={
            <Suspense fallback={<RoomFallback />}>
              <Room />
            </Suspense>
          }
        />

        {/* App shell — header + footer chrome */}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route element={<ProtectedRoute />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="lobby" element={<Lobby />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function RoomFallback() {
  return (
    <div className="min-h-svh flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--color-line-strong)] border-t-[var(--color-flame)] animate-spin" />
    </div>
  )
}
