const Sequelize = require('sequelize');

module.exports = function(sequelize, tableName, schema) {
  const options = { timestamps: false };

  if (schema) {
    options['schema'] = schema;
  }

  return sequelize.define(tableName, {
    filename: { primaryKey: true, type: Sequelize.STRING }
  }, options);
};
