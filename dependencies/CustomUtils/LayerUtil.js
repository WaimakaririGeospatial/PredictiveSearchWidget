/* LayerUtil provides functions and info for querying and identifying layers in the map.
    Map service (ArcGISDynamic) sublayers and feature layers (FeatureLayer) both end up as a comparable "customLayerObject".
    Use getCustomLayerObjectListForLayer to get an array of customLayerObjects for a layer.
    For FeatureLayer layers, this will be an array of 1, for ArcGISDynamicMapService layers, this will contain all relevant sublayers. 

    When customLayerObjects are first used, they are stored in a cache for quick retrieval.  
    Use the refreshLayerCache method to ensure all map layers get cached. 

    customLayerObjects have the following properties: 
    {
        name:               layer name (string)
        uniqueId:           custom unique identifier of the whole object
        layerIdInMap:       layer label (string)
        serviceLayerIntId:  integer based layer ID
        serviceUrl:         ...arcgis/rest/services/service1/MapServer
        features: [],       after object is cloned, add result graphics/features here
        fields: [],         fields from REST call to service
        customFields: [],   processed fields ready for a data grid, with attributes: id, field, name, hidden
        layer: layer,       layer in map this was generated from (feature layer, dynamic or tiled)
        minScale:           layer.minScale,
        maxScale:           layer.maxScale,
        attributesUseAliasAsKey: identify results use a field aliases, rather than field names, as keys,
        geometryType        geometry type of the result features/graphics ,
        maxRecordCount      maximum records this layer can send back as a result of a query,
        excludedFromQuery:  false bool value determining whether this layer may be queried or not(including identify),//this is set in the modules feeding this layer object
        featureLayerInstanceInMap : false bool value indicating whether this layer is actual feature Layer in map or present as one of the sub layers in a map service  
        parentLayerNames:   [] array holding all the parent nodes of a layer(groups,sub groups etc),
        uniqueFeatureIdentifier: custom field created by the app ,
        treeData        :    null  ,for rendering the results as tree
   }

*/
define(
[
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/_base/array",
    "dojo/Deferred",
    "dojo/promise/all",
    "dojo/topic",
    "dojo/on",
    "esri/request",
    "esri/geometry/scaleUtils",
    "esri/layers/FeatureLayer",
    "esri/layers/ArcGISDynamicMapServiceLayer",
    "esri/layers/ArcGISTiledMapServiceLayer",
    "esri/layers/GraphicsLayer",
    "esri/layers/WMSLayer"

], function (
    declare,
    lang,
    array,
    Deferred,
    all,
    topic,
    on,
    esriRequest,
    scaleUtils,
    FeatureLayer,
    ArcGISDynamicMapServiceLayer,
    ArcGISTiledMapServiceLayer,
    GraphicsLayer,
    WMSLayer

) {
    var LayerUtil = declare("LayerUtil", [], {
        _map: null,
        _customLayerObjectCache: null,
        _layerIds:null,
        _isCacheBuilt: false,
        _uniqueId: 1000,
        _featureUniqueIdOffset: 1000,
        _uniqueIdField: "APPUNIQUEID",
        constructor: function (map,flag) {
            this.setMap(map);
            this._customLayerObjectCache = [];
            this._createOperationalLayerIdStack();
        },
        startup:function(map){
            this.attachHandlers();
            this.publishCacheUpdateEvent();
        },
        setMap: function (map) {
            if (!this._map) {
                this._map = map;
            }
        },
        attachHandlers: function () {
            this._layerAddHandler = this._map.on("layer-add-result", lang.hitch(this, function (layer) {
                this._updateLayerObjectCache(layer, true);
            }));
            this._layerRemoveHandler = this._map.on("layer-remove", lang.hitch(this, function (layer) {
                this._updateLayerObjectCache(layer, false);
            }));
        },
        publishCacheUpdateEvent:function(){
            var layers = this._getLayers();
            array.forEach(layers, lang.hitch(this, function (layer) {
                layer.on("visibility-change", function () {
                    topic.publish("FETCH_UPDATED_LAYERCACHE");
                });
                layer.on("scale-visibility-change", function () {
                    topic.publish("FETCH_UPDATED_LAYERCACHE");
                });
                //scale-visibility-change for sub layers of dynamic map service,
                //doest fire always and hence the following fix
                this._map.on("zoom-end", function () {
                    topic.publish("FETCH_UPDATED_LAYERCACHE");
                });
                if (this._isServiceLayer(layer)) {
                    layer.on("visible-layers-change", function () {
                        topic.publish("FETCH_UPDATED_LAYERCACHE");
                    });
                }
            }));
        },
        createLayerConfigCache: function () {
            var deferred = new Deferred();
            var deferredsToProcess = [];
            var layers = this._getLayers();
            var featureLayers = this._getFeatureLayers(layers);
            var mapserviceLayers = this._getMapServiceLayers(layers);
            this._createCustomLayerObjForFeatureLayers(featureLayers, true);
            this._createCustomLayerObjForMapServiceLayers(mapserviceLayers).then(lang.hitch(this, function (res) {
                this._isCacheBuilt = true;
                deferred.resolve();
            }));
            return deferred.promise;
        },
        isCacheBuilt: function () {
            return this._isCacheBuilt;
        },
        _updateLayerObjectCache: function (layer, add) {
            if (add) {
                if (this._isFeatureLayer(layer)) {
                    this._createCustomLayerObjForFeatureLayers([layer], true);
                    this._layerIds.push(layer.id);
                    layer.on("visibility-change", function () {
                        topic.publish("FETCH_UPDATED_LAYERCACHE");
                    });
                    layer.on("scale-visibility-change", function () {
                        topic.publish("FETCH_UPDATED_LAYERCACHE");
                    });
                    topic.publish("FETCH_UPDATED_LAYERCACHE");
                } else if (this._isServiceLayer(layer)) {
                    this._createCustomLayerObjForMapServiceLayers([layer])
                    this._layerIds.push(layer.id);

                    layer.on("visibility-change", function () {
                        topic.publish("FETCH_UPDATED_LAYERCACHE");
                    });
                    layer.on("scale-visibility-change", function () {
                        topic.publish("FETCH_UPDATED_LAYERCACHE");
                    });
                    layer.on("visible-layers-change", function () {
                        topic.publish("FETCH_UPDATED_LAYERCACHE");
                    });
                    topic.publish("FETCH_UPDATED_LAYERCACHE");
                }
            } else {
                var layerId = layer.id;
                var updatedCache = this._customLayerObjectCache.filter(function (obj) {
                    return obj.layerIdInMap != layerId;
                });
                this._customLayerObjectCache = updatedCache
                var index = array.indexOf(this._layerIds, layerId);
                if (index > 0) {
                    array.splice(index, 1);
                }
                topic.publish("FETCH_UPDATED_LAYERCACHE");
            }
        },
        _getFeatureLayers: function (layers) {
            var featureLayers = array.filter(layers, function (layer) {
                return layer instanceof FeatureLayer;
            });
            return featureLayers;
        },
        _getMapServiceLayers: function (layers) {
            var mapServiceLayers = array.filter(layers, function (layer) {
                return layer instanceof ArcGISDynamicMapServiceLayer || layer instanceof ArcGISTiledMapServiceLayer;
            });
            return mapServiceLayers;
        },
        _createOperationalLayerIdStack: function () {
            var map = this._map;
            var layerIds = [].concat(map.layerIds, map.graphicsLayerIds);
            this._layerIds = [];
            array.forEach(layerIds, lang.hitch(this, function (id) {
                var layer = map.getLayer(id);
                if (layer) {
                    var isBasemap = this._isBaseMap(layer);
                    var isWms = this._isWmsLayer(layer);
                    var isGraphics = this._isGraphicsLayer(layer);
                    if (!isBasemap && !isWms && !isGraphics) {
                        this._layerIds.push(id);
                    }
                }
            }));
        },
        _getLayers: function () {
            var map = this._map;
            var layers = [];
            if (!this._layerIds || this._layerIds.length ==0 ) {
                this._createOperationalLayerIdStack();
            }
            array.forEach(this._layerIds, lang.hitch(this, function (id) {
                var layer = map.getLayer(id);
                if (layer) {
                    var isBasemap = this._isBaseMap(layer);
                    var isWms = this._isWmsLayer(layer);
                    var isGraphics = this._isGraphicsLayer(layer);
                    if (!isBasemap && !isWms && !isGraphics) {
                        layers.push(layer);
                    }
                }
            }));
            return layers;
        },
        _isBaseMap: function (layer) {
            return layer._basemapGalleryLayerType ? true : false;
        },
        _isWmsLayer: function (layer) {
            return layer instanceof WMSLayer;
        },
        _isGraphicsLayer: function (layer) {
            //since  (layer instance of GraphicsLayer) holds true for actual Featurelayers as well
            return /GraphicsLayer/.test(layer.declaredClass);
        },
        _isFeatureLayer: function (layer) {
            return /FeatureLayer/.test(layer.declaredClass) && layer instanceof FeatureLayer;
        },
        _isServiceLayer: function (layer) {
            return layer instanceof ArcGISDynamicMapServiceLayer || layer instanceof ArcGISTiledMapServiceLayer
        },
        _createCustomLayerObjForFeatureLayers: function (layers, instanceInMap) {
            array.forEach(layers, lang.hitch(this, function (layer) {
                var layerUrl = layer.url;
                var serviceUrl = layerUrl.replace(layerUrl.substr(layerUrl.lastIndexOf('/')), '');
                serviceUrl = serviceUrl.replace("FeatureServer", "MapServer");
                var fields = this._addCustomUniqueIdField(layer.fields);
                this._customLayerObjectCache.push({
                    name: this.getLayerName(layer),
                    uniqueId: ++this._uniqueId,
                    layerIdInMap: layer.id,
                    serviceLayerIntId: layer.layerId >= 0 ? layer.layerId : layer.id,
                    serviceUrl: serviceUrl,
                    features: [],
                    fields: fields,
                    customFields: [],
                    layer: layer,
                    minScale: layer.minScale,
                    maxScale: layer.maxScale,
                    attributesUseAliasAsKey: true,
                    geometryType: layer.geometryType,
                    maxRecordCount: layer.maxRecordCount,
                    excludedFromQuery: false,
                    featureLayerInstanceInMap: instanceInMap,
                    parentLayerNames: null,
                    uniqueFeatureIdentifier: this._uniqueIdField,
                    treeData:null
                });
            }))

        },
        _createCustomLayerObjForMapServiceLayers: function (serviceLayers) {
            var deferred = new Deferred();
            var mapserviceSubLayerDeferreds = [];
            array.forEach(serviceLayers, lang.hitch(this, function (layer) {
                mapserviceSubLayerDeferreds.push(this._createCustomLayerObjectForSingleMapServiceLayer(layer));
            }));
            all(mapserviceSubLayerDeferreds).then(lang.hitch(this, function (setOfResponses) {
                var responseArray = [];
                array.forEach(setOfResponses, lang.hitch(this, function (eachResponseArray, i) {
                    var mapServiceLayer = serviceLayers[i];
                    array.forEach(eachResponseArray, lang.hitch(this, function (flayer) {
                        var layerUrl = flayer.url;
                        var serviceUrl = layerUrl.replace(layerUrl.substr(layerUrl.lastIndexOf('/')), '');
                        var parentLayers = this._retrieveParentLayersArray(flayer.layerId, mapServiceLayer);
                        var fields = this._addCustomUniqueIdField(flayer.fields);
                        this._customLayerObjectCache.push({
                            name: this.getLayerName(flayer),
                            uniqueId: ++this._uniqueId,
                            layerIdInMap: serviceLayers[i].id,//id in map of the actual service layer
                            serviceLayerIntId: flayer.layerId >= 0 ? flayer.layerId : flayer.id,
                            serviceUrl: serviceUrl,
                            features: [],
                            fields: fields,
                            customFields: [],
                            layer: serviceLayers[i],//the actual service layer in map
                            minScale: flayer.minScale,
                            maxScale: flayer.maxScale,
                            attributesUseAliasAsKey: true,
                            geometryType: flayer.geometryType,
                            maxRecordCount: flayer.maxRecordCount,
                            excludedFromQuery: false,
                            featureLayerInstanceInMap: false,
                            parentLayerNames: parentLayers,
                            uniqueFeatureIdentifier: this._uniqueIdField,
                            treeData:null
                        });
                    }));
                }));
                deferred.resolve();
            }));
            return deferred.promise;
        },
        _createCustomLayerObjectForSingleMapServiceLayer: function (layer) {
            var deferred = new Deferred();
            var featureLayerCreateDeferreds = [];
            array.forEach(layer.layerInfos, lang.hitch(this, function (info) {
                if (info.subLayerIds == null) {
                    var serviceUrl = layer.url + "/" + info.id;
                    featureLayerCreateDeferreds.push(this._createFeatureLayer(serviceUrl))
                }
            }));
            all(featureLayerCreateDeferreds).then(lang.hitch(this, function (responses) {
                deferred.resolve(responses);
            }));
            return deferred.promise;
        },
        _createFeatureLayer: function (url) {
            var deferred = new Deferred();
            var flayer = new FeatureLayer(url);
            flayer.on("load", function (res) {
                deferred.resolve(flayer)
            });
            flayer.on("error", function (err) {
                console.log(err)
                deferred.resolve(flayer);
            });
            return deferred.promise;
        },
        //used by parent modules using this util class
        createCustomLayerObjectByUrl: function (url) {
            var deferred = new Deferred();
            this._createFeatureLayer(url).then(lang.hitch(this, function (flayer) {
                this._createCustomLayerObjForFeatureLayers([flayer], false);
                deferred.resolve();
            }));
            return deferred.promise;
        },
        createCustomLayerObjForLocator: function (source) {
            var deferred = new Deferred();
            var fields = this._addCustomUniqueIdField([]);
            this._customLayerObjectCache.push({
                name: source.name,
                uniqueId: ++this._uniqueId,
                layerIdInMap: null,
                serviceLayerIntId: null,
                serviceUrl: source.url,
                features: [],
                fields: fields,
                customFields: [],
                layer: null,
                minScale: null,
                maxScale: null,
                attributesUseAliasAsKey: false,
                geometryType: 'esriGeometryPoint',
                maxRecordCount: 0,
                excludedFromQuery: true,
                featureLayerInstanceInMap: false,
                parentLayerNames: [],
                uniqueFeatureIdentifier: this._uniqueIdField,
                treeData: null
            });
            //just to align this object along with other possible deferreds
            deferred.resolve();
            return deferred.promise;
        },
        createCustomLayerObjForCustomSearchSource: function (source) {
            var deferred = new Deferred();
            esriRequest({
                url: source.geometrySourceUrl,
                content: {f:"json"},
                handleAs: "json"
            }).then(lang.hitch(this, function (response) {
                response.url = source.geometrySourceUrl;
                this._createCustomLayerObjForFeatureLayers([response], false);
                deferred.resolve();
            }), function (error) {
                console.log(error);
                deferred.resolve([]);
            });
            return deferred.promise;
        },
        updateCache: function (cache, data) {
            for (key in data) {
                if (key === "features") {
                    var features = data.features;
                    array.forEach(features, lang.hitch(this, function (feature) {
                        this.addFeature(cache, feature);
                    }));
                } else {
                    cache[key] = data[key];
                }
            }
            
        },
        _retrieveParentLayersArray: function (id, layer) {
            var parentLayers = [];
            var parentLayer = {};
            while (parentLayer != null) {
                parentLayer = this._reverseTrackParentLayers(id, layer);
                if (parentLayer && Object.keys(parentLayer).length > 0) {
                    parentLayers.push(parentLayer.name);
                    id = parentLayer.id;
                }
            }
            return parentLayers;
        },
        _reverseTrackParentLayers: function (id, layer) {
            var layerInfos = layer.layerInfos;
            var layerInfo = array.filter(layerInfos, function (info) {
                return info.id === id;
            })[0];
            if (layerInfo.parentLayerId != -1) {
                var parentLayerInfo = array.filter(layerInfos, function (info) {
                    return info.id === layerInfo.parentLayerId;
                })[0];
                return { name: parentLayerInfo.name, id: parentLayerInfo.id }
            } else {
                return null;
            }
        },
        _addCustomUniqueIdField: function (fields) {
            var customField = {
                alias: this._uniqueIdField,
                editable: false,
                name: this._uniqueIdField,
                type: "esriFieldTypeOID",
                custom: true
            };
            var customFields = fields ? lang.clone(fields) : [];
            customFields.push(customField);
            return customFields;
        },
        populateFieldsFromAttributes: function (cache, attributes) {
            for (key in attributes) {
                cache.fields.push({
                    alias: key,
                    editable: false,
                    length: undefined,
                    name: key,
                    nullable: undefined
                })
            }

        },
        areFieldsEmpty: function (cache) {
            return cache.fields.length == 1 ? true : false;
        },
        getLayerName: function (layer) {
            var layerName = "";
            if (layer.name) {
                layerName = layer.name;
            } else if (typeof (layer.arcgisProps) != "undefined") {
                layerName = layer.arcgisProps.title;
            } else if (typeof (layer.title) != "undefined") {
                layerName = layer.title;
            } else {
                var start = layer.url.toLowerCase().indexOf('/rest/services/');
                var end = layer.url.toLowerCase().indexOf('/mapserver', start);
                layerName = layer.url.substring(start + 15, end);
            }
            return layerName;
        },
        fetchCustomLayerConfig: function (respectScale, respectVisibility, discardDuplicateServices) {
            var filteredCache = this._customLayerObjectCache;
            if (respectScale) {
                filteredCache = this._filterCacheOnScale(filteredCache);
            }
            if (respectVisibility) {
                filteredCache = this._filterCacheOnVisibility(filteredCache);
            }
            if (discardDuplicateServices) {
                filteredCache = this._filterCacheOnDuplicateRestEndPoints(filteredCache);
            }
            return filteredCache;
        },
        _filterCacheOnScale: function (cache) {
            var mapScale = Math.floor(scaleUtils.getScale(this._map));//to avoid  calculated scale going by decimals //esri.geometry
            var scaleFiltered = array.filter(cache, function (obj) {
                var minScale = obj.minScale;
                var maxScale = obj.maxScale;
                var outScale = (maxScale != 0 && mapScale < maxScale) || (minScale != 0 && mapScale > minScale);
                return !outScale;
            });
            return scaleFiltered;
        },
        _filterCacheOnVisibility: function (cache) {
            var visibilityFiltered = array.filter(cache, lang.hitch(this, function (obj) {
                var layer = obj.layer;
                if (this._isFeatureLayer(layer)) {
                    return layer.visible && layer.id !=null;
                } else if (this._isServiceLayer(layer)) {
                    return layer.visible && array.indexOf(layer.visibleLayers, obj.serviceLayerIntId) > -1 && layer.id !=null;
                }
            }));
            return visibilityFiltered;
        },
        _filterCacheOnDuplicateRestEndPoints: function (cache) {
            var unionRestEnds = [];
            array.forEach(cache, lang.hitch(this, function (obj, index) {
                var layerId = obj.serviceLayerIntId;
                var serviceUrl = obj.serviceUrl;
                var testedCacheArray = array.filter(cache, function (item) {
                    return item.serviceUrl === serviceUrl && item.serviceLayerIntId === layerId;
                });

                if (testedCacheArray.length == 1) {
                    unionRestEnds.push(testedCacheArray[0]);
                } else if (testedCacheArray.length > 1) {
                    array.some(testedCacheArray, lang.hitch(this, function (item) {
                        var isInUnionResults = array.filter(unionRestEnds, function (filtered) {
                            return filtered.serviceUrl === item.serviceUrl && filtered.serviceLayerIntId == item.serviceLayerIntId
                        }).length === 0;
                        if (!isInUnionResults) {
                            return false
                        } else {
                            unionRestEnds.push(item);
                            return false
                        }
                    }));
                }

            }));
            return unionRestEnds;
        },
        getLayerIds: function () {
            return this._layerIds ? this._layerIds : [];
        },
        disableQuery: function (config) {
            config.excludedFromQuery = true;
        },
        enableQuery: function (config) {
            config.excludedFromQuery = false;
        },
        isExcludedFromQuery: function (config) {
            return config.excludedFromQuery;
        },
        flushPreviousResults: function () {
            array.forEach(this._customLayerObjectCache, function (cache) {
                cache.features = [];
            });
        },
        addFeature: function (cache, graphic) {
            graphic.attributes[this._uniqueIdField] = ++this._featureUniqueIdOffset;
            cache.features.push(graphic);
        },
        reset: function () {
            this._customLayerObjectCache = [];
            if (this._layerAddHandler) {
                this._layerAddHandler.remove();
            }
            if (this._layerRemoveHandler) {
                this._layerRemoveHandler.remove();
            }
            this.flushPreviousResults();

        },
        fetchNonEmptyResults: function () {
            var resultsArray = array.map(array.filter(this._customLayerObjectCache, function (cache) {
                return cache.features.length > 0
            }), lang.hitch(this, function (item) {
                return this._clone(item);
            }));
            return resultsArray;
        },
        _clone: function (cache) {
            var clonedObj = new Object({

                name: cache.name,
                uniqueId: cache.uniqueId,
                layerIdInMap: cache.layerIdInMap,
                serviceLayerIntId: cache.serviceLayerIntId,
                serviceUrl: cache.serviceUrl,
                features: cache.features,
                fields: lang.clone(cache.fields),
                customFields: [],
                layer: cache.layer,//the actual service layer in map
                minScale: cache.minScale,
                maxScale: cache.maxScale,
                attributesUseAliasAsKey: cache.attributesUseAliasAsKey,
                geometryType: cache.geometryType,
                maxRecordCount: cache.maxRecordCount,
                excludedFromQuery: cache.excludedFromQuery,
                featureLayerInstanceInMap: cache.featureLayerInstanceInMap,
                parentLayerNames: cache.parentLayerNames,
                uniqueFeatureIdentifier: cache.uniqueFeatureIdentifier,
                treeData: cache.treeData

            });
            return clonedObj;
        }
    });
    return LayerUtil;
});

