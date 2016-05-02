define([
    "dojo/_base/declare",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/_base/connect",
    "dojo/Deferred",
    "dojo/promise/all",
    "esri/graphic",
    "esri/request",
    "esri/tasks/query",
    "esri/tasks/QueryTask",
    'esri/geometry/Point',
    'esri/geometry/Polyline',
    'esri/geometry/Polygon',
    'jimu/CustomUtils/QueryUtil',
    'jimu/CustomUtils/plugins/xml2json/xml2json'

], function (
    declare, array, lang, connect, Deferred,all,Graphic,esriRequest,Query, QueryTask,Point,Polyline,Polygon, QueryUtil
) {
    var CustomSearchUtil = declare("CustomSearchUtil", [], {
        _displayFieldArray: [],
        _idFieldArray: [],
        convertXMLToJson:function(xmlDoc){
            return xml2json(xmlDoc)
        },
        startSearch: function (value,source) {
            var deferred = new Deferred();
            var dataObject = {};
            dataObject[source.queryParam] = value;
            var requestObject = {
                url: source.url,
                content: dataObject,
                format: source.queryResponseFormat
            }
            this.queryNonSpatialData(requestObject, source).then(lang.hitch(this, function (responseObject) {
                var results = this.formatResponses(source.displayFields, source.customQueryResultsIdentifierField, responseObject);
                deferred.resolve(results);
            }), lang.hitch(this, function (e) {
                deferred.resolve([]);
            }));
            return deferred.promise;
        
        },
        queryGeometry: function (params) {
            var deferred = new Deferred();
            QueryUtil.executeQuery(params).then(function (res) {
                deferred.resolve(res);
            }, function (error) {
                console.log(error);
                deferred.resolve([]);
            });
            return deferred.promise;
        },
        queryNonSpatialData: function (queryObject) {
            var deferred = new Deferred();
            esriRequest({
                url: queryObject.url,
                content: queryObject.content,
                handleAs: queryObject.format
            }).then(lang.hitch(this, function (response) {
                var responseObject = queryObject.format === 'xml' ? responseObject = this.convertXMLToJson(response.documentElement) : responseObject = response;
                deferred.resolve(responseObject);
            }), function (error) {
                console.log(error);
                deferred.resolve([]);
            });
            return deferred.promise;
        },
        fetchGeometryAndExtendedInfo: function (result, source, cache, proxyUrl) {
            var queryDeferreds = [];
            var deferred = new Deferred();
            if (source.geometryQuery) {
                //only arcgis mapservices are supported for geom query
                var queryDefenition;
                if (/,/.test(result.value)) {
                    queryDefenition = source.geometrySourceQueryField + " IN " + " (" + result.value + ")";
                } else {
                    if (cache && cache.fields.length > 0) {
                        var queryField = array.filter(cache.fields, function (field) {
                            return field.name === source.geometrySourceQueryField;
                        })[0];
                        if (queryField) {
                            if (queryField.type === 'esriFieldTypeString') {
                                queryDefenition = source.geometrySourceQueryField + " = '" + result.value + "'";
                            } else {
                                queryDefenition = source.geometrySourceQueryField + " = " + result.value;
                            }
                        } else {

                        }
                    } else {
                        queryDefenition = source.geometrySourceQueryField + " = " + result.value;
                    }
                }
                var queryObject = {
                    queryDefinition: queryDefenition,
                    serviceUrl: source.geometrySourceUrl,
                    proxyUrl: proxyUrl
                }
                queryDeferreds.push(this.queryGeometry(queryObject));
            }
            if (source.extendedQuery && source.extendedQueryField) {
                var queryUrl = "?";
                var values = result.value.split(",")
                array.forEach(values, function (id) {
                    queryUrl += source.extendedQueryField + "=" + id + "&";
                })
                queryUrl += queryUrl.replace(/(^\&)|(,\&)/g, "");//removing trailing "&"
                var url = source.extendedQueryUrl + queryUrl
                var queryObject = {
                    url: url,
                    format: source.extendedQueryResponseFormat
                }
                queryDeferreds.push(this.queryNonSpatialData(queryObject))
            } else if (source.extendedQuery && !(source.extendedQueryField)) {
                var url = source.extendedQueryUrl;
                var possibleFieldPlaceHolder = lang.trim(url.substr(url.lastIndexOf('/') + 1));
                if (/^{.*}$/.test(possibleFieldPlaceHolder)) {
                   url = url.replace(url.substr(url.lastIndexOf('/')), '') + "/" + (result.value);
                } 
                var queryObject = {
                    url: url,
                    format: source.extendedQueryResponseFormat
                }
                queryDeferreds.push(this.queryNonSpatialData(queryObject))
            }
            all(queryDeferreds).then(function (res) {
                deferred.resolve(res);
            });
            return deferred.promise;
        
        },
        fetchRequiredInfoFromResponse: function (responses, source) {
            var geomResponse = responses[0];
            var extendedQueryResponse = responses[1];
            var graphics = [];
            array.forEach(geomResponse.features, function (feature) {
                var geometry;
                if (geomResponse.geometryType === 'esriGeometryPolygon'){
                    if(!(feature instanceof Polygon) ) {
                        geometry = new Polygon({ "rings": feature.geometry.rings, "spatialReference": geomResponse.spatialReference });
                    }else{
                        geometry = lang.clone(feature.geometry);
                    }
                } else if(geomResponse.geometryType === 'esriGeometryPolyline'){
                    if (!(feature instanceof Polyline)) {
                        geometry = new Polyline({ "paths": feature.geometry.paths, "spatialReference": geomResponse.spatialReference });
                    } else {
                        geometry = lang.clone(feature.geometry);
                    }
                } else if (geomResponse.geometryType === 'esriGeometryPoint') {
                    if (!(feature instanceof Point)) {
                        geometry = new Point({ "x": feature.geometry.x,"y":feature.geometry.y, "spatialReference": geomResponse.spatialReference });
                    } else {
                        geometry = lang.clone(feature.geometry);
                    }
                }
                graphics.push(new Graphic(geometry, null, lang.clone(feature.attributes)));
            });
            return {
                features: graphics,
                name:source.name,
                treeData: this.convertToDijitTreeFormat(extendedQueryResponse)
            }
        },
        formatResponses: function (displayFields, idField, responses) {
            this._displayFieldArray= [];
            this._idFieldArray = [];
            if (this._isArray(responses)) {
                this._readArrays(displayFields, idField, responses);
            }else if(this._isObject(responses)){
                this._readObjects(displayFields, idField, responses);
            }
            var formattedResponses = [];
            array.forEach(this._displayFieldArray, lang.hitch(this, function (label, index) {
                formattedResponses.push({ name: label, value: this._idFieldArray[index].toString()});
            }));
            return formattedResponses;
        },
        convertToDijitTreeFormat: function (jsonObj) {
            var structuredResponse = {};
            this._ds = [];
            this._idIndex = 0;
            //check if an array or object
            if (this._isArray(jsonObj)) {
                structuredResponse["Results"] = jsonObj;
            } else if (this._isObject(jsonObj)) {
                var keys = Object.keys(jsonObj);
                if (keys.length == 1) {
                    structuredResponse = jsonObj
                } else if (keys.length > 1) {
                    structuredResponse["Results"] = jsonObj;
                } else {
                    throw ("Not a valid data source");
                    return;
                }
            } else {
                throw ("Not a valid data source");
                return;
            }
            this._Treefy(structuredResponse, null, this._idIndex);
            this._ds[0].root = true;
            return this._ds;
        },
        _Treefy: function (response,parentName,parentId) {
            if (this._isObject(response)) {
                var keys = Object.keys(response);
                array.forEach(keys, lang.hitch(this, function (key, index) {
                    if (key) {
                        if (response[key] && response[key].label && response[key].text) {
                            if (response[key].label != 'Address') {
                                this._ds.push({ name: response[key].label + " " + response[key].text, id: ++this._idIndex, parent: parentId });
                            }
                            var indexOfKey = array.indexOf(keys, key);
                            keys.splice(indexOfKey, 1);

                            delete response[key];
                        } else if (key === "label" && (array.indexOf(keys, "value") != -1) || key == "value" && (array.indexOf(keys, "label") != -1)) {
                            this._ds.push({ name: response.label + " " + response.value, id: ++this._idIndex, parent: parentId });

                            var indexOfLabel = array.indexOf(keys, "label");
                            var indexOfValue = array.indexOf(keys, "value");

                            keys.splice(indexOfLabel, 1);
                            keys.splice(indexOfValue, 1);

                            delete response[key].label;
                            delete response[key].value;
                        } else if (response[key] && response[key].value && !(response[key].hasOwnProperty("label"))) {
                            this._ds.push({ name: key + " " + response[key].value, id: ++this._idIndex, parent: parentId });
                            delete response[key].value;
                            this._Treefy(response[key], key, this._idIndex);

                        } else {
                             if (/^https?/g.test(response[key])) {
                                 this._ds.push({ name: key, id: ++this._idIndex, parent: parentId, url: response[key] });
                            } else {
                                 if (this._isArray(response[key]) || this._isObject(response[key])) {
                                     this._ds.push({ name: key, id: ++this._idIndex, parent: parentId });
                                     this._Treefy(response[key], key, this._idIndex);
                                 } else {
                                     this._ds.push({ name: key + " " + response[key], id: ++this._idIndex, parent: parentId });
                                 }
                            }

                        }
                    }
                }));
            } else if (this._isArray(response)) {
                var interimDataObject = {};
                array.forEach(response,lang.hitch(this,function (res,index) {
                    var key = parentName;
                    if (res.value) {
                        key += " " + res.value;
                        if (!(res.hasOwnProperty('label'))) {
                            delete res.value;
                        }
                    } else {
                        key +=" "+index;
                    }
                    interimDataObject[key] = res;
                }));
                this._Treefy(interimDataObject, parentName, parentId);
            
            }else{
                this._ds.push({ name: response, id: ++this._idIndex, parent: parentId });
            }
        },
        
        _readArrays: function (displayFields, idField, responses) {
            array.forEach(responses, lang.hitch(this, function (resp) {
                if (this._isObject(resp)) {
                    this._readObjects(displayFields, idField, resp)
                }
            }));
        },
        _readObjects: function (displayFieldsString,idField,resp) {
            var keys = Object.keys(resp);
            var displayFields = displayFieldsString.split(",");
            var displayFieldsMap = {};
            array.forEach(displayFields, function (field) {
                field = lang.trim(field.replace(/\(|\)/g, ""));
                displayFieldsMap[field.toLowerCase()] = [];
            })
            array.forEach(keys,lang.hitch(this,function (key) {
                if (array.indexOf(Object.keys(displayFieldsMap),key.toLowerCase()) != -1) {//change here
                    if (this._isObject(resp[key])) {
                        displayFieldsMap[key.toLowerCase()].push(resp[key].text);
                    } else {
                        displayFieldsMap[key.toLowerCase()].push(resp[key]);
                    }
                } else if (key.toLowerCase() === idField.toLowerCase()) {
                    if (this._isObject(resp[key])) {
                        this._idFieldArray.push(resp[key].text);
                    } else if (this._isArray(resp[key])) {
                        var idString = "";
                        array.forEach(resp[key], lang.hitch(this, function (res) {
                            idString +=  res.text+",";
                        }));
                        idString += idString.replace(/(^,)|(,$)/g, "");//removing trailing coma
                        this._idFieldArray.push(idString);
                    }
                    else {
                        this._idFieldArray.push(resp[key]);
                    }
                } else if (this._isObject(resp[key])) {
                    this._readObjects(displayFieldsString, idField, resp[key]);
                } else if (this._isArray(resp[key])) {
                    this._readArrays(displayFieldsString, idField, resp[key]);
                }
            }));
            var arrayLength = displayFieldsMap[displayFields[0].toLowerCase()].length;
            var label="";
            for (i = 0; i < arrayLength ; i++) {
                array.forEach(displayFields, function (field) {
                    if (/(?=.*\()(?=.*\)).*/.test(field)) {
                        field = lang.trim(field.replace(/\(|\)/g, ""));
                        label += " (" + displayFieldsMap[field.toLowerCase()][i] +")";
                    } else {
                        label += " " + displayFieldsMap[field.toLowerCase()][i];
                    }
                    
                });
                this._displayFieldArray.push(label);
            }
        },
        _isArray: function (a) {
            return (!!a) && (a.constructor === Array);
        },
        _isObject: function (a) {
            return (!!a) && (a.constructor === Object);
        }
      
    });
    if (!_instance) {
        var _instance = new CustomSearchUtil();
    }
    return _instance;
});