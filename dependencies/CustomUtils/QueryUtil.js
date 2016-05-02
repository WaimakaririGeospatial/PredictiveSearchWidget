define([
    "dojo/_base/declare",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/_base/connect",
    "dojo/Deferred",
    "dojo/promise/all",
    "esri/request",
    "dojo/request/script",
    "esri/geometry/Extent",
    "esri/tasks/query",
    "esri/tasks/QueryTask",
    "esri/tasks/GeometryService",
    "esri/tasks/BufferParameters",
    "./MiscUtil"
], function (
    declare, array, lang, connect, Deferred, all, esriRequest, scriptRequest, Extent,Query, QueryTask, GeometryService, BufferParameters, MiscUtil
) {
    var QueryUtil = declare("QueryUtil", [], {
        createBuffer: function (params) {
            var bufDeferred = new Deferred();
            var geometryService = new GeometryService(params.geometryService);
            //setup the buffer parameters
            var bufferParams = new BufferParameters();
            bufferParams.distances = [params.bufferValue];
            bufferParams.bufferSpatialReference = params.map.spatialReference;
            bufferParams.outSpatialReference = params.map.spatialReference;
            bufferParams.unit = GeometryService[params.bufferUnit];
            bufferParams.geometries = params.inputGeometries;
            geometryService.buffer(bufferParams, function (bufferedGeometries) {
                bufDeferred.resolve(bufferedGeometries);
            }, function (err) {
                bufDeferred.reject(err);
            });
            return bufDeferred.promise;
        },
        executeQuery: function (queryParams) {
            var deferred = new Deferred();
            var queryTask = new QueryTask(queryParams.serviceUrl);
            var query = new Query();
            var alternateQuery = {};//for doing a rest request for non spatial queries only
            if (queryParams.hasOwnProperty("geometry")) {
                query.geometry = queryParams.geometry;
                if (queryParams.geometry instanceof Extent) {
                    alternateQuery.geometry = JSON.stringify(lang.clone(queryParams.geometry));
                } else {
                    alternateQuery.geometry = JSON.stringify(lang.clone(queryParams.geometry.getExtent()));
                }
                if (queryParams.hasOwnProperty("relationType")) {
                    query.spatialRelationship = Query[queryParams.relationType];
                } else {
                    query.spatialRelationship = Query["SPATIAL_REL_INTERSECTS"];
                }
            }
            if (queryParams.hasOwnProperty("queryDefinition")) {
                query.where = alternateQuery.where = queryParams.queryDefinition;
            }
            if (queryParams.hasOwnProperty("orderByFields")) {
                query.orderByFields = alternateQuery.orderByFields = queryParams.orderByFields
            }
            if (queryParams.hasOwnProperty("groupByFieldsForStatistics")) {
                query.groupByFieldsForStatistics = alternateQuery.groupByFieldsForStatistics = queryParams.groupByFieldsForStatistics
            }
            query.returnGeometry = alternateQuery.returnGeometry = (typeof (queryParams.returnGeometry) === 'undefined' || queryParams.returnGeometry) ? true : false;
            query.outFields = alternateQuery.outFields = queryParams.outFields || ['*'];
            query.geometryPrecision = alternateQuery.geometryPrecision = 2;
            if (queryParams.hasOwnProperty("map")) {
                query.outSpatialReference = queryParams.map.spatialReference;
            }
            if (!MiscUtil.hasProxySet(queryParams.serviceUrl) && !MiscUtil.isUsingApplicationProtocol(queryParams.serviceUrl) && !MiscUtil.isAlwaysUsingProxy()) {
                alternateQuery.f = "json";
                var queryUrl = queryParams.serviceUrl + "/query?";
                if (queryParams.proxyUrl) {
                    queryUrl = queryParams.proxyUrl + "?" + queryUrl;
                }
                scriptRequest(queryUrl,{
                    query: alternateQuery,
                    jsonp: 'callback'
                }).then(function (data) {
                    deferred.resolve(data);
                })
            } else {
                queryTask.execute(query).then(function (response) {
                    deferred.resolve(response);
                });
            }
            return deferred.promise;
        }
    });
    if (!_instance) {
        var _instance = new QueryUtil();
    }
    return _instance;
});