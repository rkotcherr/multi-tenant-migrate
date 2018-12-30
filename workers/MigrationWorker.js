const _ = require('underscore');
const Schema = require('validate');
const Sequelize = require('sequelize');
const eachSeries = require('async').eachSeries;
const path = require('path');

const setup = require('../_setup');
const RequireConfig = require('../schemas/RequireConfig');
const MigrationsTable = require('../models/MigrationsTable');

const TRANSACTION_OPTIONS = {
  isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE,
  type: Sequelize.Transaction.TYPES.DEFERRED
};

// NOTE we want the _entire_ process of migrating and saving migration into
// options.migrationsTable to be considered a single transaction, that way if
// any of the migration steps fail, or further saving migration success fails,
// the entire unit will roll back.
async function runAndSaveOneMigrationAsTransaction(filename, options, schema) {
  const fullpath = path.join(process.cwd(), options.config.migrationsDirectory, filename);
  const migrationFile = require(fullpath);

  const isPublicHandler = options.config.publicSchemaDisplayName === schema;
  const existingMigration = await options.migrationsTable.findOne({ where: { filename } });

  if (!existingMigration) {
    await options.sequelize.transaction(TRANSACTION_OPTIONS, async function(transaction) {

      // Here we're going to wrap the queryInterface methods from sequelize, as there
      // doesn't seem to be a way to manually set that on a queryInterface instace. It should
      // be difficult, if not impossible to cause queries to be run against the wrong schema.
      //
      // Note that _all_ methods haven't yet been implemented. It would be good to test
      //
      // http://docs.sequelizejs.com/class/lib/query-interface.js
      function getQueryInterface(schema) {
        const _queryInterface = options.sequelize.getQueryInterface();
        const _options = { transaction };

        if (options.config.publicSchemaDisplayName !== schema) {
          _options['schema'] = schema;
        }

        function addColumn(tableName, attribute, options={}) {

          // NOTE: purposefully adding _options _before_ options, in the off-chance somebody
          // needs to override the transaction or schema. I can't think of any reason that'd
          // be necessary right now but ¯\_(ツ)_/¯
          return _queryInterface.addColumn(tableName, attribute, _.extend(_options, options))
        }

        function addConstraint(tableName, attribute, options={}) {
          return _queryInterface.addConstraint(tableName, attribute, _.extend(_options, options));
        }

        function addIndex(tableName, options={}) {
          return _queryInterface.addIndex(tableName, _.extend(_options, options));
        }

        function bulkDelete() {
          throw new Error('bulkDelete() has not yet been implemented in queryInterface wrapper.');
        }

        function bulkInsert() {
          throw new Error('bulkInsert() has not yet been implemented in queryInterface wrapper.');
        }

        function changeColumn(tableName, attributeName, dataTypeOrOptions, options) {
          return _queryInterface.changeColumn(
            tableName,
            attributeName,
            dataTypeOrOptions,
            _.extend(_options, options)
          );
        }

        function createFunction() {
          throw new Error('createFunction() has not yet been implemented in queryInterface wrapper.');
        }

        function createTable(name, schema, options={}) {
          return _queryInterface.createTable(name, schema, _.extend(_options, options));
        }

        function dropFunction() {
          throw new Error('dropFunction() has not yet been implemented in queryInterface wrapper.');
        }

        function dropTable(tableName, options) {
          return _queryInterface.dropTable(tableName, _.extend(_options, options));
        }

        function removeColumn(tableName, attributeName, options) {
          return _queryInterface.removeColumn(
            tableName,
            attributeName,
            _.extend(_options, options)
          );
        }

        function removeConstraint(tableName, constraintName, options) {
          return _queryInterface.removeConstraint(
            tableName,
            constraintName,
            _.extend(_options, options)
          );
        }

        function removeIndex(tableName, indexNameOrAttributes, options) {
          return _queryInterface.removeIndex(
            tableName,
            indexNameOrAttributes,
            _.extend(_options, options)
          );
        }

        function renameColumn(tableName, attrNameBefore, attrNameAfter, options) {
          return _queryInterface.renameColumn(
            tableName,
            attrNameBefore,
            attrNameAfter,
            _.extend(_options, options)
          );
        }

        function renameFunction(oldFunctionName, params, newFunctionName, options) {
          throw new Error('renameFunction() has not yet been implemented in queryInterface wrapper.');
        }

        function renameTable(before, after, options) {
          return _queryInterface.renameTable(before, after, _.extend(_options, options));
        }

        function upsert() {
          throw new Error('upsert() has not yet been implemented in queryInterface wrapper.');
        }

        return {
          addColumn: addColumn,
          addConstraint: addConstraint,
          addIndex: addIndex,
          bulkDelete: bulkDelete,
          bulkInsert: bulkInsert,
          changeColumn: changeColumn,
          createFunction: createFunction,
          createTable: createTable,
          dropFunction: dropFunction,
          dropTable: dropTable,
          removeColumn: removeColumn,
          removeConstraint: removeConstraint,
          removeIndex: removeIndex,
          renameColumn: renameColumn,
          renameFunction: renameFunction,
          renameTable: renameTable,
          upsert: upsert
        };
      }

      // If promise chain resolves completely (including updating the migrations
      // table, then the transaction will be committed by sequelize automatically)
      await migrationFile['up'].apply(null, [
        getQueryInterface(schema, transaction),
        Sequelize.DataTypes
      ]);

      await options.migrationsTable.create({ filename }, { transaction });
    })
  }
}

process.on('message', args => {
  const schema = args.schema;
  const direction = args.direction;

  setup(RequireConfig).then(async options => {
    const isPublicHandler = options.config.publicSchemaDisplayName === schema;

    // Creates public migration table if that doesn't exist
    if (isPublicHandler) {
      options.migrationsTable = MigrationsTable(options.sequelize, options.config.migrationsTableName, null);
      await options.sequelize.sync();
    } else {
      options.migrationsTable = MigrationsTable(options.sequelize, options.config.migrationsTableName, schema);
    }

    // NOTE: The child process steps through each migration sequentially and throws an
    // error to the parent if any of the migrations fail. This should immediately kill
    // all other children and rollback the migrations they were working on.
    eachSeries(options.migrations, function(filename, callback) {
      process.send({ currentMigration: filename });

      const isTenantFile = filename.indexOf('tenant') === 0;
      const isPublicFile = filename.indexOf('public') === 0;

      if (!isTenantFile && !isPublicFile) {
        return callback(new Error('Migration filenames must start with "public" or "tenant"'));
      }

      if ((isTenantFile && !isPublicHandler) || (isPublicFile && isPublicHandler)) {
        const fullpath = path.join(process.cwd(), options.config.migrationsDirectory, filename);
        const migrationFile = require(fullpath);

        runAndSaveOneMigrationAsTransaction(filename, options, schema)
          .then(() => callback(null, true))
          .catch(err => callback(err));
      } else {
        callback(null, true);
      }
    }, function(err) {
      if (err) {
        const error = {
          message: err.message,
          stack: err.stack
        };
        process.send({ error });
      } else {
        process.send({ currentMigration: 'done' });
        process.exit(0);
      }
    });
  });
});
