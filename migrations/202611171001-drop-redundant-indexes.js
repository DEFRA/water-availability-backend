export const shorthands = undefined

// These indexes duplicate indexes that already exist, cost write throughput and storage on bulk
// loads, and add no query benefit: water_availability_polygons.ea_wb_id and hydrology_readings
// (measure_id, reading_datetime) duplicate the index behind the UNIQUE constraint on the same
// columns, and assessment_point_waterbodies.assessment_point_id duplicates the leading column of
// the UNIQUE (assessment_point_id, waterbody_id) constraint. The waterbody_id index on
// assessment_point_waterbodies is NOT redundant and is kept.
// Mirrors changelog/db.changelog-1.3.xml.
export const up = (pgm) => {
  pgm.dropIndex('water_availability_polygons', 'ea_wb_id', { ifExists: true })
  pgm.dropIndex('hydrology_readings', ['measure_id', 'reading_datetime'], {
    ifExists: true
  })
  pgm.dropIndex('assessment_point_waterbodies', 'assessment_point_id', {
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
  pgm.createIndex('assessment_point_waterbodies', 'assessment_point_id', {
    ifNotExists: true
  })
}
