import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Landing } from './marketing/Landing'

const AppArea = lazy(() => import('./app/AppArea'))

function Loading() {
  return <div role="status" className="grid min-h-dvh place-items-center bg-bg text-ink-muted">Loading…</div>
}

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app/*" element={<Suspense fallback={<Loading />}><AppArea /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
