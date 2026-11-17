export const shorthands = undefined

// These indexes duplicate the indexes PostgreSQL already creates for the UNIQUE constraints on the
// same columns (water_availability_polygons.ea_wb_id and hydrology_readings (measure_id,
// reading_datetime)). They cost write throughput on bulk loads and add no query benefit.
// Mirrors changelog/db.changelog-1.3.xml.
export const up = (pgm) => {
  pgm.dropIndex('water_availability_polygons', 'ea_wb_id', { ifExists: true })
  pgm.dropIndex('hydrology_readings', ['measure_id', 'reading_datetime'], {
    ifExists: true
  })
}

export const down = (pgm) => {
  pgm.createIndex('water_availability_polygons', 'ea_wb_id', {
    ifNotExists: true
  })
  pgm.createIndex('hydrology_readings', ['measure_id', 'reading_datetime'], {
    ifNotExists: true
  })
}
