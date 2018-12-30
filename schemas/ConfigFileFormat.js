const Schema = require('validate');

module.exports = new Schema({
  dbUser: {
    required: true,
    message: 'Config file missing "dbUser"'
  },

  dbPassword: {
    required: false,
    message: 'Config file missing "dbPassword"'
  },

  dbName: {
    required: true,
    message: 'Config file missing "dbName"'
  },

  dbHost: {
    required: true,
    message: 'Config file missing "dbHost"'
  },

  dbPort: {
    required: true,
    message: 'Config file missing "dbPort"'
  },

  publicSchemaDisplayName: {
    required: true,
    message: 'Config file missing "publicSchemaDisplayName"'
  },

  tenantMapperTableName: {
    required: true,
    message: 'Config file missing "tenantMapperTableName"'
  },

  migrationsDirectory: {
    required: true,
    message: 'Config file missing "migrationsDirectory"'
  },

  migrationsTableName: {
    required: true,
    message: 'Config file missing "migrationsTableName"'
  }
});
