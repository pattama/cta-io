'use strict';

const shortid = require('shortid');
const amqp = require('amqplib/callback_api');
const validate = require('../../validate/');

const config = {};

const tools = {
  /**
   * Execute a callback function after parameters validation
   * @param {object} params - object parameters
   * @param {object} pattern - validation pattern for params
   * @param {function} cb - callback function that accepts 2 params: ch (rabbitMQ channel) & conn (rabbitMQ connection)
   * @return {object} - promise
   */
  exec: function(params, pattern, cb) {
    params.extra = validate(params.extra, pattern);
    return new Promise((resolve, reject) => {
      amqp.connect(config.url, function(connErr, conn) {
        if (connErr) {
          reject(connErr);
        } else {
          conn.createChannel(function(chErr, ch) {
            if (chErr) {
              reject(chErr);
            } else {
              cb(ch, conn, params)
                .then(function(data) {
                  resolve(data);
                }, function(err) {
                  reject(err);
                });
            }
          });
        }
      });
    });
  },

  /**
   * Convert buffer to json
   * @param {buffer} buffer - the buffer to convert
   * @return {object} - the converted buffer as json
   */
  bufferToJSON: function(buffer) {
    return JSON.parse(buffer.toString());
  },

  /**
   * Convert json to buffer
   * @param {object} - the json to convert
   * @return {object} buffer - the converted json as buffer
   */
  jsonToBuffer: function(json) {
    return new Buffer(JSON.stringify(json));
  },
};

class RQProvider {
  /**
   * Create a new RQProvider instance
   * @param {object} params - object parameters
   * @param {string} params.url - rabbitMQ host
   */
  constructor(params) {
    config.url = (typeof params === 'object' && 'url' in params) ? params.url : 'amqp://localhost';
    this.silo = {};
  }

  /**
   * Produce a message in a queue
   * @param {object} params - object parameters
   * @param {string} params.queue - the queue name where to produce the message
   * @param {object} params.json - the message to produce as json
   * @param {object} params.extra - rabbitMQ extra parameters
   * @param {boolean} params.extra.mq_persistent - rabbitMQ durable parameter
   * @param {boolean} params.extra.mq_durable - rabbitMQ persistent parameter
   * @return {object} - promise
   */
  produce(params) {
    const pattern = {
      mq_persistent: {
        optional: true,
        type: 'boolean',
        defaultTo: true,
      },
      mq_durable: {
        optional: true,
        type: 'boolean',
        defaultTo: true,
      },
    };

    function cb(ch, conn, input) {
      return new Promise((resolve, reject) => {
        try {
          ch.assertQueue(input.queue, {durable: input.extra.mq_durable});
          ch.sendToQueue(input.queue, tools.jsonToBuffer(input.json), {persistent: input.extra.mq_persistent});
          console.log('RabbitMQProvider => Produced new message: ', input.json);
          setTimeout(function() {
            conn.close();
            resolve();
          }, 500);
        } catch (e) {
          reject('RabbitMQProvider => ', e);
        }
      });
    }

    return tools.exec(params, pattern, cb);
  }

  /**
   * Consume a message from a queue
   * @param {object} params - object parameters
   * @param {string} params.queue - the queue name where to produce the message
   * @param {function} params.cb - callback function to run after consuming a message
   * @param {object} params.extra - rabbitMQ extra parameters
   * @param {boolean} params.extra.mq_noAck - rabbitMQ noAck parameter
   * @param {boolean} params.extra.mq_prefetch - rabbitMQ prefetch parameter
   * @param {boolean} params.extra.mq_durable - rabbitMQ durable parameter
   * @return {object} - promise
   */
  consume(params) {
    const pattern = {
      mq_noAck: {
        optional: true,
        type: 'boolean',
        defaultTo: false,
      },
      mq_prefetch: {
        optional: true,
        type: 'number',
        defaultTo: 1,
      },
      mq_durable: {
        optional: true,
        type: 'boolean',
        defaultTo: true,
      },
    };

    function cb(ch, conn, input) {
      return new Promise((resolve, reject) => {
        ch.assertQueue(input.queue, {durable: input.extra.mq_durable});
        ch.prefetch(input.extra.mq_prefetch);
        console.log('RabbitMQProvider => Waiting for messages in queue "%s"', input.queue);
        ch.consume(input.queue, function (msg) {
          const json = tools.bufferToJSON(msg.content);
          input.cb(json)
            .then(function(data) {
              ch.ack(msg);
              resolve(data);
            }, function(err) {
              reject(err);
            });
        }, {noAck: false}); // input.extra.mq_noAck
      });
    }

    return tools.exec(params, pattern, cb);
  }

