const _ = require('underscore');
const AsyncLock = require('async-lock');
const Sequelize = require('sequelize');
const path = require('path');
const ProgressBar = require('ascii-progress');
const clear = require('clear');
const fork = require('child_process').fork;

const Options = require('./models/Options');
const CHILD_PATH = path.join(__dirname, './workers/MigrationWorker');

const MAX_PARALLEL_WORKERS = 3;
const RESOURCE_KEY = '1546470477261';

const lock = new AsyncLock();

const progressOptions = {
  tough: true,
  schema: ':id ╢:bar╟ :current/:total :percent :elapseds',
  blank: '░',
  filled: '█'
};

const CHILD_STATES = {
  PENDING: 1,
  RUNNING: 2,
  COMPLETE: 3
};

// Parse command line arguments to pass to Options.load
const args = process.argv
  .slice(2)
  .map(arg => arg.split('='))
  .reduce((args, [value, key]) => {
    args[value] = key;
    return args;
  }, {});

function onError(err) {
  throw new Error(err);
  process.exit(1);
}

Options.load(args, async (err, options) => {
  err && onError(err);

  const managerPool = [];

  // Check the pool of managers for the first pending one and run it.
  function runNextPendingManager() {
    lock.acquire(RESOURCE_KEY, function(done) {
      const pendingMigrationManagers = _.reject(managerPool, manager => {
        return manager.getState() !== CHILD_STATES.PENDING;
      });

      if (pendingMigrationManagers.length === 0) {
        process.exit(0);
      } else {
        pendingMigrationManagers[0].runMigrations();
        setTimeout(() => done(), 100);
      }
    }, err => err && onError(err));
  }

  // The tenant manager is a closure that encapsulates a child migration worker
  // and the progress bar that displays its progress. There is one for each tenant and
  // one for the migrating the public schema.
  function getTenantManager(tenant) {
    let child = null;
    let currentMigrationId = null;

    let state = CHILD_STATES.PENDING;

    // There are 2 more progress bar positions than the number of migrations.
    // One for "pending", and one for "completed".
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
    setCurrentMigration('pending' + '-'.repeat(100));

    function setError() {
      bar.setSchema(':id ╢:bar.red╟ :current/:total :percent :elapseds',);
      const errorId = tenant.schema + ':' + currentMigrationId + '-'.repeat(100);
      bar.tick(0, { id: errorId.substr(0, 36) });
    }

    // Forks a child, starts the migrations
    function runMigrations() {
      state = CHILD_STATES.RUNNING;

      child = fork(CHILD_PATH, process.argv);
      child.send({ schema: tenant.schema, direction: 'up' });

      child.on('message', message => {
        if (message.error) {
          setError();

          // Kill all children
          managerPool.forEach(tenantManager => tenantManager.kill());

          // Display the entire error to the user.
          throw new Error(message.error);
        } else {
          setCurrentMigration(message.currentMigration);
        }
      });

      child.on('exit', () => {
        state = CHILD_STATES.COMPLETE;
        runNextPendingManager();
      });
    }

    function kill() {
      child.kill();
    }

    // For some reason, even after child processes exit the parent thread continues
    // running. Ideally it would just end, but for now, on each exit we'll just check
    // to see if all others have finished, and if so, kill the parent process.
    function getState() {
      return state;
    }

    return {
      getName: () => tenant.schema,
      runMigrations: runMigrations,
      kill: kill,
      getState: getState,
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

  // Start migrations on first MAX_PARALLEL_WORKERS workers. When they finish, the
  // pool will be checked for more pending workers.
  _.first(managerPool, MAX_PARALLEL_WORKERS).forEach(manager => manager.runMigrations());
});
