const _ = require('underscore');
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

const ConfigFileFormat = require('./schemas/ConfigFileFormat');

// Given a set of required command line arguments, does the following:
// - checks that command line arguments are valid
// - sets up sequelize
// - ensures that the default public mapper table exists.
// - generates a list of migrations.
module.exports = function(Arguments) {
  return new Promise((resolve, reject) => {
    try {
      const args = process.argv
        .slice(2)
        .map(arg => arg.split('='))
        .reduce((args, [value, key]) => {
          args[value] = key;
          return args;
        }, {});

      const argErrors = Arguments.validate(args);
      if (argErrors.length > 0) {
        console.log(argErrors[0].message);
        process.exit(1);
      }

      if (!args.config) {
        console.log('You must provide argument config=<Path>');
        process.exit(1);
      }

      const config = require(path.join(process.cwd(), args.config));

      const configErrors = ConfigFileFormat.validate(config);
      if (configErrors.length > 0) {
        console.log(configErrors[0].message);
        process.exit(1);
      }

      const sequelize = new Sequelize(
        config.dbName,
        config.dbUser,
        config.dbPassword,
        {
          host: config.dbHost,
          dialect: 'postgres',
          port: config.dbPort,
          logging: false,
          operatorsAliases: false
        }
      );

      const MapperTable = sequelize.define(config.tenantMapperTableName, {
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

      const migrationsPath = path.join(process.cwd(), config.migrationsDirectory);
      fs.readdir(migrationsPath, function(err, items) {
        if (err) {
          console.log('Could not load migrations from ' + config.migrationsDirectory);
          process.exit(1);
        }

        resolve({
          args,
          sequelize,
          config,
          migrations: items
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}
