import NATS from 'nats'
import log from './logger'
import MdUtils from './MdUtils'
import os from 'os'
import ip from 'ip'
import uuid from 'uuid/v4'
import si from 'systeminformation'
const MSGHUB_TIMEOUT = process.env.MSGHUB_TIMEOUT || 1000

const CODE = {
  DISCONNECT: {code: 0, label: 'Disconnected'},
  CONNECT:    {code: 1, label: 'Connected'},
  INVOKE:     {code: 2, label: 'Invoked'},
  JOB:        {code: 3, label: 'Job started'},
  DONE:       {code: 4, label: 'Job done'},
  PONG:       {code: 5, label: 'Pong'}
}

export default class MdMessageHub {
  static CODE = CODE
  constructor(msgHubId, clientType) {
    this.msgHubId = msgHubId
    this.clientType = clientType
    this.clientId = uuid()
  }

  connect(msgServer) {
    log.debug('Connecting to NATS: ' + msgServer)
    return new Promise((resolve, reject) => {
      this.nats = NATS.connect(msgServer)
      this.nats.on('error', err => {
        log.error(err.message)
        reject(err);
      });
      this.nats.on('connect', err => {
        log.info('Connected to NATS ' + (msgServer ? msgServer : 'nats://localhost:4444'));
        this.nats.subscribe(this.msgHubId + '', ::this.broadcastReceiveHandler);
        this.nats.subscribe(this.msgHubId + '.' + this.clientType, ::this.messageReceiveHandler);
        log.info('Subscribed to queue ' + this.msgHubId + '.' + this.clientType);
        this.msgHubLog(CODE.CONNECT)
        this.registerServiceDiscovery()
        resolve();
      })
    })
  }

  registerServiceDiscovery() {
    // Listen for service discovery calls
    this.subscribe('mdPing', async (token) => {
      this.msgHubLog(CODE.PONG)
      const cpuData = await si.cpu()
      const memData = await si.mem()
      const loadData = await si.currentLoad()
      var info = {
        id: this.clientId,
        ip: ip.address(),
        type: this.clientType,
        cpuData: cpuData,
        memData: memData,
        loadData: loadData
      }
      this.publish(token, JSON.stringify(info))
    })
  }

  disconnect() {
    if (this.nats) {
      this.msgHubLog(CODE.DISCONNECT)
      this.nats.close();
      log.info('Disconnected from NATS');
    }

  }

  broadcastReceiveHandler(msg, reply, subject) {
    log.debug('Broadcast to ' + subject + ': ' + msg);
  }

  messageReceiveHandler(msg, reply, subject) {
    log.debug('Message to ' + subject + ': ' + msg);
  }

  publish(subject, message) {
    this.nats.publish(subject, message)
  }

  subscribe(subject, handler) {
    this.nats.subscribe(subject, handler)
  }

  subscribeQueue(subject, queue, handler) {
    this.nats.subscribe(subject, { queue: queue }, handler)
  }

  expose(method, overrideMethodName) {
    if (!method || typeof(method) !== 'function') {
      throw new Error('Expose needs to be provided a function object')
    }
    var endpoint = [this.msgHubId, this.clientType, overrideMethodName || MdUtils.getFunctionName(method)].join('.')
    let handlerArguments = MdUtils.getFunctionParameters(method);
    log.info(`Exposing ${endpoint}(${handlerArguments.join(', ')})`)

    this.subscribeQueue(endpoint, 'workers', (request, replyTo) => {
      let parameters = JSON.parse(request);
      var response = {};
      this.msgHubLog(CODE.INVOKE)
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
      this.msgHubLog(CODE.DONE)
    })
  }

  exposeJob(method) {
    var methodWrapper = (...parameters) => {
      let jobId = uuid().replace(/-/g, '')
      let subject = this.msgHubId + '.ws.worker.' + jobId

      let job = {
        progress: (msg) => {
          this.publish(subject + ':message', msg);
        },
        error: (msg) => {
          this.publish(subject + ':error', msg);
        },
        done: (msg) => {
          this.msgHubLog(CODE.DONE)
          this.publish(subject + ':done', msg);
        }
      }
      // Subscribe run endpoint
      let runEndpoint = subject + ':run';
      let runHandler = () => {
        method.apply(this, [job].concat(parameters))
        this.msgHubLog(CODE.JOB)
      }
      this.nats.subscribe(runEndpoint, runHandler)

      // Pass back endpoint and job id
      return {
        jobId: jobId,
        endpoint: runEndpoint
      }
    }
    this.expose(methodWrapper, MdUtils.getFunctionName(method))
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

        if (parsed.result && parsed.result.jobId) {
          // Called method is a job - return token to the client
          log.debug(`Invoked method is a JOB with id ${parsed.result.jobId}`)
          resolve(parsed.result.jobId)
          // Start the job on remote server
          this.nats.publish(parsed.result.endpoint);
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

  msgHubLog(event) {
    let logItem = {
      event: event,
      id: this.clientId,
      ip: ip.address(),
      type: this.clientType
    }
    this.publish(this.msgHubId + '.dbg.' + this.clientId, JSON.stringify(logItem))
  }
}
