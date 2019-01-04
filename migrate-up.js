const _ = require('underscore');
const AsyncLock = require('async-lock');
const colors = require('colors');
const Sequelize = require('sequelize');
const path = require('path');
const ProgressBar = require('ascii-progress');
const clear = require('clear');
const fork = require('child_process').fork;

const Options = require('./models/Options');
const CHILD_PATH = path.join(__dirname, './workers/MigrationWorker');

const MAX_PARALLEL_WORKERS = 5;
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

const DEVELOPER_WARNING = `
Hopefully you've seen the warning in the README file: This code is in active
development and there may be unforseen issues. That said, I'd be delighted
to have you join me in developing this library!

If you do find an issue, please go over to the github page and open one formally.
I'll do my best to respond as soon as possible.

https://github.com/rkotcherr/multi-tenant-migrate/issues
`;

// Parse command line arguments to pass to Options.load
const args = process.argv
  .slice(2)
  .map(arg => arg.split('='))
  .reduce((args, [value, key]) => {
    args[value] = key;
    return args;
  }, {});

function setGeneralError(err) {
  console.error(new Error(err));
  process.exit(1);
}

Options.load(args, async (err, options) => {
  err && setGeneralError(err);

  const managerPool = [];

  // Check the pool of managers for the first pending one and run it. We
  // could actually end up here if there are no pending workers but all haven't
  // finished because up to MAX_PARALLEL_WORKERS workers could be finishing their
  // migrations. Because of that we need to check for pending managers.
  function runNextPendingManager() {
    lock.acquire(RESOURCE_KEY, function(done) {
      const pendingMigrationManagers = _.reject(managerPool, manager => {
        return manager.getState() !== CHILD_STATES.PENDING;
      });

      if (pendingMigrationManagers.length > 0) {
        pendingMigrationManagers[0].setState(CHILD_STATES.RUNNING);
        pendingMigrationManagers[0].forkMigrationWorker();
      }

      done();
    });
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

    function setErrorOnProgressBar() {
      bar.setSchema(':id ╢:bar.red╟ :current/:total :percent :elapseds',);
      const errorId = tenant.schema + ':' + currentMigrationId + '-'.repeat(100);
      bar.tick(0, { id: errorId.substr(0, 36) });
    }

    // Forks a child, starts the migrations
    function forkMigrationWorker() {
      child = fork(CHILD_PATH, process.argv);
      child.send({ schema: tenant.schema, direction: 'up' });

      // A child migration worker messages its parent (this process) if there is
      // an error, or if there is a new migration file being worked on.
      child.on('message', message => {
        if (message.error) {
          console.log(`Error from child migration: ${ message.error.message }`.underline.yellow);
          setErrorOnProgressBar();
          setGeneralError(message.error);
        } else {
          setCurrentMigration(message.currentMigration);
        }
      });

      // When a child exists, set it in a complete state, and then check to see
      // if all managers have finished. If not, runNextPendingManager().
      child.on('exit', () => {
        state = CHILD_STATES.COMPLETE;

        const allHaveCompleted = _.every(managerPool, manager => {
          return manager.getState() === CHILD_STATES.COMPLETE;
        });

        if (!allHaveCompleted) {
          runNextPendingManager();
        } else {
          process.exit(0);
        }
      });
    }

    function kill() {
      child.kill();
    }

    function getState() {
      return state;
    }

    function setState(newState) {
      state = newState;
    }

    return {
      getName: () => tenant.schema,
      forkMigrationWorker: forkMigrationWorker,
      kill: kill,
      getState: getState,
      setState: setState
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
  console.log(DEVELOPER_WARNING.underline.red);

  tenants.forEach(tenant => managerPool.push(getTenantManager(tenant)));

  // Start migrations on first MAX_PARALLEL_WORKERS workers. When they finish, the
  // pool will be checked for more pending workers.
  _.first(managerPool, MAX_PARALLEL_WORKERS).forEach(manager => manager.forkMigrationWorker());
});
