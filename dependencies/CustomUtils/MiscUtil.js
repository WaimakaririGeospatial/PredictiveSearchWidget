define([
    "dojo/_base/declare",
    "dojo/_base/array",
    "dojo/_base/lang"
      

], function (
    declare, array, lang, connect, Query, QueryTask, QueryUtil
) {
    var MiscUtil = declare("MiscUtil", [], {
        getBaseUrl:function(url){
            var  pathArray = url.split( '/' );
            var  protocol = pathArray[0];
            var  host = pathArray[2];
            return protocol + '//' + host;
        },
        getUrlProtocol: function (url) {
            var pathArray = url.split('/');
            var protocol = pathArray[0];
            return protocol;
        },
        hasProxySet:function(url){
            var hasProxyRuleSet = false;;
            var baseUrl = this.getBaseUrl(url);
            if (esriConfig.defaults.io.proxyRules) {
                var rules = esriConfig.defaults.io.proxyRules;
                var rule = array.filter(rules, function (rule) {
                    return new RegExp(rule.urlPrefix).test(baseUrl);
                })[0]
                if (rule) {
                    hasProxyRuleSet = true;
                }
            }
            return hasProxyRuleSet;
        },
        isUsingApplicationProtocol: function (url) {
            var appProtocol = location.protocol;
            var urlProtocol = this.getUrlProtocol(url);
            return appProtocol === urlProtocol ? true : false;
        },
        isAlwaysUsingProxy: function () {
            return esriConfig.defaults.io.alwaysUseProxy;
        },
        addCommaSeperation: function (value) {

            var nStr = value + '';
            nStr = nStr.replace(/\,/g, "");
            x = nStr.split('.');
            x1 = x[0];
            x2 = x.length > 1 ? '.' + x[1] : '';
            var rgx = /(\d+)(\d{3})/;
            while (rgx.test(x1)) {
                x1 = x1.replace(rgx, '$1' + ',' + '$2');
            }
            return  x1 + x2;
        },
        compareObjects: function (x, y) {
            if (x === y) return true;
            // if both x and y are null or undefined and exactly the same

            if (!(x instanceof Object) || !(y instanceof Object)) return false;
            // if they are not strictly equal, they both need to be Objects

            if (x.constructor !== y.constructor) return false;
            // they must have the exact same prototype chain, the closest we can do is
            // test there constructor.

            for (var p in x) {
                if (!x.hasOwnProperty(p)) continue;
                // other properties were tested using x.constructor === y.constructor

                if (!y.hasOwnProperty(p)) return false;
                // allows to compare x[ p ] and y[ p ] when set to undefined

                if (x[p] === y[p]) continue;
                // if they have the same strict value or identity then they are equal

                if (typeof (x[p]) !== "object") return false;
                // Numbers, Strings, Functions, Booleans must be strictly equal

                if (!this.compareObjects(x[p], y[p])) return false;
                // Objects and Arrays must be tested recursively
            }

            for (p in y) {
                if (y.hasOwnProperty(p) && !x.hasOwnProperty(p)) return false;
                // allows x[ p ] to be set to undefined
            }
            return true;
        },
        alphaNumericSort: function (inputArray, sortField) {
            return inputArray.sort(function (a, b) {

                var A = a;
                var B = b;
                if (sortField) {
                    A = String(a[sortField]);
                    B = String(b[sortField]);
                }
                var reA = /[^a-zA-Z]/g;
                var reN = /[^0-9]/g;
                var aA = A.replace(reA, "");
                var bA = B.replace(reA, "");
                if (aA === bA) {
                    var aN = parseInt(A.replace(reN, ""), 10);
                    var bN = parseInt(B.replace(reN, ""), 10);
                    return aN === bN ? 0 : aN > bN ? 1 : -1;
                } else {
                    return aA > bA ? 1 : -1;
                }

            });
        },
        debounce: function (ms, fn) {
            var timer = null;
            return function () {
                var context = this, args = arguments;
                clearTimeout(timer);
                timer = setTimeout(function () {
                    fn.apply(context, args);
                }, ms);
            };
        }

    });
    if (!_instance) {
        var _instance = new MiscUtil();
    }
    return _instance;
});