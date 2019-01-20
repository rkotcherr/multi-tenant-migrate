⚠️ ⚠️ ⚠️
**This library is currently in active development. You could probably use it in your project, but there are clear feature gaps at the moment. I don't have a ton of free time, so pull requests are very welcome!**
⚠️ ⚠️ ⚠️

# What is multi-tenancy?

There are many ways to separate your tenants' data, ranging from strong physical isolation to purely logical isolation. This library supports a middleground solution, that is, schema-based separation. It only supports schema management; as such, you can use this with applications written in any lanugage.

# Why multi-tenant-migrate?

`multi-tenant-migrate` (MTM) is an opinionated framework for managing multi-tenant schemas and migrations. As far as I'm aware, it's the only library written in Node.js that does what it does.

This library is inspired by, but still clearly currently inferior to Django's powerful migration system. Under the hood, it uses [Sequelize](http://docs.sequelizejs.com/) to open database connections, express schema definitions, and perform transactions.

Because it is schema-based, you must currently be using a Postgres database. I am not familiar with every database, but am open to supporting other databases where relevant.

# Setup

Refer to the following directory structure throught these docs:

```
~/migrations
~/migrations/tenant:1546110701000-create-table-A.js
~/migrations/tenant:1546110702000-some-other-description.js
~/migrations/public:1546110703000-create-a-thing-C.js
~/node_modules/multi-tenant-migrate/...
~/tenants-config.js
```

**migrations/:** Contains public and tenant-specific migrations. All migration files prefixed with `tenant:` will be run on all tenants added via the "create" command. `public:` migrations are performed on the public schema. After this prefix, I personall typically add the UNIX timestamp since migrations are loaded in alphabetical order, within their namespace. I also like to add something descriptive after the timestamp.

The name of this directory can be set in the config.

One of the migration files in `/migrations` might look something like this:

```
// NOTE: Everything that happens within these functions occur on the same transaction.
// You can read more about the parameters in the MigrationWorker file in the repo
async function up(queryInterface, DataTypes) {
  await queryInterface.createTable('test_table', {
    id: { type: DataTypes.INTEGER },
    createdAt: { allowNull: false, type: DataTypes.DATE },
    updatedAt: { allowNull: false, type: DataTypes.DATE }
  });
}

async function down(...) {
  // down is not currently implemented.
  // ideally down would also let you specify steps=S and schema=X
}

module.exports = {
  up,
  down
}

```

**Note that there is nothing in the migration that says anything about which schema is being migrated. The queryInterface is already connected to the schema being migrated.**

You can read more about the queryInterface functions [here](http://docs.sequelizejs.com/class/lib/query-interface.js~QueryInterface.html). We're using this because under the hood we're working with the database using the amazing library [Sequelize](http://docs.sequelizejs.com/). The relevant functions are available. Obviously things like `createSchema` are irrelevant.

**node_modules/multi-tenant-migrate/:** You'll probably install this with `npm` or `yarn`

**tenants-config.js:** The config file is described in more detail below.

The config file contains information about how to connect to your database amongst other things. Here's a complete config file:

```
{
  "dbUser": "<user>",
  "dbPassword": "",
  "dbName": "dummy",
  "dbHost": "localhost",
  "dbPort": "5432",

  "tenantMapperTableName": "tenants",
  "publicSchemaDisplayName": "*PUBLIC",

  "migrationsDirectory": "./migrations",
  "migrationsTableName": "migrations"
}

```

The final step is to make sure the database exists. `createdb <dbname>` should do the trick.

Now that you're setup, you can use `multi-tenant-migrate`:

# Commands

**create.js**: Creates a new tenant.

`node ./node_modules/multi-tenant-migrate/create.js config=<STRING> schema=<STRING> domain=<STRING>`

Specifically, the above command:
  1. Adds this tenant to "public"."tenantMapperTableName"
  2. Creates the schema in the database
  3. Create "<schema>"."migrationsTableName"

**migrate-up.js**: For every schema in the mapper table, runs all outstanding tenant:* migrations (in alphabetical order). For the public schema, runs all outstanding public:* migrations.

`node ./node_modules/multi-tenant-migrate/migrate-up.js config=<STRING>`

![Running a migration](https://i.imgur.com/5n6wSZJ.png)
_A sample migration: all tenants have been migrated and the public schema is completing step 4 of 6._

# Accessing the Mapper from application

You may want to import the MapperTable model from your application. You can do this via:

```
import { MapperTable } from 'multi-tenant-migrate';
```

or

```
const MapperTable = require('multi-tenant-migrate').MapperTable;
```

From there, you may want to use the `req.headers.host` to do lookup in this table.


# Feature wish-list:
1. Migrate down (and optionally specify a tenant and number of steps)
2. Migrate status (visualize which step each tenant is currently at)
3. Tests! Tests! Tests!
4. Support more databases?
