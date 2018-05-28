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

  async httpGet (path) {
    if (!this.context.axios) {
      throw new Error('axios have not been provided to the portlet')
    }
    try {
      const response = await this.context.axios.get(this.makeUrl(path))
      return response.data
    } catch (err) {
      this.context.api.error('Error when loading data: ' + err.message)
    }
  }

  async httpPost (path, data) {
    if (!this.context.axios) {
      throw new Error('axios have not been provided to the portlet')
    }
    try {
      const response = await this.context.axios.post(this.makeUrl(path, data))
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

  makeUrl (path) {
    return (this.context.def.dataPrefix || this.context.def.url || '') + path
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

  makeApiUrl (method, params) {
    return '/md/api' + (this.context.def.dataPrefix || this.context.def.url || '') + method + '/' + this.encodeParams(params)
  }
}
