import { Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ProjectsPage } from './pages/ProjectsPage'
import { GeneratorPage } from './pages/GeneratorPage'
import { ComponentsPage } from './pages/ComponentsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SamplePage } from './pages/SamplePage'

/**
 * Everything under /app. Loaded on demand, so the landing page does not download the editor,
 * the database layer or the drag-and-drop code. Paths here are relative to /app.
 */
export default function AppArea() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ProjectsPage />} />
        <Route path="generator/:projectId?" element={<GeneratorPage />} />
        <Route path="sample" element={<SamplePage />} />
        <Route path="components" element={<ComponentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
