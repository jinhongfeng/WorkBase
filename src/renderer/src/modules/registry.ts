import type { ModuleDefinition } from './defineModule'
const found = import.meta.glob('../features/*/module.tsx', { eager: true })
export const registry: ModuleDefinition[] = Object.values(found)
  .map(module => (module as { default?: ModuleDefinition }).default)
  .filter((module): module is ModuleDefinition => Boolean(module))
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