  /**
   * Publish a message to a chanel
   * @param {object} params - object parameters
   * @param {string} params.key - the chanel key name where to publish the message
   * @param {object} params.json - the message to publish in json format
   * @param {object} params.extra - rabbitMQ extra parameters
   * @param {boolean} params.extra.mq_ex_name - rabbitMQ exchange name
   * @param {boolean} params.extra.mq_ex_type - rabbitMQ exchange type
   * @param {boolean} params.extra.mq_durable - rabbitMQ durable parameter
   * @return {object} - promise
   */
  publish(params) {
    const self = this;
    const pattern = {
      mq_ex_name: {
        optional: true,
        type: 'string',
        defaultTo: 'default',
      },
      mq_ex_type: {
        optional: true,
        type: 'string',
        defaultTo: 'topic',
      },
      mq_durable: {
        optional: true,
        type: 'boolean',
        defaultTo: false,
      },
    };

    function cb(ch, conn, input) {
      return new Promise((resolve) => {
        ch.assertExchange(input.extra.mq_ex_name, input.extra.mq_ex_type, {durable: input.extra.mq_durable});
        ch.publish(input.extra.mq_ex_name, input.key, tools.jsonToBuffer(input.json));
        console.log('RabbitMQProvider => Published new message: ', input.json);
        setTimeout(function() {
          conn.close();
          resolve();
        }, 500);
      });
    }

    return tools.exec(params, pattern, cb)
      .catch(function(err) {
        console.error(err);
        const uid = shortid.generate();
        self.silo[uid] = {
          method: 'publish',
          params: params,
        };
      });
  }

  /**
   * Subscribe to messages from a chanel
   * @param {object} params - object parameters
   * @param {string} params.key - the chanel key name where to listen to messages
   * @param {function} params.cb - callback function to run after receiving a message, it takes the received json msg as a param
   * @param {object} params.extra - rabbitMQ extra parameters
   * @param {boolean} params.extra.mq_ex_name - rabbitMQ exchange name
   * @param {boolean} params.extra.mq_ex_type - rabbitMQ exchange type
   * @param {boolean} params.extra.mq_durable - rabbitMQ durable parameter
   * @return {object} - promise
   */
  subscribe(params) {
    const pattern = {
      mq_ex_name: {
        optional: true,
        type: 'string',
        defaultTo: 'default',
      },
      mq_ex_type: {
        optional: true,
        type: 'string',
        defaultTo: 'topic',
      },
      mq_durable: {
        optional: true,
        type: 'boolean',
        defaultTo: false,
      },
    };

    function cb(ch, conn, input) {
      return new Promise((resolve) => {
        ch.assertExchange(input.extra.mq_ex_name, input.extra.mq_ex_type, {durable: input.extra.mq_durable});
        ch.assertQueue('', {exclusive: true}, function(err, queue) {
          console.log('RabbitMQProvider => Subscribed, waiting for messages...');
          ch.bindQueue(queue.queue, input.extra.mq_ex_name, input.key);
          ch.consume(queue.queue, function(msg) {
            const json = tools.bufferToJSON(msg.content);
            console.log('RabbitMQProvider => Consuming new message: ', json);
            input.cb(json);
          }, {noAck: true});
          resolve();
        });
      });
    }

    return tools.exec(params, pattern, cb);
  }

}

exports = module.exports = RQProvider;
