// Dynamic runtime introspection for config fields
// Automatically discovers editable fields and infers constraints

export interface FieldConstraints {
  type: 'number' | 'boolean' | 'string' | 'select'
  min?: number
  max?: number
  step?: number
  options?: string[] | readonly string[]
  label?: string
  unit?: string
  description?: string
}

export interface ConfigField {
  path: string[]           // e.g., ['dutyRequirements', 'odo', 'shifts_per_day']
  pathString: string       // e.g., 'dutyRequirements.odo.shifts_per_day'
  currentValue: any
  constraints: FieldConstraints
}

/**
 * Infer constraints for a numeric field based on key name and current value
 */
function inferNumberConstraints(key: string, value: number): FieldConstraints {
  const keyLower = key.toLowerCase()

  // Hours-based fields
  if (keyLower.includes('hour')) {
    if (keyLower.includes('start') || keyLower === 'daily_start_hour') {
      return {
        type: 'number',
        min: 0,
        max: 23,
        step: 1,
        unit: 'hour',
        label: formatLabel(key),
        description: 'Hour of day (0-23)'
      }
    }
    if (keyLower.includes('shift') || keyLower.includes('per_shift')) {
      return {
        type: 'number',
        min: 1,
        max: 24,
        step: 0.5,
        unit: 'hours',
        label: formatLabel(key)
      }
    }
    if (keyLower.includes('rest') || keyLower.includes('crew_rest')) {
      return {
        type: 'number',
        min: 0,
        max: 24,
        step: 0.5,
        unit: 'hours',
        label: formatLabel(key)
      }
    }
    if (keyLower.includes('recovery')) {
      return {
        type: 'number',
        min: 0,
        max: 72,
        step: 1,
        unit: 'hours',
        label: formatLabel(key)
      }
    }
    if (keyLower.includes('horizon')) {
      return {
        type: 'number',
        min: 1,
        max: 8760,
        step: 1,
        unit: 'hours',
        label: formatLabel(key),
        description: 'Simulation duration'
      }
    }
    // Default hour field
    return {
      type: 'number',
      min: 0,
      max: 168,
      step: 0.25,
      unit: 'hours',
      label: formatLabel(key)
    }
  }

  // Day-based fields
  if (keyLower.includes('day')) {
    if (keyLower.includes('per_day') || keyLower === 'shifts_per_day') {
      return {
        type: 'number',
        min: 1,
        max: 24,
        step: 1,
        unit: 'shifts',
        label: formatLabel(key)
      }
    }
    if (keyLower.includes('days_on')) {
      return {
        type: 'number',
        min: 1,
        max: 7,
        step: 1,
        unit: 'days',
        label: formatLabel(key)
      }
    }
    if (keyLower.includes('days_off') || keyLower.includes('stagger')) {
      return {
        type: 'number',
        min: 0,
        max: 7,
        step: 1,
        unit: 'days',
        label: formatLabel(key)
      }
    }
    if (keyLower.includes('annual') || keyLower.includes('yearly')) {
      return {
        type: 'number',
        min: 0,
        max: 365,
        step: 1,
        unit: 'days/year',
        label: formatLabel(key)
      }
    }
    if (keyLower.includes('quarterly')) {
      return {
        type: 'number',
        min: 0,
        max: 90,
        step: 1,
        unit: 'days/quarter',
        label: formatLabel(key)
      }
    }
    if (keyLower.includes('monthly')) {
      return {
        type: 'number',
        min: 0,
        max: 31,
        step: 1,
        unit: 'days/month',
        label: formatLabel(key)
      }
    }
    // Default day field
    return {
      type: 'number',
      min: 0,
      max: 365,
      step: 1,
      unit: 'days',
      label: formatLabel(key)
    }
  }

  // Percentage fields
  if (keyLower.includes('percent') || keyLower.includes('split')) {
    return {
      type: 'number',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      label: formatLabel(key)
    }
  }

  // Count/requirement fields (pilots, crew, etc.)
  if (keyLower.includes('req') || keyLower.includes('requires_')) {
    return {
      type: 'number',
      min: 0,
      max: 10,
      step: 1,
      unit: 'count',
      label: formatLabel(key)
    }
  }

  // Priority fields
  if (keyLower.includes('priority')) {
    return {
      type: 'number',
      min: 1,
      max: 10,
      step: 1,
      label: formatLabel(key),
      description: 'Higher priority = processed first'
    }
  }

  // Rate fields
  if (keyLower.includes('rate')) {
    return {
      type: 'number',
      min: 0,
      max: 100,
      step: 0.1,
      unit: 'per hour',
      label: formatLabel(key)
    }
  }

  // Count fields (aircraft, personnel, payloads)
  if (keyLower.includes('aircraft') || keyLower.includes('pilot') ||
    keyLower.includes('intel') || keyLower === 'so' ||
    keyLower.includes('tower') || keyLower.includes('pod') ||
    keyLower.includes('sensor') || keyLower.includes('tank')) {
    return {
      type: 'number',
      min: 0,
      max: 50,
      step: 1,
      unit: 'count',
      label: formatLabel(key)
    }
  }

  // Default: reasonable range around current value
  const absValue = Math.abs(value)
  return {
    type: 'number',
    min: Math.max(0, Math.floor(value - Math.max(absValue, 10))),
    max: Math.ceil(value + Math.max(absValue, 10)),
    step: value % 1 !== 0 ? 0.1 : 1,
    label: formatLabel(key)
  }
}

