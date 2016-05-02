require(["dojo/_base/lang","dojo/dom-style","dojo/dom-class","dojo/Deferred","dojo/dom-class", "esri/dijit/Search"], function (lang,domStyle,domClass,Deferred,domClass,Search) {
    lang.extend(Search, {
        _inputKey: function (a) {
            if (a) {
                a.stopPropagation();
                a.preventDefault()
            }
            return false;
        },
        doSuggest: function (a) {
            a = this.get("value") || a;
            var deferred = new Deferred();
            this.enableSuggestions = true;
            this._mapLoaded().then(lang.hitch(this, function () {
                this._suggestDeferred(a).then(lang.hitch(this, function (a) {
                    this.enableSuggestions = false;
                    if (a) {
                        var d = a.results;
                        //this.set("suggestResults", d);
                        deferred.resolve(d)
                    } else {
                        deferred.resolve(null)
                    }
                }), lang.hitch(this, function (a) {
                    deferred.reject(a)
                }))
            }));
            return deferred.promise
        },
        searchAsSuggest:function(a){
            a = this.get("value") || a;
            var deferred = new Deferred();
            this._mapLoaded().then(lang.hitch(this, function () {
                this._searchDeferred(a).then(lang.hitch(this, function (a) {
                    var d = a.results;
                    //this.set("suggestResults", d);
                    //this.emit("suggest-results", a);
                    deferred.resolve(d)
                }), lang.hitch(this, function (a) {
                    deferred.reject(a)
                }))
            }));
            return deferred.promise
        },
        makeSuggestFromResults:function(a){
            var d = a.results;
            this.set("suggestResults", d);
            0 === a.numResults && (this.showSuggestResults(a.value));
        },
        showSuggestResults: function (r) {
            r ? (r.results ? this.set("suggestResults", r.results) : this.set("suggestResults", r)) : this.set("suggestResults", r);
            var d = this.get("suggestResults");
            var a = this.get("value");
            if (!d) {
                this.set("searchResults", null);
                this.showNoSuggestResults(a);
            } else {
                this._insertSuggestions(d, a);
            }
            this.emit("suggest-results-show", d);
        },
        showNoSuggestResults: function (a) {
            this._noResults(a);
            this._showNoResultsMenu();
        }
    });
});