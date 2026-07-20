import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// RTL cleanup — vymaže DOM po každém testu.
// Nutné při vitest bez `globals: true` (afterEach není globální, RTL detekuje chybně).
afterEach(cleanup)
