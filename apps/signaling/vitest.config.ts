import { defineConfig } from 'vitest/config'

// Placeholder: LB-6 switches this to @cloudflare/vitest-pool-workers once the PairRoom tests exist.
export default defineConfig({ test: { passWithNoTests: true } })
