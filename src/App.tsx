import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { ProjectsPage } from './app/pages/ProjectsPage'
import { GeneratorPage } from './app/pages/GeneratorPage'
import { ComponentsPage } from './app/pages/ComponentsPage'
import { SettingsPage } from './app/pages/SettingsPage'
import { Landing } from './marketing/Landing'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppShell />}>
        <Route index element={<ProjectsPage />} />
        <Route path="generator" element={<GeneratorPage />} />
        <Route path="components" element={<ComponentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
