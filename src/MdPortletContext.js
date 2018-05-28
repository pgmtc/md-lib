export default class MdPortletContext {
  static emptyContext () {
    var context = new MdPortletContext()
    context.def = {
      name: '',
      url: '',
      dataPrefix: ''
    }
    context.axios = null
    context.socket = null
    context.wsEndpointUrl = ''
    context.apiEndpointUrl = ''
    return context
  }
}
