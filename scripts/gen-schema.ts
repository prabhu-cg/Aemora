// Run with: npm run schema   (Node 24 strips the types; no bundler needed)
import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { JsonComponentsSchema } from '../src/features/inputs/jsonSchema.ts'

const schema = z.toJSONSchema(JsonComponentsSchema, { target: 'draft-2020-12' })
const out = { $id: 'https://aemora/schemas/aemora-components-v1.json', title: 'Aemora component JSON v1', ...schema }
writeFileSync(new URL('../public/schemas/aemora-components-v1.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log('wrote public/schemas/aemora-components-v1.json')
