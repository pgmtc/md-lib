import MdUtils from '../server/MdUtils'

export default class Context {
  get def () {
    return this._def
  }

  set def (value) {
    try {
      this._def = JSON.parse(value)
    } catch (err) {
      this._def = value
    }
  }

  get axios () {
    return this._axios
  }

  set axios (value) {
    this._axios = value
  }

  get socket () {
    return this._socket
  }

  set socket (value) {
    this._socket = value
  }

  get WS_ENDPOINT_URL () {
    return this._WS_ENDPOINT_URL
  }

  set WS_ENDPOINT_URL (value) {
    this._WS_ENDPOINT_URL = value
  }

  get API_ENDPOINT_URL () {
    return this._WS_ENDPOINT_URL
  }

  set API_ENDPOINT_URL (value) {
    this._WS_ENDPOINT_URL = value
  }

  get api () {
    return {
      inProgress: (value) => {

      },

      setTitle: (value) => {

      },

      error: (value) => {

      }
    }
  }

  async httpGet (path, noUrlFix) {
    if (!this.axios) {
      throw new Error('axios have not been provided to the context')
    }
    try {
      const response = await this.axios.get(noUrlFix ? path : this._makeUrl(path))
      return response.data
    } catch (err) {
      this.api.error('Error when loading data: ' + err.message)
    }
  }

  async apiCall (method, params) {
    if (!this.axios) {
      throw new Error('axios have not been provided to the portlet')
    }

    try {
      var url = this._makeApiUrl(method, params)
      var results = await this.axios.get(url)
      return results.data
    } catch (err) {
      this.api.error('Error when loading data: ' + err.message)
    }
  }

  async apiJob (methodName, params, messageHandler) {
    return new Promise(async (resolve, reject) => {
      var doneHandler = (result) => {
        resolve(result)
        detach()
      }

      var errorHandler = (result) => {
        reject(result)
        detach()
      }

      var msgHandler = (result) => {
        if (typeof messageHandler === 'function') {
          messageHandler(result)
        }
      }

      var detach = () => {
        this.socket.removeListener(`worker.${token}:done`, doneHandler)
        this.socket.removeListener(`worker.${token}:error`, errorHandler)
        this.socket.removeListener(`worker.${token}:message`, msgHandler)
      }

      var token = await this.api(methodName, params)
      this.socket.on(`worker.${token}:done`, doneHandler)
      this.socket.on(`worker.${token}:error`, errorHandler)
      this.socket.on(`worker.${token}:message`, msgHandler)
    })
  }

  async broadcast (subject, message) {
    var url = this.WS_ENDPOINT_URL + '/' + subject + '/' + encodeURI(JSON.stringify(message))
    let resp = this.httpGet(url, true)
    return resp
  }

  _makeUrl (path) {
    return (this.def.dataUrl || this.def.id || '') + path
  }

  _makeApiUrl (method, params) {
    return (this.API_ENDPOINT_URL || '') + '/' + ((this.def.id + '/') || '') + method + '/' + MdUtils.encodeApiParams(params)
  }
}
