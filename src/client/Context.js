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
    return this._API_ENDPOINT_URL
  }

  set API_ENDPOINT_URL (value) {
    this._API_ENDPOINT_URL = value
  }

  get GRPC_ENDPOINT_URL () {
    return this._GRPC_ENDPOINT_URL
  }

  set GRPC_ENDPOINT_URL (value) {
    this._GRPC_ENDPOINT_URL = value
  }

  get api () {
    return {
      inProgress: (value) => {
        this.dispatchEvent('progress', value)
      },

      setTitle: (value) => {
        this.dispatchEvent('title', value)
      },

      error: (err) => {
        this.dispatchEvent('error', err)
      }
    }
  }

  on(event, handler) {
    this._handlers = this._handlers || {}
    this._handlers[event] = this._handlers[event] || []
    this._handlers[event].push(handler)
  }

  dispatchEvent(event, ...params) {
    if (!this._handlers) return
    if (!this._handlers[event]) return
    this._handlers[event].forEach((handler) => {
      handler(...params)
    })
  }

  async httpGet (path, noUrlFix) {
    return this.http('get', path, noUrlFix)
  }

  async http (method, path, noUrlFix) {
    if (!this.axios) {
      throw new Error('axios have not been provided to the context')
    }
    try {
      this.api.inProgress(true)
      var results = await this.axios({
        url: noUrlFix ? path : this._makeUrl(path),
        method: method,
        validateStatus: status => true
      })
      if (results.status >= 200 && results.status <= 300) {
        return results.data
      }
      throw new Error(results.data && results.data.message ? results.data.message : 'Server error')

    } catch (err) {
      this.api.error('Error when loading data: ' + err.message)
    } finally {
      this.api.inProgress(false)
    }
  }

  async grpc (method, params) {
    if (!this.axios) {
      throw new Error('axios have not been provided to the portlet')
    }

    try {
      this.api.inProgress(true)
      var results = await this.axios({
        url: this._makeGrpcUrl(method, params),
        method: 'get',
        validateStatus: status => true
      })
      if (results.status >= 200 && results.status <= 300) {
        return results.data
      }
      throw new Error(results.data && results.data.message ? results.data.message : 'Server error')

    } catch (err) {
      this.api.error(new Error('Error when calling GRPC: ' + err.message))
    } finally {
      this.api.inProgress(false)
    }
  }

  async apiCall (method, params) {
    if (!this.axios) {
      throw new Error('axios have not been provided to the portlet')
    }

    try {
      this.api.inProgress(true)
      var results = await this.axios({
        url: this._makeApiUrl(method, params),
        method: 'get',
        validateStatus: status => true
      })
      if (results.status >= 200 && results.status <= 300) {
        return results.data
      }
      throw new Error(results.data && results.data.message ? results.data.message : 'Server error')

    } catch (err) {
      this.api.error('Error when calling API: ' + err.message)
    } finally {
      this.api.inProgress(false)
    }
  }

  async apiJob (methodName, params, messageHandler) {
    return new Promise(async (resolve, reject) => {
      var doneHandler = (result) => {
        this.api.inProgress(false)
        resolve(result)
        detach()
      }

      var errorHandler = (result) => {
        this.api.inProgress(false)
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

      var token = await this.apiCall(methodName, params)
      this.api.inProgress(true)
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

  _makeGrpcUrl (method, params) {
    return (this.GRPC_ENDPOINT_URL || '') + '/' + ((this.def.id + '/') || '') + method + '/' + MdUtils.encodeApiParams(params)
  }
}
