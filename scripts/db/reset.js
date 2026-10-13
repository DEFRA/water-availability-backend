import { createPoolFromEnv } from './pg-pool.js'
import { seedDatabase } from './seed.js'

// Order matters for readability only - CASCADE handles FK dependents regardless of order.
const SEEDED_TABLES = [
  'hydrology_readings',
  'hydrology_measures',
  'hydrology_stations',
  'hof_bands',
  'assessment_point_waterbodies',
  'assessment_points',
  'water_availability_polygons',
  'waterbody_features',
  'operational_catchments',
  'management_catchments',
  'ingestion_batch'
]

export async function resetDatabase(pool) {
  await pool.query(
    `TRUNCATE TABLE ${SEEDED_TABLES.join(', ')} RESTART IDENTITY CASCADE`
  )
  await seedDatabase(pool)
}

async function main() {
  const pool = createPoolFromEnv()

  try {
    await resetDatabase(pool)
    console.log('Local database reset and reseeded successfully')
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
