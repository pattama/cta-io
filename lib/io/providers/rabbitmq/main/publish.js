'use strict';

/**
 * Publish a message to a chanel
 * @param {object} params - object parameters
 * @param {string} params.queue - the chanel key name where to publish the message
 * @param {object} params.json - the message to publish in json format
 * @param {object} that - reference to main class
 * @return {object} - promise
 */

module.exports = function publish(params, that) {
  return {
    params: params,
    pattern: {
      queue: 'string',
      json: 'object',
    },
    cb: (vp) => {
      return new Promise((resolve, reject) => {
        try {
          that.channel.assertExchange(vp.queue, 'fanout', {durable: true, autoDelete: false}, function(aErr, aData) {
            if (aErr) {
              return reject(aErr);
            }
            that.channel.publish(vp.queue, '', that._jsonToBuffer(vp.json), {persistent: true}, function(pErr) {
              if (pErr) {
                return reject(pErr);
              }
              that.logger.debug('Published new message: ', vp.json);
              resolve(aData);
            });
          });
        } catch (e) {
          reject(e);
        }
      });
    },
  };
};
