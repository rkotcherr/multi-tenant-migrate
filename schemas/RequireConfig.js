const Schema = require('validate');

// This required because it's used both in parent and child.
module.exports = new Schema({
  config: { required: true, message: 'Missing argument "config=<String>"' }
});
