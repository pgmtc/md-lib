import log from './logger'
import MdMessageHub from './MdMessageHub'
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
    this.msgHub.connect(MSGHUB_SERVER).then(() => {
      // Proxy invoke and expose methods
    }, (err) => {
      log.error('Error when connecting to messaging server');
      process.exit(1)
    })


  }

  destructor() {
    this.msgHub.disconnect()
    process.exit(1);
  }

}
