import express from 'express'
import path from 'path'
import log from './logger'
import MdMessageHub from './MdMessageHub'
import MdUtils from './MdUtils'

const MSGHUB_SERVER = process.env.MSGSERVER || undefined
const MSGHUB_ID = process.env.MSGHUB_ID || 'mdesktop'
const app = express()

export default class MdPortletServer {
  constructor (id, portletLocation) {
    log.debug(`Creating ${this.constructor.name} (id = ${id})`)
    this.portletLocation = portletLocation

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
    this.msgHub.connect(MSGHUB_SERVER).then(() => {
      // Proxy invoke and expose methods
    }, (err) => {
      log.error('Error when connecting to messaging server', err)
      process.exit(1)
    })
  }

  listen (port) {
    if (this.portletLocation) {
      this.app.use('/', ::this.servePortlet)
    }
    this.app.use('/api', this.getRestApi())
    this.app.listen(port, (err) => {
      if (err) {
        log.error('Cannot start the server on port ' + port)
        process.exit(1)
        return
      }
      log.info('Server running on *:' + port)
    })
  }

  getRestApi () {
    var router = express.Router()
    router.get('/:methodName/:methodParams', ::this.handleApiCall)
    router.get('/:methodName/', ::this.handleApiCall)
    return router
  }

  servePortlet (req, res, next) {
    res.sendFile(path.join(appDir, this.portletLocation))
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

  destructor () {
    this.msgHub.disconnect()
    process.exit(1)
  }

}
