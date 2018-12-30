const Sequelize = require('sequelize');

module.exports = function(sequelize, tableName) {
  return sequelize.define(tableName, {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    domain: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
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