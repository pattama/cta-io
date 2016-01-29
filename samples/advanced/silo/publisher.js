'use strict';

const SqrLib = require('../../../lib');
const scheduler = require('node-schedule');
const util = require('util');

const data = require('./_data');
const messages = data();

const config = {
  cron: '*/1 * * * * *', // cron syntax for the producer to produce jobs
  current: -1,
};

const provider = process.argv.slice(2).join() || 'rabbitmq';
console.log('Using provider "' + provider + '"');

const sqr = new SqrLib(provider);

function doSchedule() {
  config.current++;
  if (config.current > messages.length - 1) {
    console.log('No more messages to publish');
    config.j.cancel();
    return;
  }

  sqr.publish({
    key: 'test_key',
    json: {
      key: messages[config.current],
    },
  }).then(function(response) {
    // console.log('response:', response);
  }, function(err) {
    console.error('Publisher error: ');
    console.error(util.inspect(err, {depth: 5}));
    /*config.j.cancel();
    setTimeout(function() {
      process.exit(0);
    }, 500);*/
  });
}

config.j = scheduler.scheduleJob(config.cron, function() {
  doSchedule();
});