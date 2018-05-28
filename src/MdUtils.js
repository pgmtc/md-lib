import util from 'util'
const MSGHUB_ID = process.env.MSGHUB_ID || 'mdesktop'
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg
var ARGUMENT_NAMES = /([^\s,]+)/g

export default class MdUtils {
  static getFunctionParameters (func) {
    if (util.format(func).indexOf('Function: bound') > -1) {
      return []
    }
    var fnStr = func.toString().replace(STRIP_COMMENTS, '')
    var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES)
    if (result === null) {
      result = []
    }
    return result
  }

  static getFunctionName (func) {
    var fDescr = util.format(func)
    var fName = fDescr.replace(/bound /, '').replace(/(Function:)|(bound)|[\[\] ]*/g, '')
    return fName
  }

  static getRestApiParams (encoded) {
    let parsed = decodeURIComponent(encoded)
    try {
      parsed = JSON.parse(parsed)
    } catch (err) {

    }
    return parsed
  }

  static async handleApiCall (req, res, next) {
    var component = req.params.component
    var method = req.params.method
    var params = MdUtils.getRestApiParams(req.params.params)

    // Invoke function
    try {
      var endpoint = MSGHUB_ID + '.' + component + '.' + method
      var results = await this.invoke.apply(this, [endpoint].concat(params))
      res.send(results)
    } catch (err) {
      res.status(500).send(err.message)
    }
  }
}
