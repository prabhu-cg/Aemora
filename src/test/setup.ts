import 'fake-indexeddb/auto'
import { afterEach, beforeEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import { db } from '../features/projects/db'

// The suite is large and runs in parallel, and CI machines are slower than laptops. Waiting for the screen
// to catch up with storage needs more than the 1 second default.
configure({ asyncUtilTimeout: 5000 })

beforeEach(async () => {
  await Promise.all([db.projects.clear(), db.previous.clear(), db.quarantine.clear(), db.snapshots.clear()])
})
afterEach(() => { cleanup(); document.documentElement.classList.remove('dark'); localStorage.clear() })
