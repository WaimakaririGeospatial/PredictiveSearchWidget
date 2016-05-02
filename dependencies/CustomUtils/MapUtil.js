/*GBS - updated 16/03
 MapUtil.js  Utility class for Interrogate tools developed by GBS

 Note on how symbology is handled by this utility
-----------------------------------------------------
Symbology object is passed from different widgets like select/identify/predictivesearch etc.Symbology configs differ depending on the symbology picker used with some widgets.
Some use proper jimu/dijit/symbologypicker and some others use just color and transparancy selector.Ideally symbology config from  jimu/dijit/symbologypicker is required,
however this utility maintains the support for custom symbology configs as well .The support for symbology config based on color & transparancy picker to be phased out soon 
*/
define([
    "dojo/_base/declare",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/_base/connect",
    "dojo/Deferred",
    "esri/layers/GraphicsLayer",
    "esri/symbols/PictureMarkerSymbol",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleFillSymbol",
    "esri/geometry/Extent",
    "esri/geometry/Point",
    "esri/symbols/TextSymbol",
    "esri/symbols/Font",
    "esri/graphicsUtils",
    "dojo/_base/Color",
    "esri/geometry/screenUtils",
     './plugins/textsymbol/MultiLineTextSymbol'
], function (
    declare, array, lang, connect,Deferred, GraphicsLayer,PictureMarkerSymbol, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol, Extent,Point, TextSymbol, Font, graphicsUtils, Color, screenUtils
) {
    var MapUtil = declare("MapUtil", [], {
	    _indicaterLayerId: "interrogate-indicate-layer",
        _locateGraphicsLayerId:"locate-graphics-layer",
        _selectToolLayerId: "interrogate-select-tool-layer",
        _resultsLayerId: "interrogate-results-layer",
        disableDefaultClickHandler: function (map) {
            map.infoWindow.clearFeatures();
            map.infoWindow.hide();
            map.setInfoWindowOnClick(false);
        },
        enableDefaultClickHandler: function (map) {
            map.setInfoWindowOnClick(true);
        },
        //-------interrgate results layer------------//
        addResultsToMap: function (map, results, symbologyConfig, clearHistory, zoomToResults, zoomConfig) {
            var deferred = new Deferred();
            var resultsLayer = this.getResultsLayer(map);
            if (!resultsLayer) {
                var resultsLayer = new GraphicsLayer();
                resultsLayer.id = this._resultsLayerId;
                map.addLayer(resultsLayer);
            }
            if (clearHistory) {
                this.clearResultsFromMap(map);
            }
            var symbology = this._getSymbol(symbologyConfig);
            array.forEach(results, function (result) {
                var features = result.features;
                var geomType = result.geometryType;
                array.forEach(features, function (feature) {
                    feature.setSymbol(symbology.default[geomType])
                    resultsLayer.add(feature);
                });
            });
            if (zoomToResults) {
                this.zoomToSelectLayer(map, zoomConfig).then(function () {
                    deferred.resolve();
                });
            } else {
                deferred.resolve();
            }
            return deferred.promise;
        },
        clearResultsFromMap:function(map){
            var resultsLayer = this.getResultsLayer(map);
            if (resultsLayer) {
                resultsLayer.clear();
                resultsLayer.setInfoTemplate(null);
            }
        },
        getResultsLayer:function(map){
            var resultsLayer = map.getLayer(this._resultsLayerId);
            if (resultsLayer) {
                return resultsLayer;
            }
        },
        // -------interrogate -select tool-layer ------------------------//
        addSelectToolFeaturesToMap: function (map, results, symbologyConfig, clearHistory) {
            var selectToolLayer = this.getSelectToolLayer(map);
            if (!selectToolLayer) {
                var selectToolLayer = new GraphicsLayer();
                selectToolLayer.id = this._selectToolLayerId;
                map.addLayer(selectToolLayer)
            }
            if (clearHistory) {
                this.clearSelectToolLayerFromMap(map);
            }
            var symbology = this._getSymbol(symbologyConfig);
            array.forEach(results, function(result) {
                var features = result.features;
                var geomType = result.geometryType;
                array.forEach(features, function(feature) {
                    feature.setSymbol(symbology.default[geomType]);
                    selectToolLayer.add(feature);
                });
            });
        },
        clearSelectToolLayerFromMap: function (map) {
            var selectToolLayer = this.getSelectToolLayer(map);
            if (selectToolLayer) {
                selectToolLayer.clear();
            }
        },
        fetchToolLayerFeatures: function (map) {
            var selectToolLayer = this.getSelectToolLayer(map);
            if (selectToolLayer) {
                return selectToolLayer.graphics;
            }
        },
        getSelectToolLayer: function (map) {
            var selectToolLayer = map.getLayer(this._selectToolLayerId);
            if (selectToolLayer) {
                return selectToolLayer;
            }
        },
        //--------------locate graphics -----------------//
        addLocateGraphicsToMap: function (map, locateGraphics, symbologyConfig, clearHistory, zoomToFeature) {
            var locateGraphicsLayer = this.getLocateGraphicsLayer(map);
            if (!locateGraphicsLayer) {
                var locateGraphicsLayer = new GraphicsLayer();
                locateGraphicsLayer.id = this._locateGraphicsLayerId;
                map.addLayer(locateGraphicsLayer);
            }
            if (clearHistory) {
                this.clearLocateGraphicsFromMap(map);
            }
            var symbology = this._getSymbol(symbologyConfig);
            array.forEach(locateGraphics, function (graphicObject) {
                var features = graphicObject.features;
                var type = graphicObject.symbologyType;
                array.forEach(features, function (feature) {
                    feature.setSymbol(symbology.default[type]);
                    locateGraphicsLayer.add(feature);
                })
            })
            if (zoomToFeature) {
                this.zoomToFeatures(map, locateGraphics[0].features);
            }
            
        },
        clearLocateGraphicsFromMap:function(map){
            var locateGraphicsLayer = this.getLocateGraphicsLayer(map);
            if (locateGraphicsLayer) {
                locateGraphicsLayer.clear();
            }
        },
        fetchLocateGraphics: function (map) {
            var locateGraphicsLayer = this.getLocateGraphicsLayer(map);
            if (locateGraphicsLayer) {
                return locateGraphicsLayer.graphics;
            }
        },
        getLocateGraphicsLayer:function(map){
            var locateGraphicsLayer = map.getLayer(this._locateGraphicsLayerId);
            if (locateGraphicsLayer) {
                return locateGraphicsLayer;
            }
        },
		//----------------------indicator graphics----------------------------//
		addIndicatorGraphicsToMap:function(map, centroidGraphic, symbologyConfig, clearHistory){
			var indicatorLayer =  this.getIndicatorGraphicsLayer(map);
            if (!indicatorLayer) {
                indicatorLayer = new GraphicsLayer();
                indicatorLayer.id = this._indicaterLayerId;
                map.addLayer(indicatorLayer);
            }
            if (clearHistory) {
                this.clearIndicatorGraphicsFromMap(map);
            }
            var pointSymbol = new SimpleMarkerSymbol();
            pointSymbol.color = new Color("red");
            pointSymbol.outline = new SimpleLineSymbol("solid", new Color("yellow"), 2);

            var testSymbol = {
                point: pointSymbol
            };
            //var symbology = this._getSymbol(symbologyConfig);
            //var symbology = this._getPointSymbology(testSymbol);
            var symbology = this._getPointSymbology(symbologyConfig);
            centroidGraphic.setSymbol(symbology);
            indicatorLayer.add(centroidGraphic);
			
		},
         getIndicatorGraphicsLayer:function(map){
			var indicatorLayer = map.getLayer(this._indicaterLayerId);
            if (indicatorLayer) {
                return indicatorLayer;
            }
			 
			 
		 },
		 clearIndicatorGraphicsFromMap:function(map){
            var indicatorLayer =  this.getIndicatorGraphicsLayer(map);
            if (indicatorLayer) {
                indicatorLayer.clear();
                indicatorLayer.setInfoTemplate(null);
            }
        },
        
        //---------------------- -----------------//
        _getSymbol: function (symbology) {
            var symbology = {
                'default': {
                    'point': this._getPointSymbology(symbology, 'default'),
                    'polyline': this._getLineSymbology(symbology, 'default'),
                    'polygon': this._getPolygonSymbology(symbology, 'default'),
                    'text': this._getTextSymbology(symbology, 'default')
                },
                'highlight': {
                    'point': this._getPointSymbology(symbology, 'highlight'),
                    'polyline': this._getLineSymbology(symbology, 'highlight'),
                    'polygon': this._getPolygonSymbology(symbology, 'highlight')
                }
            };
            //aliases
            symbology.default.esriGeometryPoint    = symbology.default.point;
            symbology.default.esriGeometryPolyline = symbology.default.polyline;
            symbology.default.esriGeometryPolygon = symbology.default.polygon;
            return symbology;
        },
        _getPointSymbology: function (sym, context) {
            //1.check if the symbology config is the true representation of full symbology
            var pointJson  = sym.point;
            if (pointJson && (pointJson.type === 'esriSMS' || pointJson.type === 'esriPMS')) {
                var pointSymbol;
                if (pointJson.type === 'esriSMS') {
                    pointSymbol = new SimpleMarkerSymbol(pointJson);
                } else if (pointJson.type === 'esriPMS') {
                    pointSymbol = new PictureMarkerSymbol(pointJson);
                }
                return pointSymbol;
            } else {
                //custom symbol configs
                var obj = this._calculateSymbologyParams(sym, context);
                var dojoColour = obj.colour;
                var opacity = obj.opacity;
                var rgbColor = dojoColour.toRgb();
                rgbColor.push(opacity);
                var size = obj.size;
                var thickness = obj.thickness;
                return new SimpleMarkerSymbol("circle",
                     size,
                     new SimpleLineSymbol(
                         SimpleLineSymbol.STYLE_SOLID,
                         dojoColour,
                         thickness
                     ),
                     new Color(rgbColor)
                 );
            }

            
        },
        _getLineSymbology: function (sym, context) {
            //1.check if the symbology config is the true representation of full symbology
            var polyLineJson = sym.polyline;
            if (polyLineJson && polyLineJson.type === "esriSLS") {
                return new SimpleLineSymbol(polyLineJson);
            } else {
                //custom config
                var obj = this._calculateSymbologyParams(sym, context);
                var dojoColour = obj.colour;
                var thickness = obj.thickness;
                return new SimpleLineSymbol(
                    SimpleLineSymbol.STYLE_SOLID,
                    dojoColour,
                    thickness
                );
            }
           
        },
        _getPolygonSymbology: function (sym, context) {
            var polygonJson = sym.polygon;
            if (polygonJson && polygonJson.type === "esriSFS") {
                return new SimpleFillSymbol(polygonJson);
            } else {
                var obj = this._calculateSymbologyParams(sym, context);
                var dojoColour = obj.colour;
                var opacity = obj.opacity;
                var rgbColor = dojoColour.toRgb();
                rgbColor.push(opacity);
                return new SimpleFillSymbol(
                   SimpleFillSymbol.STYLE_SOLID,
                   this._getLineSymbology(sym, context),
                   new Color(rgbColor)
               );
            }
        },
        _getTextSymbology:function(sym){
            var obj = this._calculateSymbologyParams(sym);
            var fontSize = obj.fontSize;
            var fontColour = obj.fontColour;
            var fontFamily = obj.fontFamily;
            var horizontalAlign = obj.horizontalAlignment
            var fontText = obj.fontText;
            var textOffset = obj.textOffset;

            var font = new Font(fontSize + "px");
            font.setFamily(fontFamily);

            var textSymbol = new TextSymbol(fontText).
                                    setColor(fontColour).
                                    setFont(font).
                                    setHorizontalAlignment(horizontalAlign).
                                    setOffset(textOffset[0], textOffset[1]);
            return textSymbol;
        },
        _calculateSymbologyParams: function (sym, context) {
            var colour = sym.fillColour;
            var fontColour = sym.fontColour || sym.fillColour;
            var pointSize = sym.size || sym.pointSize || 5;
            var fontSize = sym.fontSize || sym.size ;
            var thickness = sym.thickness || 2;
            var transparancy = sym.fillTransparency || 0;
            var fontText = sym.fontText || null;
            var fontFamily = sym.fontFamily || 'Serif';

            if (context === 'highlight') {
                colour = sym.highlightColour || sym.fillColour;
                transparancy = sym.highlightTransparency || sym.fillTransparency;
            }
            var opacity = ((100 - parseInt(transparancy)) / 100);
            var dojoColour = new Color(colour);
            var fontDojoColour = new Color(fontColour);
            var horizontalAlignment = sym.horizontalAlignment || "center";
            var textOffset = sym.textOffset || [0, 0];
            return {
                colour: dojoColour,
                opacity: opacity,
                size: pointSize,
                thickness:thickness,
                fontColour: fontColour,
                fontSize: fontSize,
                fontText: fontText,
                fontFamily:fontFamily,
                horizontalAlignment: horizontalAlignment,
                textOffset: textOffset
            };
            
        },
        highlightFeature: function (map,feature, symbologyConfig) {
            var highlightedFeatures = this.getHighlightedFeatures(map);
            array.forEach(highlightedFeatures, lang.hitch(this, function (feature) {
                this.unhighlightFeature(feature, symbologyConfig);
            }));

            var symbology = this._getSymbol(symbologyConfig);
            feature.setSymbol(symbology.highlight[feature.geometry.type]);
            feature.attributes.highlight = true;
        },
        unhighlightFeature:function(feature,symbologyConfig){
            var symbology = this._getSymbol(symbologyConfig);
            feature.setSymbol(symbology.default[feature.geometry.type]);
            feature.attributes.highlight = false;
        },
        unhighlightAll: function (map, symbologyConfig) {
            var symbology = this._getSymbol(symbologyConfig);
            array.forEach(this.getResultsLayer(map).graphics, function (feature) {
                if (feature.attributes.highlight) {
                    feature.attributes.highlight = false;
                    feature.setSymbol(symbology.default[feature.geometry.type]);
                }
            })
        },
        getHighlightedFeatures: function (map) {
            return array.filter(this.getResultsLayer(map).graphics, function (feature) {
                return feature.attributes.highlight;
            })
        },
        zoomToFeatures: function (map, features) {
            var extent;
            if (features.length === 1 && features[0].geometry.type === 'point') {
                extent = this.pointToExtent(features[0].geometry, map)
                map.setExtent(extent);
            } else {
                extent = graphicsUtils.graphicsExtent(features);
                map.setExtent(extent, true);
            }
                
        },
        zoomToSelectLayer: function (map, zoomConfig) {
            var extent;
            var deferred = new Deferred();
            var graphics = this.getResultsLayer(map).graphics;
            if (zoomConfig && (zoomConfig.zoomToScale || zoomConfig.zoomToFeature)) {
                if (zoomConfig.zoomToScale && zoomConfig.scaleValue > 0) {
                    if (graphics.length === 1 && graphics[0].geometry.type === 'point') {
                        extent = this.pointToExtent(graphics[0].geometry, map)
                    } else {
                        extent = graphicsUtils.graphicsExtent(graphics);
                    }
                    map.centerAt(extent.getCenter()).then(lang.hitch(this, function () {
                        map.setScale(zoomConfig.scaleValue).then(function () {
                            deferred.resolve();
                        });
                    }));
                } else if (zoomConfig.zoomToFeature && zoomConfig.extentPadding > 0) {
                    extent = graphicsUtils.graphicsExtent(graphics);
                    //From API reference
                    //extent.expand(factor)
                    //Expands the extent by the factor given. For example, a value of 1.5 will be 50% bigger. so the index = 1.5/50 = .03
                    var factor = (0.03 * Number(zoomConfig.extentPadding));
                    map.setExtent(extent.expand(factor), true).then(function () {
                        deferred.resolve();
                    });
                } else {
                    this._defaultZoomToLayer(map).then(function () {
                        deferred.resolve();
                    });
                }
            } else {
                this._defaultZoomToLayer(map).then(function () {
                    deferred.resolve();
                });
            }
            return deferred.promise;
        },
        _defaultZoomToLayer: function (map) {
            var extent;
            var deferred = new Deferred();
            var graphics = this.getResultsLayer(map).graphics;
            if (graphics.length === 1 && graphics[0].geometry.type === 'point') {
                extent = this.pointToExtent(graphics[0].geometry, map)
                map.setExtent(extent).then(function () {
                    deferred.resolve();
                });
            } else {
                extent = graphicsUtils.graphicsExtent(graphics);
                map.setExtent(extent, true).then(function () {
                    deferred.resolve();
                });
            }
            return deferred.promise;
        },
        pointToExtent: function (point, map) {
            // Need to specify a pixel tolerance
            var toleranceInPixel = 12; // Can make this configurable later if needed

            //calculate map coords represented per pixel
            var pixelWidth = map.extent.getWidth() / map.width;

            //calculate map coords for tolerance in pixel
            var toleranceInMapCoords = toleranceInPixel * pixelWidth;

            var xMin = point.x - toleranceInMapCoords;
            var yMin = point.y - toleranceInMapCoords;
            var xMax = point.x + toleranceInMapCoords;
            var yMax = point.y + toleranceInMapCoords;

            //calculate & return computed extent
            var extent = new Extent(xMin, yMin, xMax, yMax, map.spatialReference);

            return extent;
        }
    });
    if (!_instance) {
        var _instance = new MapUtil();
    }
    return _instance;
});