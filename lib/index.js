'use strict';

const shortid = require('shortid');
const co = require('co');
const validate = require('./validate');
const providers = require('./providers');

class Sqr {

  /**
   * Create a new Sqr instance
   * @param {string} providerName - provider name, refer to list of available providers
   * @param {object} options - object of parameters
   * @param {object} options.provider - provider configuration, refer to provider's doc
   */
  constructor(providerName, options) {
    const self = this;
    if (typeof providerName !== 'string') {
      throw new Error('Missing provider name');
    }
    if ( !(providerName in providers) ) {
      throw new Error('Unknown provider "' + providerName + '"');
    }
    const name = shortid.generate();
    const o = validate(options, {
      provider: {
        optional: true,
        type: 'object',
        defaultTo: {},
      }
    });

    self.clients = {};
    self.provider = new providers[providerName](o.provider);
    try {
      self.provider.on('reconnected', self._onReconnect.bind(self));
    } catch (e) {
      console.log(`SQR => Warning: provider ${providerName} doesn't provide on.reconnected event`);
    }
  }

  /**
   * Private: Execute an SQR method after parameters validation, ensures a common response pattern
   * @param {object} o - object of parameters
   * @param {string} o.method - SQR method name
   * @param {object} o.params - SQR method parameters
   * @param {object} o.pattern - SQR method parameters validation pattern
   * @return {object} - promise
   */
  _exec(o) {
    const self = this;
    return new Promise((resolve, reject) => {
      co(function* () {
        // validate common params for all providers
        o.params = validate(o.params, o.pattern);
        // get connection instance from provider
        const connection = yield self.provider.connect();
        // get method result from provider
        const result = yield self.provider[o.method](connection, o.params);
        // save consumer/subscriber for recovery
        if (o.method === 'consume' || o.method === 'subscribe') {
          o.params._uid = shortid.generate();
          self.clients[o.params._uid] = {
            method: o.method,
            params: o.params,
          };
          console.log('SQR => Registered new client with uid ' + o.params._uid);
        }
        resolve({result: result, params: o.params});
      })
      .catch(function (err) {
        // reject if params validate error
        // TODO improve this test
        if (typeof err === 'object' && 'message' in err && err.message.indexOf('validate module => ') === 0) {
          return reject(err.message);
        }
        reject(err);
      });
    });
  }

  /**
   * Private: starts recovery after provider reconnection
   */
  _onReconnect() {
    console.log('SQR => Provider has been reconnected');
    this._reconnectClients();
  }

  /**
   * Private: reconnect consumers/subscribers after provider's reconnection
   */
  _reconnectClients() {
    const self = this;
    const keys = Object.keys(self.clients);
    const L = keys.length;
    if (L === 0) {
      console.log('SQR => No clients detected');
    } else {
      console.log(`SQR => ${L} client(s) detected, reconnecting them...`);
      for (let i = 0; i < L; i++) {
        const e = self.clients[keys[i]];
        self[e.method](e.params)
          .then((data) => {
            console.log('SQR => Reconnected Client with uid ', data.params._uid);
            delete self.clients[data.params._uid];
          })
          .catch((err) => {
            console.error('SQR => Can\'t reconnect Client with uid ' + data.params._uid, err);
          });
      }
    }
  }

  /**
   * Produce a message in a queue
   * @param {object} params - object parameters
   * @param {string} params.queue - the queue name where to produce the message
   * @param {object} params.json - the message to produce as json
   * @param {object} params.extra - provider's extra parameters
   * @return {object} - promise
   */
  produce(params) {
    return this._exec({
      method: 'produce',
      params: params,
      pattern: {
        queue: 'string',
        json: 'object',
        extra: {
          optional: true,
          type: 'object',
          defaultTo: {},
        },
      },
    });
  }

  /**
   * Consume a message from a queue
   * @param {object} params - object parameters
   * @param {string} params.queue - the queue name where to produce the message
   * @param {function} params.cb - callback function to run after consuming a message, should return a promise
   * @param {object} params.extra - provider's extra parameters
   * @return {object} - promise
   */
  consume(params) {
    return this._exec({
      method: 'consume',
      params: params,
      pattern: {
        queue: 'string',
        cb: 'function',
        extra: {
          optional: true,
          type: 'object',
          defaultTo: {},
        },
      },
    });
  }

  /**
   * Publish a message to a chanel
   * @param {object} params - object parameters
   * @param {string} params.key - the chanel key name where to publish the message
   * @param {object} params.json - the message to publish in json format
   * @param {object} params.extra - provider's extra parameters
   * @return {object} - promise
   */
  publish(params) {
    return this._exec({
      method: 'publish',
      params: params,
      pattern: {
        key: 'string',
        json: 'object',
        extra: {
          optional: true,
          type: 'object',
          defaultTo: {},
        },
      },
    });
  }

  /**
   * Subscribe to messages from a chanel
   * @param {object} params - object parameters
   * @param {string} params.key - the chanel key name where to listen to messages
   * @param {function} params.cb - callback function to run after receiving a message
   * @param {object} params.extra - provider's extra parameters
   * @return {object} - promise
   */
  subscribe(params) {
    return this._exec({
      method: 'subscribe',
      params: params,
      pattern: {
        key: 'string',
        cb: 'function',
        extra: {
          optional: true,
          type: 'object',
          defaultTo: {},
        },
      },
    });
  }

}

exports = module.exports = Sqr;
