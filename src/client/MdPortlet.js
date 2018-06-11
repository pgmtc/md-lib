import EmptyContext from './EmptyContext'

export default class MdPortlet {
  get ctx() {
    return this._ctx
  }
  constructor (id) {
    if (!id) {
      console.warn('id parameter was not provided to the constructor. This will break the API communication')
    }
    this.id = id
    this.children = []
    this.createChildren((elementType) => {
      var element = document.createElement(elementType)
      this.children.push(element)
      return element
    })
  }

  register (intoElement, context) {
    this._ctx = context || EmptyContext.create()
    intoElement.innerHTML = ''
    this.children.forEach((child) => {
      intoElement.appendChild(child)
    })
    this.httpGet = ::this.ctx.httpGet
    this.apiCall = ::this.ctx.apiCall
    this.apiJob = ::this.ctx.apiJob
    this.broadCast = ::this.ctx.broadCast


    this.loaded()
  }

  createChildren () {
    console.warn('createChildren should be overridden')
  }

  loaded () {
    console.warn('loaded should be overridden')
  }

  async api (method, params) {
    alert('outdated, replace api with apiCall')
  }

  async job (methodName, params, messageHandler) {
    alert('outdated, replace job with apiJob')
  }

}
