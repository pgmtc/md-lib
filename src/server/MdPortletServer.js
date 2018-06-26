import path from 'path'
import log from './logger'
import MdUtils from './MdUtils'

const MSGHUB_ID = process.env.MSGHUB_ID || 'mdesktop'
const appDir = path.dirname(require.main.filename)
var MdMessageHub = null

/*
  portletLocation
  grpcDefLocation
  msgHubServer
  msgHubId
  enableNats
  enableHttp
  enableGrpc
 */
export default class MdPortletServer {
  constructor (config) {
    this.config = config || {
      enableNats: false,
      enableHttp: true,
      enableGrpc: false
    }

    if (this.config.enableNats) {
      MdMessageHub = require('./MdMessageHub').default
    }

    let validation = this.validate()
    if (validation.length > 0) {
      validation.forEach((message) => log.error(message))
      process.exit(1)
    }

    log.debug(`Creating ${this.constructor.name} (id = ${this.config.id})`)

    // Cleanup on exit
    process.on('SIGINT', ::this.destructor)
    process.on('SIGUSR1', ::this.destructor)
    process.on('SIGUSR2', ::this.destructor)
    process.on('uncaughtException', ::this.destructor)


    let nats = this.config.enableNats
    this.msgHub = nats ? new MdMessageHub(this.config.msgHubId, this.config.id) : null
    this.invoke = nats ? this.msgHub::this.msgHub.invoke : this.noMessagingWarning
    this.expose = nats ? this.msgHub::this.msgHub.expose : this.noMessagingWarning
    this.exposeJob = nats? this.msgHub::this.msgHub.exposeJob : this.noMessagingWarning
    this.publish = nats ? this.msgHub::this.msgHub.publish : this.noMessagingWarning
    this.subscribe = nats ? this.msgHub::this.msgHub.subscribe : this.noMessagingWarning
    if (nats) {
      this.msgHub.connect(this.config.msgHubServer).then(() => {
        log.info('Success when connecting to messaging server ' + this.config.msgHubServer)
      }, (err) => {
        log.error('Error when connecting to messaging server ' + this.config.msgHubServer, err)
        process.exit(1)
      })
    }

    if (this.config.enableHttp) {
      let express = require('express')
      this.app = express()
      this.apiRouter = express.Router()
    }

    if (this.config.enableGrpc) {
      let grpc = require('grpc')
      this.grpcServer = new grpc.Server()
    }
  }

  validate() {
    let cnf = this.config
    if (!cnf) return ['Config is missing']
    let errmsg = []
    if (typeof cnf.id === 'undefined') errmsg.push('Config property id is missing')
    if (cnf.enableNats &&!cnf.msgHubServer) errmsg.push('NATS enabled, but msgHubServer property is missing')
    if (cnf.enableNats &&!cnf.msgHubId) errmsg.push('NATS enabled, but msgHubId property is missing')
    return errmsg
  }

  noMessagingWarning() {
    log.warn('Cannot perform requested operation as nats is disabled')
  }

  noHttpWarning() {
    log.warn('Cannot perform requested operation as the http is not enabled')
  }

  noGrpcWarning() {
    log.warn('Cannot perform requested operation as the http is not enabled')
  }


  exposeGet (path, handler) {
    if (!this.config.enableHttp) return this.noHttpWarning()
    log.info(`Exposing [GET] /api${path}`)
    this.apiRouter.get(path, handler)
  }

  exposePost (path, handler) {
    if (!this.config.enableHttp) return this.noHttpWarning()
    log.info(`Exposing [POST] /api${path}`)
    this.apiRouter.post(path, handler)
  }

  exposePut (path, handler) {
    if (!this.config.enableHttp) return this.noHttpWarning()
    log.info(`Exposing [PUT] /api${path}`)
    this.apiRouter.put(path, handler)
  }

