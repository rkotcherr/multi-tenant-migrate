const _ = require('underscore');
const Sequelize = require('sequelize');
const path = require('path');
const ProgressBar = require('ascii-progress');
const clear = require('clear');
const fork = require('child_process').fork;

const Options = require('./models/Options');
const CHILD_PATH = path.join(__dirname, './workers/MigrationWorker');

const progressOptions = {
  tough: true,
  schema: ':id ╢:bar╟ :current/:total :percent :elapseds',
  blank: '░',
  filled: '█'
};

// Parse command line arguments to pass to Options.load
const args = process.argv
  .slice(2)
  .map(arg => arg.split('='))
  .reduce((args, [value, key]) => {
    args[value] = key;
    return args;
  }, {});

Options.load(args, async (err, options) => {
  if (err) {
    console.log(err);
    exit(1);
  }

  const managerPool = [];

  // The tenant manager is a closure that encapsulates a child migration worker
  // and the progress bar that displays its progress. There is one for each tenant and
  // one for the migrating the public schema.
  function getTenantManager(tenant) {
    let child = null;
    let currentMigrationId = null;
    let exited = false;

    // There are 2 more progress bar positions than the number of migrations.
    // One for "initializing", and one for "done".
    const bar = new ProgressBar(_.extend(progressOptions, {
      total: options.migrations.length + 2
    }));

    // Called every time this schema advances to the next step
    function setCurrentMigration(migrationId) {
      currentMigrationId = migrationId;
      const nextId = tenant.schema + ':' + migrationId + '-'.repeat(100);
      bar.tick(1, { id: nextId.substr(0, 36) });
    }

    // Set this so everything immediately goes to the top. (The remaining "-'s are truncated.)
    setCurrentMigration('initializing' + '-'.repeat(100));

    function setError() {
      bar.setSchema(':id ╢:bar.red╟ :current/:total :percent :elapseds',);
      const errorId = tenant.schema + ':' + currentMigrationId + '-'.repeat(100);
      bar.tick(0, { id: errorId.substr(0, 36) });
    }

    // Forks a child, starts the migrations
    function runMigrations() {
      child = fork(CHILD_PATH, process.argv);
      child.send({ schema: tenant.schema, direction: 'up' });
      child.on('message', message => {
        if (message.error) {
          setError();

          // Kill all children
          managerPool.forEach(tenantManager => tenantManager.kill());

          // Display the entire error to the user.
          console.log();
          console.log(message.error);
          console.log();
        } else {
          setCurrentMigration(message.currentMigration);
        }
      });

      child.on('exit', () => {
        exited = true;

        if (_.every(managerPool, tenantManager => !tenantManager.isRunning())) {
          process.exit(0);
        }
      });
    }

    function kill() {
      child.kill();
    }

    // For some reason, even after child processes exit the parent thread continues
    // running. Ideally it would just end, but for now, on each exit we'll just check
    // to see if all others have finished, and if so, kill the parent process.
    function isRunning() {
      return !exited;
    }

    return {
      getName: () => tenant.schema,
      runMigrations: runMigrations,
      kill: kill,
      isRunning: isRunning
    }
  }

  const tenants = await options.sequelize.models.tenants.findAll({ raw: true });
  tenants.unshift({
    id: 0,
    schema: options.config.publicSchemaDisplayName,
    domain: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  clear();
  tenants.forEach(tenant => managerPool.push(getTenantManager(tenant)));
  managerPool.forEach(tenantManager => tenantManager.runMigrations());
});
