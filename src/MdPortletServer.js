import express from 'express'
import log from './logger'
import MdMessageHub from './MdMessageHub'
import MdUtils from "./MdUtils"
const MSGHUB_SERVER = process.env.MSGSERVER || undefined
const MSGHUB_ID = process.env.MSGHUB_ID || 'mdesktop'

export default class MdPortletServer {
  constructor(id) {
    log.debug(`Creating ${this.constructor.name} (id = ${id})`);

    if (typeof id === 'undefined' || id === null) {
      throw new Error('PortletServer needs id in a constructor');
    }
    this.id = id
    this.msgHub = new MdMessageHub(MSGHUB_ID, this.id)
    this.invoke = this.msgHub::this.msgHub.invoke
    this.expose = this.msgHub::this.msgHub.expose
    this.publish = this.msgHub::this.msgHub.publish
    this.subscribe = this.msgHub::this.msgHub.subscribe
    this.msgHub.connect(MSGHUB_SERVER).then(() => {
      // Proxy invoke and expose methods
    }, (err) => {
      log.error('Error when connecting to messaging server');
      process.exit(1)
    })
  }

  getRestApi() {
    var router = express.Router();
    router.get('/:methodName/:methodParams', ::this.handleApiCall)
    router.get('/:methodName/', ::this.handleApiCall)
    return router;
  }

  async handleApiCall(req, res, next){
    var methodName = req.params.methodName;
    var methodParams = MdUtils.decodeApiParams(req.params.methodParams);
    log.debug(`Received api call for ${methodName}, parameters: ${methodParams}`)
    // Invoke function
    try {
      var endpoint = MSGHUB_ID + '.' + this.id + '.' + methodName
      var results = await this.invoke.apply(this, [endpoint].concat(methodParams))
      res.send(results);
    } catch (err) {
      res.status(500).send(err.message)
    }
  }

  destructor() {
    this.msgHub.disconnect()
    process.exit(1);
  }

}