  exposeDelete (path, handler) {
    if (!this.config.enableHttp) return this.noHttpWarning()
    log.info(`Exposing [DELETE] /api${path}`)
    this.apiRouter.delete(path, handler)
  }

  exposeGrpc(method, methodNameOverride) {
    if (!this.config.enableGrpc) return this.noGrpcWarning()
    if (!method || typeof(method) !== 'function') {
      log.error('exposeGrpc needs to be provided a function object')
      return
    }
    let methodName = methodNameOverride || MdUtils.getFunctionName(method)
    this.exposedGrpc = this.exposedGrpc || {}

    let wrapper = (call, callback) => {
      if (this.config.enableNats) this.msgHub.msgHubLog(MdMessageHub.CODE.INVOKE)
      try {
        let results = method(call.request)
        callback(null, results)
      } catch (err) {
        callback(err)
      }
    }

    this.exposedGrpc[methodName] = wrapper
    log.info(`Method '${methodName}' added to GRPC handlers`)
  }

  listen (port) {
    if (!this.config.enableHttp) return
    this.listenPort = port
    this.app.use('/api', this.apiRouter)

    if (this.config.grpcDefLocation) {
      this.app.use('/grpc', ::this.serveGrpcDef)
    }

    if (this.config.portletLocation) {
      this.app.use('/', ::this.servePortlet)
    }
    this.expressServer = this.app.listen(port, (err) => {
      if (err) {
        log.error('Cannot start the server on port ' + port)
        process.exit(1)
        return
      }
      log.info('Server running on *:' + port)
    })
  }

  listenGrpc (grpcPort) {
    if (!this.config.enableGrpc) return
    log.info(`Starting GRPC server on *:${grpcPort}`)
    let grpc = require('grpc')
    this.grpcPort = grpcPort
    this._addGrpcService()
    this.grpcServer.bind('0.0.0.0:' + grpcPort, grpc.ServerCredentials.createInsecure())
    this.grpcServer.start()
    log.info('GRPC server running on *:' + grpcPort)
  }

  _addGrpcService() {
    if (!this.config.enableGrpc) return this.noGrpcWarning()
    try {
      let grpc = require('grpc')
      let protoLoader = require('@grpc/proto-loader')
      let grcpProto = protoLoader.loadSync(path.join(appDir, this.config.grpcDefLocation), {})
      let grpcObjectDef = grpc.loadPackageDefinition(grcpProto)
      let defaultPkgName = Object.keys(grpcObjectDef)[0]
      let defaultPkgObject = grpcObjectDef[defaultPkgName]
      let defaultServiceName = Object.keys(defaultPkgObject)[0]
      let defaultServiceObject = defaultPkgObject[defaultServiceName]
      this.grpcServer.addService(defaultServiceObject.service, this.exposedGrpc)
    } catch (err) {
      log.error('Unable to load service into GRPC server', err)
    }
  }


  servePortlet (req, res, next) {
    res.sendFile(path.join(appDir, this.config.portletLocation))
  }

  serveGrpcDef (req, res, next) {
    res.sendFile(path.join(appDir, this.config.grpcDefLocation))
  }

  async handleApiCall (req, res, next) {
    var methodName = req.params.methodName
    var methodParams = MdUtils.decodeApiParams(req.params.methodParams)
    log.debug(`Received api call for ${methodName}, parameters: ${methodParams}`)
    // Invoke function
    try {
      var endpoint = this.config.msgHubId + '.' + this.id + '.' + methodName
      var results = await this.invoke.apply(this, [endpoint].concat(methodParams))
      res.send(results)
    } catch (err) {
      res.status(500).send(err.message)
    }
  }

  destructor (err) {
    try {
      this.msgHub ? this.msgHub.disconnect() : null
      this.expressServer ? this.expressServer.close() : null
      this.grpcServer ? this.grpcServer.forceShutdown() : null
    } catch (err) {
      log.error(err)
    }

    if (err) {
      log.error(err)
    }
    process.exit(1)
  }

}
