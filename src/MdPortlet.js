import PortletContext from './MdPortletContext'
import MdUtils from './MdUtils'

export default class MdPortlet {
  constructor () {
    this.children = []
    this.createChildren((elementType) => {
      var element = document.createElement(elementType)
      this.children.push(element)
      return element
    })
  }

  register (intoElement, context) {
    console.log('register')
    this.context = context || PortletContext.emptyContext()
    intoElement.innerHTML = ''
    this.children.forEach((child) => {
      intoElement.appendChild(child)
    })
    this.loaded()
  }

  createChildren () {
    console.warn('createChildren should be overridden')
  }

  loaded () {
    console.warn('loaded should be overridden')
  }

  async httpGet (path, noUrlFix) {
    if (!this.context.axios) {
      throw new Error('axios have not been provided to the portlet')
    }
    try {
      const response = await this.context.axios.get(noUrlFix ? path : this.makeUrl(path))
      return response.data
    } catch (err) {
      this.context.api.error('Error when loading data: ' + err.message)
    }
  }

  getSocket () {
    if (!this.context.socket) {
      throw new Error('socket object has not been provided to the portlet')
    }
    return this.context.socket
  }

  async api (method, params) {
    if (!this.context.axios) {
      throw new Error('axios have not been provided to the portlet')
    }

    try {
      var url = this.makeApiUrl(method, params)
      var results = await this.context.axios.get(url)
      return results.data
    } catch (err) {
      this.context.api.error('Error when loading data: ' + err.message)
    }
  }

  broadcast (subject, message) {
    var url = this.context.wsEndpointUrl + '/' + subject + '/' + encodeURI(JSON.stringify(message))
    console.log(url)
    this.httpGet(url, true)
  }

  emit (subject, message) {
    let socket = this.getSocket()
    socket.emit(subject, message)
  }

  makeApiUrl (method, params) {
    return this.context.apiEndpointUrl + (this.context.def.dataPrefix || this.context.def.url || '') + method + '/' + MdUtils.encodeApiParams(params)
  }

  makeUrl (path) {
    return (this.context.def.dataPrefix || this.context.def.url || '') + path
  }
}