/**
 * Format a camelCase or snake_case key into a readable label
 */
function formatLabel(key: string): string {
  return key
    // Convert snake_case to spaces
    .replace(/_/g, ' ')
    // Insert space before capital letters
    .replace(/([A-Z])/g, ' $1')
    // Capitalize first letter of each word
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim()
}

/**
 * Check if a value should be excluded from introspection
 */
function shouldExcludeField(key: string, value: any): boolean {
  // Exclude array indices
  if (!isNaN(Number(key))) return true

  // Exclude special Vue keys
  if (key.startsWith('__')) return true

  // Exclude complex objects that are not simple configs
  if (key === 'flightTime' && typeof value === 'object') return true
  if (key === 'crew_rotation' && typeof value === 'object') return true

  // Exclude arrays (they need special handling)
  if (Array.isArray(value)) return true

  // Exclude name/type fields (these are not numeric constraints)
  if (key === 'name' || key === 'type' || key === 'missionType') return true

  return false
}

/**
 * Recursively traverse config and extract all editable fields
 */
export function extractEditableFields(config: any, basePath: string[] = []): ConfigField[] {
  const fields: ConfigField[] = []

  if (!config || typeof config !== 'object') return fields

  for (const [key, value] of Object.entries(config)) {
    if (shouldExcludeField(key, value)) continue

    const currentPath = [...basePath, key]
    const pathString = currentPath.join('.')

    // Handle primitive types
    if (typeof value === 'number') {
      fields.push({
        path: currentPath,
        pathString,
        currentValue: value,
        constraints: inferNumberConstraints(key, value)
      })
    } else if (typeof value === 'boolean') {
      fields.push({
        path: currentPath,
        pathString,
        currentValue: value,
        constraints: {
          type: 'boolean',
          label: formatLabel(key)
        }
      })
    } else if (typeof value === 'string') {
      // Check if it's likely an enum/select
      if (key === 'queueing' || key.includes('strategy') || key.includes('mode')) {
        fields.push({
          path: currentPath,
          pathString,
          currentValue: value,
          constraints: {
            type: 'select',
            options: [value], // Can be enhanced with known options
            label: formatLabel(key)
          }
        })
      } else {
        fields.push({
          path: currentPath,
          pathString,
          currentValue: value,
          constraints: {
            type: 'string',
            label: formatLabel(key)
          }
        })
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested objects
      fields.push(...extractEditableFields(value, currentPath))
    }
  }

  return fields
}

/**
 * Get value from config using path array
 */
export function getValueByPath(config: any, path: string[]): any {
  let current = config
  for (const key of path) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}

/**
 * Set value in config using path array (immutably)
 */
export function setValueByPath(config: any, path: string[], value: any): any {
  if (path.length === 0) return value

  const [first, ...rest] = path
  if (!first) return config

  if (Array.isArray(config)) {
    const index = Number(first)
    const newArray = [...config]
    newArray[index] = setValueByPath(newArray[index], rest, value)
    return newArray
  }

  return {
    ...config,
    [first]: rest.length === 0 ? value : setValueByPath(config[first as keyof typeof config], rest, value)
  }
}

/**
 * Group fields by their top-level category
 */
export function groupFieldsByCategory(fields: ConfigField[]): Record<string, ConfigField[]> {
  const grouped: Record<string, ConfigField[]> = {}

  for (const field of fields) {
    const category = field.path[0] || 'other'
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(field)
  }

  return grouped
}

/**
 * Filter fields by path pattern
 * Example: filterFields(fields, 'dutyRequirements.*.shifts_per_day')
 */
export function filterFields(fields: ConfigField[], pattern: string): ConfigField[] {
  const patternParts = pattern.split('.')

  return fields.filter(field => {
    if (field.path.length !== patternParts.length) return false

    return patternParts.every((part, i) =>
      part === '*' || part === field.path[i]
    )
  })
}

/**
 * Get all numeric fields (useful for bulk operations)
 */
export function getNumericFields(fields: ConfigField[]): ConfigField[] {
  return fields.filter(f => f.constraints.type === 'number')
}

/**
 * Get all boolean fields
 */
export function getBooleanFields(fields: ConfigField[]): ConfigField[] {
  return fields.filter(f => f.constraints.type === 'boolean')
}

/**
 * Create a summary of config structure
 */
export function summarizeConfig(config: any): {
  totalFields: number
  numericFields: number
  booleanFields: number
  stringFields: number
  categories: string[]
} {
  const fields = extractEditableFields(config)

  return {
    totalFields: fields.length,
    numericFields: fields.filter(f => f.constraints.type === 'number').length,
    booleanFields: fields.filter(f => f.constraints.type === 'boolean').length,
    stringFields: fields.filter(f => f.constraints.type === 'string').length,
    categories: [...new Set(fields.map(f => f.path[0]).filter((c): c is string => c !== undefined))]
  }
}
