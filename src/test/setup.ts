import 'fake-indexeddb/auto'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { db } from '../features/projects/db'

beforeEach(async () => {
  await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear(), db.snapshots.clear()])
})
afterEach(() => { cleanup(); document.documentElement.classList.remove('dark'); localStorage.clear() })
