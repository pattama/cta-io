'use strict';

// produce message
const IoLib = require('../../lib');

const provider = process.argv.slice(2).join() || 'rabbitmq';
console.log('Using provider "' + provider + '"');

const io = new IoLib(provider);

io.produce({
  queue: 'test',
  json: {
    job: 'run command',
    cmd: 'ls',
  },
}).then(function(response) {
  console.log('response: ', response);
}, function(err) {
  console.error('error: ', err);
});
