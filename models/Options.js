const _ = require('underscore');
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

const ConfigFileFormat = require('../schemas/ConfigFileFormat');

/**
 * Takes command line arguments and returns objects that can
 * be used by the caller.
 *
 * @param args is a plain javascript object containing key/value
 * pairs that correspond to the arguments passed via the command line.
 *     - args.config is the path (from calling directory) to config file.
 *
 * @param callback is called back with (err, options),
 * where options contains:
 *     - args (the arguments passed from the command line)
 *     - sequelize (see http://docs.sequelizejs.com/)
 *     - config (config file from args.config)
 *     - migrations (list of migrations filenames)
 *
 * @since      1.0.10
 *
 * @see  migrate-up.js
 */
function load(args, callback) {
  try {
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

      callback(null, {
        args,
        sequelize,
        config,
        migrations: items
      });
    });
  } catch (e) {
    callback(e, null);
  }
}

module.exports = {
  load
}
