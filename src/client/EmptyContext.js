import Context from './Context'

export default class EmptyContext extends Context {
  static create () {
    var ctx = new EmptyContext()
    ctx.def = {
      name: '',
      url: '',
      dataPrefix: ''
    }

    ctx.axios = null
    ctx.socket = null
    ctx.WS_ENDPOINT_URL = ''
    ctx.API_ENDPOINT_URL = ''
    return ctx
  }
}
