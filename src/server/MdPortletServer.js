import express from 'express'
import path from 'path'
import log from './logger'
import MdMessageHub from './MdMessageHub'
import MdUtils from './MdUtils'
import grpc from 'grpc'
const protoLoader = require('@grpc/proto-loader')

const MSGHUB_SERVER = process.env.MSGHUB_SERVER || undefined
const MSGHUB_ID = process.env.MSGHUB_ID || 'mdesktop'
const appDir = path.dirname(require.main.filename)

export default class MdPortletServer {
  constructor (id, portletLocation, grpcDefLocation) {
    log.debug(`Creating ${this.constructor.name} (id = ${id})`)
    this.portletLocation = portletLocation
    this.grpcDefLocation = grpcDefLocation

    // Cleanup on exit
    process.on('SIGINT', ::this.destructor)
    process.on('SIGUSR1', ::this.destructor)
    process.on('SIGUSR2', ::this.destructor)
    process.on('uncaughtException', ::this.destructor)

    if (typeof id === 'undefined' || id === null) {
      throw new Error('PortletServer needs id in a constructor')
    }

    this.id = id
    this.msgHub = new MdMessageHub(MSGHUB_ID, this.id)
    this.invoke = this.msgHub::this.msgHub.invoke
    this.expose = this.msgHub::this.msgHub.expose
    this.exposeJob = this.msgHub::this.msgHub.exposeJob
    this.publish = this.msgHub::this.msgHub.publish
    this.subscribe = this.msgHub::this.msgHub.subscribe
    this.msgHub.connect(MSGHUB_SERVER).then(() => {
      log.info('Success when connecting to messaging server ' + MSGHUB_SERVER)
    }, (err) => {
      log.error('Error when connecting to messaging server ' + MSGHUB_SERVER, err)
      process.exit(1)
    })

    this.app = express()
    this.apiRouter = express.Router()

    this.grpcServer = new grpc.Server()
  }

  exposeGet (path, handler) {
    log.info(`Exposing [GET] /api${path}`)
    this.apiRouter.get(path, handler)
  }

  exposePost (path, handler) {
    log.info(`Exposing [POST] /api${path}`)
    this.apiRouter.post(path, handler)
  }

  exposePut (path, handler) {
    log.info(`Exposing [PUT] /api${path}`)
    this.apiRouter.put(path, handler)
  }

  exposeDelete (path, handler) {
    log.info(`Exposing [DELETE] /api${path}`)
    this.apiRouter.delete(path, handler)
  }

  exposeGrpc(method, methodNameOverride) {
    if (!method || typeof(method) !== 'function') {
      log.error('exposeGrpc needs to be provided a function object')
      return
    }
    let methodName = methodNameOverride || MdUtils.getFunctionName(method)
    this.exposedGrpc = this.exposedGrpc || {}
    this.exposedGrpc[methodName] = method
    log.info(`Method '${methodName}' added to GRPC handlers`)
  }

  listen (port) {
    this.listenPort = port
    this.app.use('/api', this.apiRouter)

    if (this.grpcDefLocation) {
      this.app.use('/grpc', ::this.serveGrpcDef)
    }

    if (this.portletLocation) {
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
    this.grpcPort = grpcPort
    this._addGrpcService()
    this.grpcServer.bind('0.0.0.0:' + grpcPort, grpc.ServerCredentials.createInsecure())
    this.grpcServer.start()
    log.info('GRPC server running on *:' + grpcPort)
  }

  _addGrpcService() {
    try {
      let grcpProto = protoLoader.loadSync(path.join(appDir, this.grpcDefLocation), {})
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
    res.sendFile(path.join(appDir, this.portletLocation))
  }

  serveGrpcDef (req, res, next) {
    res.sendFile(path.join(appDir, this.grpcDefLocation))
  }

  async handleApiCall (req, res, next) {
    var methodName = req.params.methodName
    var methodParams = MdUtils.decodeApiParams(req.params.methodParams)
    log.debug(`Received api call for ${methodName}, parameters: ${methodParams}`)
    // Invoke function
    try {
      var endpoint = MSGHUB_ID + '.' + this.id + '.' + methodName
      var results = await this.invoke.apply(this, [endpoint].concat(methodParams))
      res.send(results)
    } catch (err) {
      res.status(500).send(err.message)
    }
  }

  destructor (err) {
    try {
      this.msgHub.disconnect()
      this.expressServer.close()
      this.grpcServer.forceShutdown()
    } catch (err) {
      log.error(err)
    }

    if (err) {
      log.error(err)
    }
    process.exit(1)
  }

}
