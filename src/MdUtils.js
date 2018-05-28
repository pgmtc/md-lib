import util from 'util'
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;

export default class MdUtils {
  static getFunctionParameters(func) {
    if (util.format(func).indexOf('Function: bound') > -1) {
      return [];
    }
    var fnStr = func.toString().replace(STRIP_COMMENTS, '');
    var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    if (result === null)
      result = [];
    return result;
  }

  static getFunctionName(func) {
    var fDescr = util.format(func)
    var fName = fDescr.replace(/bound /, '').replace(/(Function:)|(bound)|[\[\] ]*/g, '')
    return fName;

  }
}
