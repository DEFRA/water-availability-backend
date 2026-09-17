export const shorthands = undefined

// Enum-like columns were left unconstrained in 202609080001-create-assessment-point-tables.js.
// This migration adds CHECK constraints for the documented value sets only - it does not
// constrain assessment_point_waterbodies.mapping_source, since 'spatial' is currently the only
// known value and the full set of valid mapping sources has not been decided yet.
export const up = (pgm) => {
  pgm.addConstraint(
    'ingestion_batch',
    'chk_ingestion_batch_status',
    "CHECK (status IN ('running', 'succeeded', 'failed'))"
  )

  pgm.addConstraint(
    'management_catchments',
    'chk_management_catchments_water_type',
    "CHECK (water_type IN ('surface', 'groundwater'))"
  )

  pgm.addConstraint(
    'waterbody_features',
    'chk_waterbody_features_water_type',
    "CHECK (water_type IN ('surface', 'groundwater'))"
  )

  pgm.addConstraint(
    'assessment_point_waterbodies',
    'chk_apw_validation_status',
    "CHECK (validation_status IN ('pending', 'valid', 'invalid'))"
  )
}

export const down = (pgm) => {
  pgm.dropConstraint('assessment_point_waterbodies', 'chk_apw_validation_status', {
    ifExists: true
  })
  pgm.dropConstraint('waterbody_features', 'chk_waterbody_features_water_type', {
    ifExists: true
  })
  pgm.dropConstraint('management_catchments', 'chk_management_catchments_water_type', {
    ifExists: true
  })
  pgm.dropConstraint('ingestion_batch', 'chk_ingestion_batch_status', { ifExists: true })
}
