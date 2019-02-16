const Sequelize = require('sequelize');
const Schema = require('validate');
const path = require('path');
const uuid = require('uuidv4');

const ConfigFileFormat = require('./schemas/ConfigFileFormat');
const MapperTable = require('./models/MapperTable');
const MigrationsTable = require('./models/MigrationsTable');

const Arguments = new Schema({
  domain: { required: true, message: 'Missing argument "domain=<String>"' },
  name: { required: true, message: 'Missing argument "name=<String>"' },
  schema: { required: true, message: 'Missing argument "schema=<String>"' },
  config: { required: true, message: 'Missing argument "config=<String>"' }
});

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

try {
  const config = require(path.join(process.cwd(), args.config));

  const configErrors = ConfigFileFormat.validate(config);
  if (configErrors.length > 0) {
    console.log(configErrors[0].message);
    process.exit(1);
  }

  // Connect to database
  const sequelize = new Sequelize(
    config.dbName,
    config.dbUser,
    config.dbPassword,
    {
      host: config.dbHost,
      dialect: 'postgres',
      port: config.dbPort
    }
  );

  const mapperTable = MapperTable(sequelize, config.tenantMapperTableName);
  const migrationsTable = MigrationsTable(sequelize, config.migrationsTableName, args.schema);

  async function createTables() {
    await sequelize.queryInterface.createSchema(args.schema);

    await sequelize.sync();

    await mapperTable.create({
      id: uuid(),
      domain: args.domain,
      name: args.name,
      schema: args.schema,
    });
  }

  createTables().then(() => process.exit(0));

} catch (e) {
  console.log(e);
  process.exit(1);
}
