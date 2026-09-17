export const shorthands = undefined

// Hydrology API tables (stations / measures / readings) were defined in schema/ddsp-schema-design.sql
// and schema/data-dictionary.md but omitted from 202609080001-create-assessment-point-tables.js.
// This migration is additive only - it does not alter any table created by that migration.
export const up = (pgm) => {
  pgm.createTable(
    'hydrology_stations',
    {
      id: { type: 'serial', primaryKey: true },
      station_id: { type: 'varchar(100)', unique: true, notNull: true },
      wiski_id: { type: 'varchar(100)' },
      nrfa_station_id: { type: 'varchar(100)' },
      name: { type: 'varchar(255)' },
      easting: { type: 'integer' },
      northing: { type: 'integer' },
      geom: { type: 'geometry(Point, 4326)', notNull: true },
      properties: { type: 'jsonb' },
      ingestion_batch_id: {
        type: 'integer',
        references: 'ingestion_batch(id)'
      },
      source_updated_at: { type: 'timestamptz' },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP')
      }
    },
    { ifNotExists: true }
  )

  pgm.createIndex('hydrology_stations', 'geom', { method: 'gist', ifNotExists: true })

  pgm.createTable(
    'hydrology_measures',
    {
      id: { type: 'serial', primaryKey: true },
      measure_id: { type: 'varchar(255)', unique: true, notNull: true },
      station_id: {
        type: 'integer',
        notNull: true,
        references: 'hydrology_stations(id)',
        onDelete: 'CASCADE'
      },
      parameter_name: { type: 'varchar(100)', notNull: true },
      period_name: { type: 'varchar(100)' },
      value_type: { type: 'varchar(100)' },
      unit_name: { type: 'varchar(50)' },
      observation_type: { type: 'varchar(50)' },
      properties: { type: 'jsonb' },
      ingestion_batch_id: {
        type: 'integer',
        references: 'ingestion_batch(id)'
      },
      source_updated_at: { type: 'timestamptz' },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP')
      }
    },
    { ifNotExists: true }
  )

  pgm.createIndex('hydrology_measures', 'station_id', { ifNotExists: true })

  pgm.createTable(
    'hydrology_readings',
    {
      id: { type: 'bigserial', primaryKey: true },
      measure_id: {
        type: 'integer',
        notNull: true,
        references: 'hydrology_measures(id)',
        onDelete: 'CASCADE'
      },
      reading_datetime: { type: 'timestamptz', notNull: true },
      value: { type: 'numeric(14,4)' },
      quality: { type: 'varchar(50)' },
      completeness: { type: 'varchar(50)' },
      qflag: { type: 'varchar(100)' },
      ingestion_batch_id: {
        type: 'integer',
        references: 'ingestion_batch(id)'
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP')
      }
    },
    { ifNotExists: true }
  )

  pgm.addConstraint(
    'hydrology_readings',
    'hydrology_readings_unique_measure_time',
    'UNIQUE (measure_id, reading_datetime)'
  )
  pgm.addConstraint(
    'hydrology_readings',
    'chk_hydrology_readings_quality',
    "CHECK (quality IS NULL OR quality IN ('Good', 'Estimated', 'Suspect', 'Unchecked', 'Missing'))"
  )
  pgm.addConstraint(
    'hydrology_readings',
    'chk_hydrology_readings_completeness',
    "CHECK (completeness IS NULL OR completeness IN ('Complete', 'Incomplete'))"
  )

  pgm.createIndex('hydrology_readings', ['measure_id', 'reading_datetime'], {
    ifNotExists: true
  })
}

export const down = (pgm) => {
  pgm.dropTable('hydrology_readings', { ifExists: true, cascade: true })
  pgm.dropTable('hydrology_measures', { ifExists: true, cascade: true })
  pgm.dropTable('hydrology_stations', { ifExists: true, cascade: true })
}
