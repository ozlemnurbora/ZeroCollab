import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.mock('../utils/database.js', () => ({
  replaceTasksForOwner: vi.fn(),
  getTasksForOwner: vi.fn(),
}))

vi.mock('../utils/supabase.js', () => ({
  supabase: {},
}))
