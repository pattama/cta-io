'use strict';

// subscribe to events
const SqrLib = require('../../lib');

const provider = process.argv.slice(2).join() || 'rabbitmq';
console.log('Using provider "' + provider + '"');
const sqr = new SqrLib(provider);

function cb(json) {
  return new Promise((resolve) => {
    console.log('\nReceived new message: ', json);
    resolve();
  });
}

sqr.subscribe({
  key: 'test_key',
  cb: cb,
}).then(function() {
  console.log('\nSubscribed');
}, function(err) {
  console.error('\nCan\'t subscribe: ', err);
});
