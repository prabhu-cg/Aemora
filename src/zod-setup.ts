import { z } from 'zod'

// The site's Content-Security-Policy does not allow eval. Zod would otherwise try it to speed up parsing, be refused,
// and fall back, which shows up as a policy violation. This module must be imported before anything that builds a
// schema, because schemas are created while modules load: that is why it is its own file, imported first in main.tsx.
z.config({ jitless: true })
