const Sequelize = require('sequelize');

module.exports = function(sequelize, tableName) {
  return sequelize.define(tableName, {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false
    },
    domain: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: false
    },
    schema: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    },
    createdAt: { allowNull: false, type: Sequelize.DATE },
    updatedAt: { allowNull: false, type: Sequelize.DATE }
  });
};
