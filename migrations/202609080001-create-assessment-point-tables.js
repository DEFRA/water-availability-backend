export const shorthands = undefined

export const up = (pgm) => {
  pgm.createExtension('postgis', { ifNotExists: true })

  pgm.createTable(
    'ingestion_batch',
    {
      id: { type: 'serial', primaryKey: true },
      source_name: { type: 'varchar(100)', notNull: true },
      source_version: { type: 'varchar(100)' },
      started_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP')
      },
      finished_at: { type: 'timestamptz' },
      row_count: { type: 'integer' },
      status: {
        type: 'varchar(20)',
        notNull: true,
        default: 'running'
      }
    },
    { ifNotExists: true }
  )

  pgm.createTable(
    'management_catchments',
    {
      id: { type: 'serial', primaryKey: true },
      management_catchment_id: {
        type: 'varchar(100)',
        unique: true,
        notNull: true
      },
      name: { type: 'varchar(255)' },
      water_type: {
        type: 'varchar(20)',
        notNull: true,
        default: 'surface'
      },
      river_basin_district: { type: 'varchar(255)' },
      geom: { type: 'geometry(Geometry, 4326)', notNull: true },
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

  pgm.createIndex('management_catchments', 'geom', {
    method: 'gist',
    ifNotExists: true
  })

  pgm.createTable(
    'operational_catchments',
    {
      id: { type: 'serial', primaryKey: true },
      operational_catchment_id: {
        type: 'varchar(100)',
        unique: true,
        notNull: true
      },
      name: { type: 'varchar(255)' },
      management_catchment_id: {
        type: 'integer',
        references: 'management_catchments(id)'
      },
      geom: { type: 'geometry(Geometry, 4326)', notNull: true },
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

  pgm.createIndex('operational_catchments', 'geom', {
    method: 'gist',
    ifNotExists: true
  })
  pgm.createIndex('operational_catchments', 'management_catchment_id', {
    ifNotExists: true
  })

  pgm.createTable(
    'waterbody_features',
    {
      id: { type: 'serial', primaryKey: true },
      waterbody_id: {
        type: 'varchar(100)',
        unique: true,
        notNull: true
      },
      name: { type: 'varchar(255)' },
      water_body_type: { type: 'varchar(50)' },
      water_type: {
        type: 'varchar(20)',
        notNull: true,
        default: 'surface'
      },
      operational_catchment_id: {
        type: 'integer',
        references: 'operational_catchments(id)'
      },
      geom: { type: 'geometry(Geometry, 4326)', notNull: true },
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

  pgm.createIndex('waterbody_features', 'geom', {
    method: 'gist',
    ifNotExists: true
  })
  pgm.createIndex('waterbody_features', 'operational_catchment_id', {
    ifNotExists: true
  })

  pgm.createTable(
    'water_availability_polygons',
    {
      id: { type: 'serial', primaryKey: true },
      ea_wb_id: {
        type: 'varchar(255)',
        unique: true,
        notNull: true
      },
      camscdsq30: { type: 'varchar(255)' },
      camscdsq50: { type: 'varchar(255)' },
      camscdsq70: { type: 'varchar(255)' },
      camscdsq95: { type: 'varchar(255)' },
      resavail: { type: 'varchar(255)' },
      shape_area: { type: 'double precision' },
      shape_leng: { type: 'double precision' },
      geom: { type: 'geometry(Geometry, 4326)', notNull: true },
      source_srid: {
        type: 'integer',
        notNull: true,
        default: 27700
      },
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

  pgm.createIndex('water_availability_polygons', 'geom', {
    method: 'gist',
    ifNotExists: true
  })
  pgm.createIndex('water_availability_polygons', 'ea_wb_id', {
    ifNotExists: true
  })

  pgm.createTable(
    'assessment_points',
    {
      id: { type: 'serial', primaryKey: true },
      assessment_point_id: {
        type: 'varchar(100)',
        notNull: true,
        unique: true
      },
      name: { type: 'varchar(255)' },
      codes: { type: 'jsonb' },
      source_srid: { type: 'integer', notNull: true, default: 4326 },
      geom: { type: 'geometry(Point, 4326)', notNull: true },
      operational_catchment_id: {
        type: 'integer',
        references: 'operational_catchments(id)'
      },
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

  pgm.createIndex('assessment_points', 'geom', {
    method: 'gist',
    ifNotExists: true
  })
  pgm.createIndex('assessment_points', 'operational_catchment_id', {
    ifNotExists: true
  })

  pgm.createTable(
    'assessment_point_waterbodies',
    {
      id: { type: 'serial', primaryKey: true },
      assessment_point_id: {
        type: 'integer',
        notNull: true,
        references: 'assessment_points(id)',
        onDelete: 'CASCADE'
      },
      waterbody_id: {
        type: 'varchar(100)',
        notNull: true,
        references: 'waterbody_features(waterbody_id)'
      },
      mapping_source: {
        type: 'varchar(50)',
        notNull: true,
        default: 'spatial'
      },
      validation_status: {
        type: 'varchar(30)',
        notNull: true,
        default: 'pending'
      },
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

  pgm.createIndex('assessment_point_waterbodies', 'assessment_point_id', {
    ifNotExists: true
  })
  pgm.createIndex('assessment_point_waterbodies', 'waterbody_id', {
    ifNotExists: true
  })
  pgm.addConstraint(
    'assessment_point_waterbodies',
    'assessment_point_waterbodies_unique_pair',
    'UNIQUE (assessment_point_id, waterbody_id)'
  )

  pgm.createTable(
    'hof_bands',
    {
      id: { type: 'serial', primaryKey: true },
      waterbody_id: {
        type: 'varchar(100)',
        notNull: true,
        references: 'waterbody_features(waterbody_id)'
      },
      band: { type: 'varchar(50)', notNull: true },
      threshold_ml_per_day: { type: 'numeric(12,3)' },
      effective_from: { type: 'date' },
      effective_to: { type: 'date' },
      ingestion_batch_id: {
        type: 'integer',
        references: 'ingestion_batch(id)'
      },
      is_stub_data: {
        type: 'boolean',
        notNull: true,
        default: true
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

  pgm.createIndex('hof_bands', 'waterbody_id', { ifNotExists: true })
}

export const down = (pgm) => {
  pgm.dropTable('hof_bands', { ifExists: true, cascade: true })
  pgm.dropTable('assessment_point_waterbodies', {
    ifExists: true,
    cascade: true
  })
  pgm.dropTable('assessment_points', { ifExists: true, cascade: true })
  pgm.dropTable('water_availability_polygons', {
    ifExists: true,
    cascade: true
  })
  pgm.dropTable('waterbody_features', { ifExists: true, cascade: true })
  pgm.dropTable('operational_catchments', { ifExists: true, cascade: true })
  pgm.dropTable('management_catchments', { ifExists: true, cascade: true })
  pgm.dropTable('ingestion_batch', { ifExists: true, cascade: true })
}
