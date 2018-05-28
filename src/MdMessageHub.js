import NATS from 'nats'
import log from './logger'
import MdUtils from './MdUtils'
import os from 'os'

const MSGHUB_TIMEOUT = process.env.MSGHUB_TIMEOUT || 1000

export default class MdMessageHub {
  constructor(msgHubId, clientType) {
    this.msgHubId = msgHubId;
    this.clientId = clientType;
  }

  connect(msgServer) {
    return new Promise((resolve, reject) => {
      this.nats = NATS.connect(msgServer)
      this.nats.on('error', err => {
        log.error(err.message)
        reject(err);
      });
      this.nats.on('connect', err => {
        log.info('Connected to NATS ' + (msgServer ? msgServer : 'nats://localhost:4444'));
        this.nats.subscribe(this.msgHubId + '', ::this.broadcastReceiveHandler);
        this.nats.subscribe(this.msgHubId + '.' + this.clientId, ::this.messageReceiveHandler);
        log.info('Subscribed to queue ' + this.msgHubId + '.' + this.clientId);
        resolve();
      })
    })
  }

  disconnect() {
    this.nats.close();
    log.info('Disconnected from NATS');
  }

  broadcastReceiveHandler(msg, reply, subject) {
    log.debug('Broadcast to ' + subject + ': ' + msg);
  }

  messageReceiveHandler(msg, reply, subject) {
    log.debug('Message to ' + subject + ': ' + msg);
  }

  expose(method) {
    if (!method || typeof(method) !== 'function') {
      throw new Error('Expose needs to be provided a function object')
    }
    var endpoint = [this.msgHubId, this.clientId, MdUtils.getFunctionName(method)].join('.')

    let handlerArguments = MdUtils.getFunctionParameters(method);
    log.info(`Exposing ${endpoint}(${handlerArguments.join(', ')})`)

    this.nats.subscribe(endpoint, {queue: 'workers'}, (request, replyTo) => {
      let parameters = JSON.parse(request);

      var response = {};
      try {
        response = {
          err: 0,
          result: method.apply(this, parameters),
          from: os.hostname()
        }
      } catch (err) {
        log.error(err);
        response = {
          err: 1,
          message: err.message
        }
      }
      this.nats.publish(replyTo, JSON.stringify(response));
    })
  }

  invoke(endpoint, ...parameters) {
    if (this.invokePathPrefix) {
      endpoint = this.invokePathPrefix + endpoint
    }
    return new Promise((resolve, reject) => {
      this.nats.requestOne(endpoint, JSON.stringify(parameters), {max: 1}, MSGHUB_TIMEOUT, (response) => {
        var parsed;

        // Timeout problem
        if (response instanceof NATS.NatsError && response.code === NATS.REQ_TIMEOUT) {
          reject(new Error(`Invoke error: ${endpoint} timed out`));
          return
        }

        // Parsing problem
        try {
          parsed = JSON.parse(response);
        } catch (err) {
          reject(new Error(`Invoke error: ${endpoint} response not parsable`));
          return
        }

        // Remote problem
        if (parsed.err) {
          reject(new Error(`Invoke error: ${endpoint} responded with error: ${parsed.message}` || 'unknown error'));
          return
        }

        // All ok
        resolve(parsed.result);
      });
    });
  }

  setInvokePrefix(invokePathPrefix) {
    this.invokePathPrefix = invokePathPrefix

  }
}
