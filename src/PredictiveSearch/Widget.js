///////////////////////////////////////////////////////////////////////////
// Copyright © 2015 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/array',
    'dojo/_base/html',
    'dojo/Deferred',
    'dojo/when',
    'dojo/on',
    'dojo/aspect',
    'dojo/promise/all',
     'dojo/query',
    'dojo/dom-attr',
    'dojo/keys',
    'dojo/promise/all',
    'dojo/dom-construct',
    'dijit/form/CheckBox',
    'jimu/BaseWidget',
    'jimu/LayerInfos/LayerInfos',
    'jimu/utils',
    'esri/dijit/Search',
    'esri/tasks/locator',
    'esri/layers/FeatureLayer',
    'esri/InfoTemplate',
    'esri/lang',
    'esri/graphic',
    'esri/request',
    './utils',
    'dojo/i18n!esri/nls/jsapi',

    'jimu/PanelManager',
    'jimu/WidgetManager',
    'jimu/dijit/Message',

    'jimu/CustomUtils/LayerUtil',
    'jimu/CustomUtils/MapUtil',
    'jimu/CustomUtils/MiscUtil',
    './CustomSearchUtil',
    'dojo/NodeList-dom',
    './SearchMixin'
],
  function (declare, lang, array, html, Deferred, when, on, aspect, all, domQuery, domAttr, keys, all, domConstruct, CheckBox,
    BaseWidget, LayerInfos, jimuUtils, Search, Locator,
    FeatureLayer, InfoTemplate, esriLang, Graphic, esriRequest, utils, esriBundle, PanelManager, WidgetManager, Message, LayerUtil, MapUtil, MiscUtil, CustomSearchUtil
    ) {
      //To create a widget, you need to derive from BaseWidget.
      return declare([BaseWidget], {
          name: 'PredictiveSearch',
          baseClass: 'jimu-widget-search',
          searchDijit: null,
          searchResults: null,
          _keyboardInputDelay: 300,
          _showNoResultsWidgetWarning: true,
          _resultsPanelConfigured: false,
          _resultsWidgetName: null,
          _resultsInPanel: false,
          _resultsInPopup: false,
          _noResultsDisplay: false,
          _excludedFields: ["OBJECTID", "GEOMETRY", "GLOBALID", "SHAPE"],
          postCreate: function () {
              if (this.closeable || !this.isOnScreen) {
                  html.addClass(this.searchNode, 'default-width-for-openAtStart');
              }
              this.layerUtil = new LayerUtil(this.map);
          },

          startup: function () {
              this.inherited(arguments);
              this._selectResultsView();

              if (!(this.config && this.config.sources)) {
                  this.config.sources = [];
              }
              LayerInfos.getInstance(this.map, this.map.itemInfo)
                .then(lang.hitch(this, function (layerInfosObj) {
                    this.layerInfosObj = layerInfosObj;
                    utils.setMap(this.map);
                    utils.setLayerInfosObj(this.layerInfosObj);
                    utils.setAppConfig(this.appConfig);
                    when(utils.getConfigInfo(this.config)).then(lang.hitch(this, function (config) {
                        if (!this.domNode) {
                            return;
                        }
                        var searchSources = this._convertConfig(config);
                        this._createCustomLayerObjectForSearchItems(searchSources).then(lang.hitch(this, function () {
                            this.searchDijit = new Search({
                                activeSourceIndex: searchSources.length === 1 ? 0 : 'all',
                                autoNavigate: false,
                                enableHighlight: false,
                                autoSelect: true,
                                countryCode: "NZ",
                                enableButtonMode: false,
                                enableLabel: false,
                                enableInfoWindow: false,
                                showInfoWindowOnSelect: false,
                                enableSuggestions: false,
                                map: this.map,
                                sources: searchSources,
                                theme: 'arcgisSearch',
                                minCharacters: this.config.minCharToSearch,
                                suggestionDelay: 500
                            });
                            html.place(this.searchDijit.domNode, this.searchNode);
                            this.searchDijit.startup();
                            this._resetSearchDijitStyle();

                            this.own(
                              this.searchDijit.watch(
                                'activeSourceIndex',
                                lang.hitch(this, '_onSourceIndexChange')
                              )
                            );

                            this.own(
                              on(this.searchDijit.domNode, 'click', lang.hitch(this, '_onSearchDijitClick'))
                            );
                            this.own(on(this.searchDijit.inputNode, "keyup", lang.hitch(this, function (e) {
                                if (e.keyCode !== keys.ENTER) {
                                    if (this.searchInputTimeout) {
                                        window.clearTimeout(this.searchInputTimeout);
                                    }
                                    this.searchInputTimeout = window.setTimeout(lang.hitch(this, function () {
                                        var minLimit = Number(this.config.minCharToSearch);
                                        var activeSource = this.searchDijit.activeSource;
                                        var searchString = this.searchDijit.get("value");
                                        if (searchString.length >= minLimit) {
                                            this._executeSearch();
                                        } else {
                                            this._hideResultMenu();
                                            this._hideSuggestMenu();
                                        }
                                    }, this._keyboardInputDelay));
                                }
                            })));
                            // iam here check the need to create custom handling of search & suggest
                            this.own(
                              on(this.searchDijit, 'search-results', lang.hitch(this, '_onSearchResults'))
                            );
                            this.own(
                              on(this.searchDijit, 'suggest-results', lang.hitch(this, '_onSuggestResults'))
                            );
                            this.own(
                             on(this.searchDijit, 'suggest-results-show', lang.hitch(this, '_onSuggestResultsShow'))
                           );
                            this.own(
                              on(this.searchDijit, 'select-result', MiscUtil.debounce(200,lang.hitch(this, '_onSelectResult')))
                            );

                            /*-------- mouse over the predictive search result hook----------*/
                            this.own(
                             //on(this.searchResultsNode, 'li:mouseover', lang.hitch(this, function () { console.log("Mouse Over in searcg") }))
                           );
                            this.own(
                             //on(this.searchResultsNode, 'li:mouseout', lang.hitch(this, function () { console.log("Mouseout in search") }))
                           );

                            //If configured to use Indicator, register mouse events
                            if (this.config.indicatorIsVisible) {
                                this.own(
                                 //on(this.searchDijit.suggestionsNode, 'li:mouseover', lang.hitch(this, function (e) { console.log("Mouse Over in Suggestions") }))
                                 on(this.searchDijit.suggestionsNode, 'li:mouseover', lang.hitch(this, '_onMouseOverResult'))
                               );
                                this.own(
                                 //on(this.searchDijit.suggestionsNode, 'li:mouseout', lang.hitch(this, function (e) { console.log("Mouseout in Suggestions") }))
                                 on(this.searchDijit.suggestionsNode, 'li:mouseout', lang.hitch(this, function () {
                                     MapUtil.clearIndicatorGraphicsFromMap(this.map)
                                 }))
                               );
                            }
                            
                            /*-------- ---------------------------------------------------------*/

                            this.own(
                              on(this.searchResultsNode, 'li:click', lang.hitch(this, '_onSelectSearchResult'))
                            );
                            this.own(on(
                              this.searchResultsNode,
                              '.show-all-results:click',
                              lang.hitch(this, '_showResultMenu')
                            ));
                            this.own(
                              on(window.document, 'click', lang.hitch(this, function (e) {
                                  if (!html.isDescendant(e.target, this.searchResultsNode)) {
                                      this._hideResultMenu();
                                      this._resetSelectorPosition('.show-all-results');
                                  }
                              }))
                            );
                            this.own(
                              on(this.searchDijit, 'clear-search', lang.hitch(this, '_onClearSearch'))
                            );
                            this.own(
                                aspect.after(this.searchDijit, "_sourcesEvent", lang.hitch(this, function () {
                                    //as each search source change resets the version info which is intially set
                                    if (this.config.displayManifestInfo) {
                                        this._setVersionTitle();
                                    }
                                }))
                            )
                            if (this.config.displayManifestInfo) {
                                this._setVersionTitle();
                            }

                        }));
                    }));
                }));
          },
          _onMouseOverResult: function (evt) {
              var target = evt.target;
              var result = null;
              var dataSourceIndex = html.getAttr(target, 'data-source-index');
              var dataIndex = parseInt(html.getAttr(target, 'data-index'), 10);
              // var sources = this.searchDijit.get('sources');
              //console.log(this.searchDijit.suggestResults);

              if (dataSourceIndex !== 'all') {
                  dataSourceIndex = parseInt(dataSourceIndex, 10);
              }
              //if (this.searchResults && this.searchResults[dataSourceIndex] && this.searchResults[dataSourceIndex][dataIndex]) {
                //result = this.searchResults[dataSourceIndex][dataIndex];
              //}
              if (this.searchDijit.suggestResults && this.searchDijit.suggestResults[dataSourceIndex] && this.searchDijit.suggestResults[dataSourceIndex][dataIndex]) {
                  result = this.searchDijit.suggestResults[dataSourceIndex][dataIndex];
              }
              if (result != null && result.hasOwnProperty("feature")) {
                  if (result.feature.hasOwnProperty("geometry")) {
                     this._plotCentroid(result);
                  }
              }
          },
          _plotCentroid: function (evt) {
              //var pointSymbol = new SimpleMarkerSymbol();
              //pointSymbol.color = new Color("red");
              //pointSymbol.outline = new SimpleLineSymbol("solid", new Color("yellow"), 2);

              //var testSymbol = {
              //    point: pointSymbol
              //};
              
              var graphic;
              //if (evt.hasOwnProperty("feature")) {
                  switch (evt.feature.geometry.type) {
                      case "point":
                          graphic = evt.feature;
                          break;
                      case "polyline":
                          graphic = new Graphic();
                          graphic.geometry = evt.feature.geometry.getExtent().getCenter();
                          break;
                      case "polygon":
                          graphic = new Graphic();
                          graphic.geometry = evt.feature.geometry.getCentroid();
                  }
                  //MapUtil.addIndicatorGraphicsToMap(this.map, graphic, testSymbol, true);
                  //MapUtil.addIndicatorGraphicsToMap(this.map, graphic, null, true);
              //}
                  var indicatorSymbology = null;
                  if (this.config.indicatorSymbology) {
                      indicatorSymbology = this.config.indicatorSymbology;
                  }
                  MapUtil.addIndicatorGraphicsToMap(this.map, graphic, indicatorSymbology, true);

          },
          _selectResultsView: function () {
              if (this.config.resultsDisplay) {
                  var displayConfig = this.config.resultsDisplay;
                  if (displayConfig.displayResultsPanel) {
                      this._resultsInPanel = true;
                      this._checkResultsWidgetExists();
                  } else if (displayConfig.displayPopup) {
                      this._resultsInPopup = true;
                  } else {
                      this._noResultsDisplay = true;
                  }
              }

          },
          _checkResultsWidgetExists: function () {
              var resultsWidgetName;
              var allWidgets = []
              if (this.appConfig.widgetOnScreen) {
                  allWidgets = [].concat(this.appConfig.widgetOnScreen.widgets);
              }
              if (this.appConfig.widgetPool) {
                  allWidgets = allWidgets.concat(this.appConfig.widgetPool.widgets);
              }
              array.some(allWidgets, lang.hitch(this, function (widget) {
                  var isResultsWidgetConfigured = widget.manifest ? (widget.manifest.hasOwnProperty("properties") ? (widget.manifest.properties.isResultsWidget ? true : false) : false) : false;
                  if (isResultsWidgetConfigured) {
                      this._resultsPanelConfigured = true;
                      this._resultsWidgetName = widget.name;
                  }
              }));
          },
          setPosition: function () {
              this._resetSearchDijitStyle();
              this.inherited(arguments);
          },
          _updateSearchSources: function (sources) {
              array.forEach(sources, function (source) {
                  if (source.hasOwnProperty("featureLayer")) {
                      this.layerUtil.createCustomLayerObjectForSingleFeatureLayer(source.featureLayer).then(function () {
                          var customLayerObject = this.layerUtil.fetchLayerObjectByLayer(source.featureLayer);
                          source.customLayerObject = customLayerObject;
                      });
                  }
              })

          },
          resize: function () {
              this._resetSearchDijitStyle();
          },

          _resetSearchDijitStyle: function () {
              html.removeClass(this.domNode, 'use-absolute');
              if (this.searchDijit && this.searchDijit.domNode) {
                  html.setStyle(this.searchDijit.domNode, 'width', 'auto');
              }

              setTimeout(lang.hitch(this, function () {
                  if (this.searchDijit && this.searchDijit.domNode) {
                      var box = html.getMarginBox(this.domNode);
                      var sourcesBox = html.getMarginBox(this.searchDijit.sourcesBtnNode);
                      var submitBox = html.getMarginBox(this.searchDijit.submitNode);
                      var style = null;
                      if (box.w) {
                          html.setStyle(this.searchDijit.domNode, 'width', box.w + 'px');
                          html.addClass(this.domNode, 'use-absolute');


                          if (isFinite(sourcesBox.w) && isFinite(submitBox.w)) {
                              if (window.isRTL) {
                                  style = {
                                      left: submitBox.w + 'px',
                                      right: sourcesBox.w + 'px'
                                  };
                              } else {
                                  style = {
                                      left: sourcesBox.w + 'px',
                                      right: submitBox.w + 'px'
                                  };
                              }
                              var inputGroup = domQuery('.searchInputGroup', this.searchDijit.domNode)[0];

                              if (inputGroup) {
                                  html.setStyle(inputGroup, style);
                                  var groupBox = html.getMarginBox(inputGroup);
                                  var extents = html.getPadBorderExtents(this.searchDijit.inputNode);
                                  html.setStyle(this.searchDijit.inputNode, 'width', groupBox.w - extents.w + 'px');
                              }

                          }
                      }
                  }
              }), 50);
          },
          _convertConfig: function (config) {
              var searchSources = array.map(config.sources, lang.hitch(this, function (source) {
                  if (source && source.url && source.type === 'locator') {
                      var template = new InfoTemplate('&nbsp;', null);
                      return {
                          locator: new Locator(source.url || ""),
                          outFields: ["*"],
                          singleLineFieldName: source.singleLineFieldName || "",
                          name: source.name || "",
                          placeholder: source.placeholder || "",
                          countryCode: source.countryCode || "",
                          maxResults: source.maxResults || 6,
                          maxSuggestions: source.maxResults || 6,
                          maxResultsAlias:source.maxResults  || 6,
                          url: source.url,
                          infoTemplate: template,
                          zoomMethod: source.zoomMethod
                      };
                  } else if (source && source.url && source.type === 'query') {
                      var flayer = new FeatureLayer(source.url || null, {
                          outFields: ["*"]
                      });
                      var template = this._getInfoTemplate(flayer, source, source.displayField);
                      return {
                          featureLayer: flayer,
                          outFields: ["*"],
                          searchFields: source.searchFields.length > 0 ? source.searchFields : ["*"],
                          displayField: source.displayField || "",
                          exactMatch: !!source.exactMatch,
                          name: source.name || "",
                          placeholder: source.placeholder || "",
                          maxResults: source.maxResults || 6,
                          maxSuggestions: source.maxResults || 6,
                          maxResultsAlias: source.maxResults || 6,
                          infoTemplate: template,
                          url: source.url.replace("FeatureServer", "MapServer"),
                          zoomMethod: source.zoomMethod
                      };
                  } else if (source && source.url && source.type === 'custom') {
                      var flayer = new FeatureLayer(source.geometrySourceUrl || null, {
                          outFields: ["*"]
                      });
                      var template = this._getInfoTemplate(flayer, source);
                      var obj = {
                          customSource: true,
                          displayFields: source.displayFields || "",
                          name: source.name || "",
                          placeholder: source.placeholder || "",
                          infoTemplate: template,
                          url: source.url.replace("FeatureServer", "MapServer"),
                          maxResults: source.maxResults || 6,
                          maxSuggestions: source.maxResults || 6,
                          maxResultsAlias: source.maxResults || 6,
                          geometryQuery: source.geometrySourceUrl.length > 0 ? true : false,
                          extendedQuery: source.extendedQueryUrl.length > 0 ? true : false,
                          zoomMethod: source.zoomMethod
                      };
                      lang.mixin(obj, source);
                      return obj;
                  } else {
                      return {};
                  }
              }));

              return searchSources;
          },

          _getInfoTemplate: function (fLayer, source, displayField) {
              var layerInfo = this.layerInfosObj.getLayerInfoById(source.layerId);
              var template = layerInfo && layerInfo.getInfoTemplate();
              if (layerInfo && template) {
                  return template;
              } else {
                  template = new InfoTemplate();
                  template.setTitle('&nbsp;');
                  if (source.hasOwnProperty("featureLayer")) {
                      template.setContent(lang.hitch(this, '_formatContent', source.name, fLayer, displayField, []));
                  }
                  return template;
              }
          },

          _formatContent: function (sourceName, fLayer, displayField, fields, graphic) {
              var content = "";
              if (graphic && graphic.attributes) {
                  var fields = (fields.length > 0) ? fields : (fLayer ? fLayer.fields : []);
                  var typeIdField = fLayer ? fLayer.typeIdField : "";
                  var types = fLayer ? fLayer.types : [];
                  var aliasAttrs = this._getFormatedAliasAttrs(lang.clone(graphic.attributes), fields, typeIdField, types);
                  var displayValue = graphic.attributes[displayField] || displayField;
                  content += '<div class="esriViewPopup">' +
                    '<div class="mainSection">' +
                    (esriLang.isDefined(displayValue) ?
                      ('<div class="header">' + sourceName + ': ' + displayValue + '</div>') : "") +
                    '<div class="hzLine"></div>' +
                    '<div>' +
                    '<table class="attrTable" cellpading="0" cellspacing="0">' +
                    '<tbody>';
                  for (var p in aliasAttrs) {
                      if (aliasAttrs.hasOwnProperty(p)) {
                          // content += p + ": " + aliasAttrs[p] + "</br>";
                          content += '<tr valign="top">' +
                            '<td class="attrName">' + p + '</td>' +
                            '<td class="attrValue">' + aliasAttrs[p] + '</td>' +
                            '</tr>';
                      }
                  }
                  content += '</tbody>' +
                    '</table>' +
                    '</div>' +
                    '<div class="break"></div>' +
                    '</div>';
              }

              return content;
          },
          _getFormatedAliasAttrs: function (attrs, fields, typeIdField, types) {
              var aliasAttrs = {};
              array.forEach(fields, lang.hitch(this, function (_field, i) {
                  var isCodeValue = !!(_field.domain && _field.domain.type === 'codedValue');
                  var isDate = _field.type === "esriFieldTypeDate";
                  var isTypeIdField = typeIdField && (_field.name === typeIdField);

                  if (fields[i].type === "esriFieldTypeString") {
                      aliasAttrs[_field.alias] = this.urlFormatter(attrs[_field.name]);
                  } else if (fields[i].type === "esriFieldTypeDate") {
                      aliasAttrs[_field.alias] = this.dateFormatter(attrs[_field.name]);
                  } else if (fields[i].type === "esriFieldTypeDouble" ||
                    fields[i].type === "esriFieldTypeSingle" ||
                    fields[i].type === "esriFieldTypeInteger" ||
                    fields[i].type === "esriFieldTypeSmallInteger") {
                      aliasAttrs[_field.alias] = this.numberFormatter(attrs[_field.name]);
                  }

                  if (isCodeValue) {
                      aliasAttrs[_field.alias] = this.getCodeValue(_field.domain, attrs[_field.name]);
                  } else if (!isCodeValue && !isDate && !isTypeIdField) {
                      // Not A Date, Domain or Type Field
                      // Still need to check for codedType value
                      aliasAttrs[_field.alias] = _field.alias in aliasAttrs ?
                        aliasAttrs[_field.alias] : attrs[_field.name];
                      aliasAttrs[_field.alias] = this.getCodeValueFromTypes(
                        _field,
                        typeIdField,
                        types,
                        attrs,
                        aliasAttrs
                      );
                  }
              }));
              return aliasAttrs;
          },

          getCodeValue: function (domain, v) {
              for (var i = 0, len = domain.codedValues.length; i < len; i++) {
                  var cv = domain.codedValues[i];
                  if (v === cv.code) {
                      return cv.name;
                  }
              }
              return null;
          },

          urlFormatter: function (str) {
              if (str) {
                  var s = str.indexOf('http:');
                  if (s === -1) {
                      s = str.indexOf('https:');
                  }
                  if (s > -1) {
                      if (str.indexOf('href=') === -1) {
                          var e = str.indexOf(' ', s);
                          if (e === -1) {
                              e = str.length;
                          }
                          var link = str.substring(s, e);
                          str = str.substring(0, s) +
                            '<A href="' + link + '" target="_blank">' + this.nls.more + '</A>' +
                            str.substring(e, str.length);
                      }
                  }
              }
              return str || "";
          },

          dateFormatter: function (str) {
              if (str) {
                  var sDateate = new Date(str);
                  str = jimuUtils.localizeDate(sDateate, {
                      fullYear: true
                  });
              }
              return str || "";
          },

          numberFormatter: function (num) {
              if (typeof num === 'number') {
                  var decimalStr = num.toString().split('.')[1] || "",
                    decimalLen = decimalStr.length;
                  num = jimuUtils.localizeNumber(num, {
                      places: decimalLen
                  });
                  return '<span class="jimu-numeric-value">' + (num || "") + '</span>';
              }
              return num;
          },

          getCodeValueFromTypes: function (field, typeIdField, types, obj, aliasAttrs) {
              var codeValue = null;
              if (typeIdField && types && types.length > 0) {
                  var typeCheck = array.filter(types, lang.hitch(this, function (item) {
                      // value of typeIdFild has been changed above
                      return item.name === obj[typeIdField];
                  }));

                  if (typeCheck && typeCheck.domains &&
                    typeCheck.domains[field.name] && typeCheck.domains[field.name].codedValues) {
                      codeValue = this.getCodeValue(
                        typeCheck.domains[field.name],
                        obj[field.name]
                      );
                  }
              }
              var _value = codeValue !== null ? codeValue : aliasAttrs[field.alias];
              return _value || isFinite(_value) ? _value : "";
          },

          _resetSelectorPosition: function (cls) {
              var layoutBox = html.getMarginBox(window.jimuConfig.layoutId);
              domQuery(cls, this.domNode).forEach(lang.hitch(this, function (menu) {
                  var menuPosition = html.position(menu);
                  if (menuPosition.y + menuPosition.h > layoutBox.h) {
                      html.setStyle(menu, 'top', (-menuPosition.h) + 'px');
                  }
              }));
          },

          _onSourceIndexChange: function (fn, previousSourceIndex, selectedSourceIndex) {
              if (this.searchDijit.value) {
                  this._executeSearch(selectedSourceIndex)
              }
          },

          _onSearchDijitClick: function () {
              this._resetSelectorPosition('.searchMenu');
          },

          _onSearchResults: function (evt) {
              var sources = this.searchDijit.get('sources');
              var activeSourceIndex = this.searchDijit.get('activeSourceIndex');
              var value = this.searchDijit.get('value');
              var htmlContent = "";
              var results = evt.results;
              var _activeSourceNumber = null;
              if (results && evt.numResults > 0) {
                  html.removeClass(this.searchDijit.containerNode, 'showSuggestions');

                  this.searchResults = results;
                  htmlContent += '<div class="show-all-results jimu-ellipsis" title="' +
                    this.nls.showAll + '">' +
                    this.nls.showAllResults + '<strong >' + value + '</strong></div>';
                  htmlContent += '<div class="searchMenu" role="menu">';
                  for (var i in results) {
                      if (results[i] && results[i].length) {
                          var name = sources[parseInt(i, 10)].name;
                          if (sources.length > 1 && activeSourceIndex === 'all') {
                              htmlContent += '<div title="' + name + '" class="menuHeader">' + name + '</div>';
                          }
                          htmlContent += "<ul>";
                          var partialMatch = value;
                          var r = new RegExp("(" + partialMatch + ")", "gi");
                          var maxResults = sources[i].maxResults;

                          for (var j = 0, len = results[i].length; j < len && j < maxResults; j++) {
                              var untitledResult = (esriBundle && esriBundle.widgets &&
                                esriBundle.widgets.Search && esriBundle.widgets.Search.main &&
                                esriBundle.widgets.Search.main.untitledResult) || "Untitled";
                              var text = esriLang.isDefined(results[i][j].name) ?
                                results[i][j].name : untitledResult;

                              htmlContent += '<li title="' + text + '" data-index="' + j +
                                '" data-source-index="' + i + '" role="menuitem" tabindex="0">' +
                                text.toString().replace(r, "<strong >$1</strong>") + '</li>';
                          }
                          htmlContent += '</ul>';

                          if (evt.numResults === 1) {
                              _activeSourceNumber = i;
                          }
                      }
                  }
                  htmlContent += "</div>";
                  this.searchResultsNode.innerHTML = htmlContent;
                  //get the num of results of the type of search
                  //if count is below maxResultsAlias, no more data
                  //if count is above maxResultsAlias , no more data
                  //if count is equal maxResultsAlias more data
                  // //if its the case for more data link, _activateMoreDataSearch called else _restoreDefaultSearch called
                  var moreDataLinkRequired = false;
                  if (activeSourceIndex === 'all') {
                      var keys = Object.keys(results);
                      array.some(keys, lang.hitch(this, function (key) {
                          var configuredMaxResults = this.searchDijit.sources[key].maxResultsAlias;
                          var currentDataMaxResults = this.searchDijit.sources[key].maxResults;
                          if (this.config.moreDataMaxLimit > configuredMaxResults) {
                              if (results[key].length == configuredMaxResults) {
                                  if (configuredMaxResults < this.config.moreDataMaxLimit) {
                                      moreDataLinkRequired = true;
                                      return false;
                                  }
                              }
                          }
                      }));
                  } else {
                      var configuredMaxResults = this.searchDijit.sources[activeSourceIndex].maxResultsAlias;
                      var currentDataMaxResults = this.searchDijit.sources[activeSourceIndex].maxResults;
                      if (this.config.moreDataMaxLimit > configuredMaxResults) {
                          if (results[activeSourceIndex].length == configuredMaxResults) {
                              if (configuredMaxResults < this.config.moreDataMaxLimit) {
                                  moreDataLinkRequired = true;
                              }
                          }
                      } else {
                          moreDataLinkRequired = false;
                      }
                  }
                  this._restoreDefaultSearch()  
                  if (moreDataLinkRequired) {
                      var resultsNode = domQuery('.searchMenu', this.searchResultsNode)[0];
                      var moreDataNode = domConstruct.create("div", {
                          'class': "more-data",
                          innerHTML: 'More data...',
                          onclick:lang.hitch(this,function(){
                              this._activateMoreDataSearch();
                              this.searchDijit.search();
                          })
                      });
                      domConstruct.place(moreDataNode, resultsNode);
                  }
                  this._showResultMenu();
                  if (evt.numResults === 1 && (isFinite(_activeSourceNumber))) {
                      var result = evt.results &&
                        evt.results[_activeSourceNumber] && evt.results[_activeSourceNumber][0];
                      if (result) {
                          if (!sources[_activeSourceNumber].customSource) {
                              this.searchDijit.select(result);
                          } else {
                              this.searchDijit.emit("select-result", {
                                  result: result,
                                  source: sources[_activeSourceNumber],
                                  sourceIndex: _activeSourceNumber
                              })
                          }
                      }
                  }

                  this._resetSelectorPosition('.searchMenu');
              } else {
                  this._onClearSearch();
              }
          },

          _onSuggestResults: function (results) {
              //to handle search and suggest together
              this._resetSelectorPosition('.searchMenu');
              this._hideResultMenu();
          },
          _onSuggestResultsShow: function (results) {
              if (!results) {
                  return;
              }
              var moreDataLinkRequired = false;
              var activeSourceIndex = this.searchDijit.get('activeSourceIndex');
              
              if (activeSourceIndex === 'all') {
                      var keys = Object.keys(results);
                      array.some(keys,lang.hitch(this, function (key) {
                           var configuredMaxResults = this.searchDijit.sources[key].maxResultsAlias;
                           var currentDataMaxResults   = this.searchDijit.sources[key].maxResults;
                           if (this.config.moreDataMaxLimit > configuredMaxResults) {
                               if (results[key].length == configuredMaxResults) {
                                   if (configuredMaxResults < this.config.moreDataMaxLimit) {
                                       moreDataLinkRequired = true;
                                       return false;
                                   }
                               }
                           }
                      }));
                } else {
                    var configuredMaxResults = this.searchDijit.sources[activeSourceIndex].maxResultsAlias;
                    var currentDataMaxResults   = this.searchDijit.sources[activeSourceIndex].maxResults;
                    if (this.config.moreDataMaxLimit > configuredMaxResults) {
                        if (results[activeSourceIndex].length == configuredMaxResults) {
                            if (configuredMaxResults < this.config.moreDataMaxLimit) {
                                moreDataLinkRequired = true;
                            }
                        }
                    }else{
                        moreDataLinkRequired =  false;
                    }
                }
                  this._restoreDefaultSearch();
                  if (moreDataLinkRequired) {
                      var resultsNode = domQuery('.searchMenu', this.searchResultsNode)[0];
                      var moreDataNode = domConstruct.create("div", {
                          'class': "more-data",
                          innerHTML: 'More data...',
                          onclick:lang.hitch(this,function(){
                              this._activateMoreDataSearch();
                              this._executeSearch();
                          })
                      });
                      domConstruct.place(moreDataNode, this.searchDijit.suggestionsNode);
                  }
          },
          _onSelectSearchResult: function (evt) {
              var target = evt.target;
              while (!(html.hasAttr(target, 'data-source-index') && html.getAttr(target, 'data-index'))) {
                  target = target.parentNode;
              }
              var result = null;
              var dataSourceIndex = html.getAttr(target, 'data-source-index');
              var dataIndex = parseInt(html.getAttr(target, 'data-index'), 10);
              // var sources = this.searchDijit.get('sources');

              if (dataSourceIndex !== 'all') {
                  dataSourceIndex = parseInt(dataSourceIndex, 10);
              }
              if (this.searchResults && this.searchResults[dataSourceIndex] &&
                this.searchResults[dataSourceIndex][dataIndex]) {
                  result = this.searchResults[dataSourceIndex][dataIndex];
                  this._processResult(result, dataSourceIndex)
                  this._resetSelectorPosition('.searchMenu');
                  this._hideResultMenu();
                  this.searchDijit.set("value", result.name);
              }
          },

          _onSelectResult: function (e) {
              var result = e.result;
              if (!(result && result.name)) {
                  return;
              }
              var dataSourceIndex = e.sourceIndex;
              var sourceResults = this.searchResults[dataSourceIndex];

              var dataIndex = 0;
              for (var i = 0, len = sourceResults.length; i < len; i++) {
                  if (jimuUtils.isEqual(sourceResults[i], result)) {
                      dataIndex = i;
                      break;
                  }
              }
              domQuery('li', this.searchResultsNode)
              .forEach(lang.hitch(this, function (li) {
                  html.removeClass(li, 'result-item-selected');
                  var title = html.getAttr(li, 'title');
                  var dIdx = html.getAttr(li, 'data-index');
                  var dsIndex = html.getAttr(li, 'data-source-index');

                  if (title === result.name &&
                    dIdx === dataIndex.toString() &&
                    dsIndex === dataSourceIndex.toString()) {
                      html.addClass(li, 'result-item-selected');
                  }
              }));
              this._processResult(result, dataSourceIndex);
          },
          _processResult: function (result, dataSourceIndex) {
              this.layerUtil.flushPreviousResults();
              var activeSource = this.searchDijit.activeSource || this.searchDijit.get('sources')[dataSourceIndex];
              var cache = array.filter(this.customLayerConfigCache, function (cache) {
                  if (activeSource.customSource) {
                      return cache.serviceUrl + '/' + cache.serviceLayerIntId === activeSource.geometrySourceUrl;
                  } else if (activeSource.hasOwnProperty('featureLayer')) {
                      return cache.serviceUrl + '/' + cache.serviceLayerIntId === activeSource.url;
                  } else if (activeSource.hasOwnProperty('locator')) {
                      return cache.serviceUrl == activeSource.url;
                  }
              })[0];
              if (activeSource.customSource) {
                  var proxyUrl = this.appConfig.httpProxy.url;
                  CustomSearchUtil.fetchGeometryAndExtendedInfo(result, activeSource, cache, proxyUrl).then(lang.hitch(this, function (res) {
                      var data = CustomSearchUtil.fetchRequiredInfoFromResponse(res, activeSource);
                      if (this.layerUtil.areFieldsEmpty(cache)) {
                          this.layerUtil.populateFieldsFromAttributes(cache, data.features[0].attributes);
                      }
                      this.layerUtil.updateCache(cache, data);
                      if (this._resultsInPanel) {
                          this._displayResultsPanel(dataSourceIndex);
                      } else if (this._resultsInPopup) {
                          this._displayResultsInPopup(dataSourceIndex);
                      } else {
                          this._displayResultsInMap(dataSourceIndex);
                      }
                  }));
              } else {
                  if (this.layerUtil.areFieldsEmpty(cache)) {
                      this.layerUtil.populateFieldsFromAttributes(cache, result.feature.attributes);
                  }
                  var graphic = new Graphic(lang.clone(result.feature.geometry), null, lang.clone(result.feature.attributes));
                  this.layerUtil.addFeature(cache, graphic);
                  if (this._resultsInPanel) {
                      this._displayResultsPanel(dataSourceIndex);
                  } else if (this._resultsInPopup) {
                      this._displayResultsInPopup(dataSourceIndex);
                  } else {
                      this._displayResultsInMap(dataSourceIndex);
                  }
              }
          },
          _onClearSearch: function () {
              html.setStyle(this.searchResultsNode, 'display', 'none');
              this.searchResultsNode.innerHTML = "";
              this.searchResults = null;
              MapUtil.clearResultsFromMap(this.map);
              if (this.resultsWidget) {
                  this.resultsWidget.clearResults();
              }
              this._clearInfoWindow();
          },
          _hideResultMenu: function () {
              domQuery('.show-all-results', this.searchResultsNode).style('display', 'block');
              domQuery('.searchMenu', this.searchResultsNode).style('display', 'none');
          },
          _hideSuggestMenu: function () {
              this.searchDijit._hideSuggestionsMenu();
          },
          _showResultMenu: function () {
              html.setStyle(this.searchResultsNode, 'display', 'block');
              domQuery('.show-all-results', this.searchResultsNode).style('display', 'none');
              domQuery('.searchMenu', this.searchResultsNode).style('display', 'block');

              var groupNode = domQuery('.searchInputGroup', this.searchDijit.domNode)[0];
              if (groupNode) {
                  var groupBox = html.getMarginBox(groupNode);
                  var style = {
                      left: groupBox.l + 'px',
                      width: groupBox.w + 'px'
                  };
                  domQuery('.show-all-results', this.searchResultsNode).style(style);
                  domQuery('.searchMenu', this.searchResultsNode).style(style);
              }
          },
          _executeSearch: function (selectedSourceIndex) {
              var activeSource = this.searchDijit.sources[selectedSourceIndex] || this.searchDijit.activeSource;
              var searchString = this.searchDijit.get("value");
              if (activeSource) {
                  this.searchDijit._showLoading();
                  if (activeSource && activeSource.hasOwnProperty("locator")) {
                      this._executeGeocoderSearch().then(lang.hitch(this, function (results) {
                          this.searchDijit.showSuggestResults(results);
                          this.searchDijit._hideLoading();
                      }));
                  } else if (activeSource && activeSource.hasOwnProperty("featureLayer")) {
                      this._executeFeatureLayerSearch().then(lang.hitch(this, function (results) {
                          this.searchDijit.showSuggestResults(results);
                          this.searchDijit._hideLoading();
                      }));
                  } else if (activeSource && activeSource.customSource) {
                      this._executeCustomSearch().then(lang.hitch(this, function (results) {
                          this.searchDijit.showSuggestResults(results);
                          this.searchDijit._hideLoading();
                      }));;
                  }
              } else {
                  this.searchDijit._showLoading();
                  this._executeSearchAll().then(lang.hitch(this, function (results) {
                      this.searchDijit.showSuggestResults(results);
                      this.searchDijit._hideLoading();
                  }));
              }
          },
          _executeGeocoderSearch: function () {
              var deferred = new Deferred();
              this.searchDijit.doSuggest().then(function (results) {
                  deferred.resolve(results);
              });
              return deferred.promise;
          },
          _executeFeatureLayerSearch: function () {
              var deferred = new Deferred();
              this.searchDijit.searchAsSuggest().then(function (results) {
                  deferred.resolve(results);
              });
              return deferred.promise;
          },
          _executeCustomSearch: function (selectedSourceIndex) {
              var deferred = new Deferred();
              var inputVal = this.searchDijit.get("value");
              var activeSource = this.searchDijit.activeSource || this.searchDijit.sources[selectedSourceIndex];
              CustomSearchUtil.startSearch(inputVal, activeSource).then(lang.hitch(this, function (results) {
                  var formattedResults = this._formatResultsFromCustomSearch(results);
                  this.searchDijit.makeSuggestFromResults(formattedResults);
                  deferred.resolve(formattedResults);
              }));
              return deferred.promise;
          },
          _formatResultsFromCustomSearch: function (results) {
              var sourceIndex;
              array.some(this.searchDijit.get('sources'), function (source, index) {
                  if (source.customSource) {
                      sourceIndex = index;
                      return true;
                  }
              });
              var resultsObject = {};
              resultsObject[sourceIndex] = results;
              return { results: resultsObject, numResults: results.length, value: this.searchDijit.get("value") };
          },
          _createCustomLayerObjectForSearchItems: function (sources) {
              var deferred = new Deferred();
              var customLayerObjDeferreds = [];
              this.layerUtil.setMap(this.map);
              array.forEach(sources, lang.hitch(this, function (source) {
                  if (source.hasOwnProperty('featureLayer')) {
                      customLayerObjDeferreds.push(this.layerUtil.createCustomLayerObjectByUrl(source.url))
                  } else if (source.hasOwnProperty('locator')) {
                      customLayerObjDeferreds.push(this.layerUtil.createCustomLayerObjForLocator(source))
                  } else if (source.hasOwnProperty('customSource')) {
                      customLayerObjDeferreds.push(this.layerUtil.createCustomLayerObjForCustomSearchSource(source))
                  }
              }));
              all(customLayerObjDeferreds).then(lang.hitch(this, function () {
                  this.customLayerConfigCache = this.layerUtil.fetchCustomLayerConfig(false, false, false);
                  deferred.resolve();
              }));
              return deferred.promise;
          },
          _fetchResults: function () {
              return this.layerUtil.fetchNonEmptyResults();
          },
          _displayResultsPanel: function (dataSourceIndex) {
              var results = this._fetchResults();
              var resultsWidgetName = this._resultsWidgetName;
              var activeSource = this.searchDijit.activeSource || this.searchDijit.get('sources')[dataSourceIndex];
              if (this._resultsPanelConfigured) {
                  var widgetManager = WidgetManager.getInstance();
                  var resultsWidget = widgetManager.getWidgetsByName(resultsWidgetName);
                  var resultsWidgetLoaded = resultsWidget.length > 0;
                  if (resultsWidgetLoaded) {
                      this.resultsWidget = resultsWidget[0];
                      if (resultsWidget[0].state !== 'closed') {
                          // publish data
                          var mapUtil = resultsWidget[0].hasMapUtil() ? null : MapUtil;
                          this._publishData(dataSourceIndex,mapUtil);
                      } else {
                          widgetManager.openWidget(resultsWidget[0]);
                          PanelManager.getInstance().showPanel(resultsWidget[0]);
                          // publish data
                          var mapUtil = resultsWidget[0].hasMapUtil() ? null : MapUtil;
                          this._publishData(dataSourceIndex,mapUtil);
                      }
                  } else {
                      var resultsWidget = this.appConfig.getConfigElementsByName(resultsWidgetName)[0];
                      if (resultsWidget) {
                          this.openWidgetById(resultsWidget.id).then(lang.hitch(this, function (widget) {
                              this.resultsWidget = widget;
                              //publish data
                              var mapUtil = widget.hasMapUtil() ? null : MapUtil;
                              this._publishData(dataSourceIndex,mapUtil);
                              
                          }));
                      }
                  }
              } else {
                  this._displayResultsInMap(dataSourceIndex);
                  this._popNoResultsWidgetWarning();
              }
          },
          _displayResultsInPopup: function (dataSourceIndex) {
              var results = this._fetchResults();
              var activeSource = this.searchDijit.activeSource || this.searchDijit.get('sources')[dataSourceIndex];
              var infoTemplate = activeSource.infoTemplate;
              if (results.length > 0) {
                  var features = results[0].features;
                  if (features.length > 0) {
                      this._clearInfoWindow();
                      this._displayResultsInMap(dataSourceIndex).then(lang.hitch(this, function () {
                          var resultsLayer = MapUtil.getResultsLayer(this.map);
                          var fields = array.filter(results[0].fields, lang.hitch(this, function (field) {
                              var excludedField = false;
                              array.some(this._excludedFields, lang.hitch(function (exField) {
                                  var regExp = new RegExp(exField, "i");
                                  if (regExp.test(field.name) || regExp.test(field.alias)) {
                                      excludedField = true;
                                      return false;
                                  }
                              }))
                              return !(esriLang.isDefined(field.custom)) && !(excludedField);
                          }));
                          if (activeSource.hasOwnProperty("featureLayer")) {
                              var featureLayer = activeSource.featureLayer;
                              var webmapInfoPopupTemplateFound = false;
                              array.some(this.layerInfosObj._finalLayerInfos, lang.hitch(this, function (info) {
                                  var originOperLayer = info.originOperLayer;
                                  var layerType = originOperLayer.layerType
                                  if (layerType === "ArcGISFeatureLayer") {
                                      if (originOperLayer.url === featureLayer.url) {
                                          if (info.controlPopupInfo.infoTemplate) {
                                              webmapInfoPopupTemplateFound = true;
                                              infoTemplate = info.controlPopupInfo.infoTemplate;
                                          }
                                          return false;
                                      }
                                  } else if (layerType === "ArcGISMapServiceLayer") {
                                      array.some(originOperLayer.layers, function (sublayer) {
                                          if (featureLayer.url == (originOperLayer.url + "/" + sublayer.id)) {
                                              var template = info.controlPopupInfo.infoTemplates ? info.controlPopupInfo.infoTemplates[sublayer.id].infoTemplate : undefined;
                                              if (template) {
                                                  webmapInfoPopupTemplateFound = true;
                                                  infoTemplate = template;
                                              }
                                              return false;
                                          }
                                      })
                                  }
                              }));
                              if (!webmapInfoPopupTemplateFound) {
                                  activeSource.infoTemplate.setContent(lang.hitch(this, '_formatContent', activeSource.name, activeSource.featureLayer, activeSource.displayField, fields));
                              }
                          } else {
                              activeSource.infoTemplate.setContent(lang.hitch(this, '_formatContent', activeSource.name, null, this.searchDijit.value, fields));

                          }
                          resultsLayer.setInfoTemplate(infoTemplate);
                          this.map.infoWindow.setFeatures(resultsLayer.graphics);
                          var center = features[0].geometry.type != 'point' ? features[0].geometry.getExtent().getCenter() : features[0].geometry;
                          this.map.infoWindow.select(0);
                          this.map.infoWindow.show(center);

                      }))
                  } else {
                      this._clearInfoWindow();
                  }

              } else {
                  this._clearInfoWindow();
              }

              
          },
          _clearInfoWindow: function () {
              this.map.infoWindow.hide();
              this.map.infoWindow.setContent("");
              this.map.infoWindow.clearFeatures();
          },
          _displayResultsInMap: function (dataSourceIndex) {
              var results = this._fetchResults();
              var activeSource = this.searchDijit.activeSource || this.searchDijit.get('sources')[dataSourceIndex];
              var deferred = new Deferred();
              var zoomConfig = activeSource.zoomMethod || {};
              MapUtil.addResultsToMap(this.map, results, this.config.symbology, true, true, zoomConfig).then(lang.hitch(this,function () {
                 this._publishData(dataSourceIndex)
                 deferred.resolve();
              }));
              return deferred.promise;
          },
          _publishData:function(dataSourceIndex,mapUtil){
              var results = this._fetchResults();
              var activeSource = this.searchDijit.activeSource || this.searchDijit.get('sources')[dataSourceIndex];
              //publish the data to any receptive widgets listening for the data
                this.publishData({
                    interogate: true,
                    results: results,
                    zoomToResults: true,
                    zoomConfig: activeSource.zoomMethod || {},
                    mapUtil: mapUtil|| MapUtil,
                    symbology: this.config.symbology
                }, false);
            
          },
          _toggleNoResultsWidgetWarning: function (val) {
              this._showNoResultsWidgetWarning = !val;
          },
          _popNoResultsWidgetWarning: function () {
              if (this._showNoResultsWidgetWarning) {
                  var content = domConstruct.create("div", { style: "position:relative;height:auto;" });
                  var msg = domConstruct.create("div", { innerHTML: this.nls.noResultsWidgetWarning, style: "position:relative;height:auto;" });
                  var donotShow = new CheckBox({
                      style: "position:relative;float:left;margin-top:10px;",
                      onChange: lang.hitch(this, function () {
                          this._toggleNoResultsWidgetWarning(donotShow.get("checked"));
                      })
                  });
                  var label = domConstruct.create("div", { innerHTML: "Do not show this message again.", style: "margin-left:5px;position:relative;float:left;margin-top:10px;" });
                  domConstruct.place(msg, content);
                  domConstruct.place(donotShow.domNode, content);
                  domConstruct.place(label, content);
                  this._showMessage(content);
              }
          },
          _showMessage: function (msg) {
              var popup = new Message({
                  message: msg,
                  buttons: [{
                      label: "OK",
                      onClick: lang.hitch(this, function () {
                          popup.close();
                      })
                  }]
              });
          },
          destroy: function () {
              if (this.layerUtil) this.layerUtil.reset();
              if (!this._resultsPanelConfigured) {
                  MapUtil.clearResultsFromMap(this.map);
              }
              this._clearInfoWindow();
              this._resultsPanelConfigured = false;
              this.inherited(arguments);
          },
          _executeSearchAll: function () {
              var deferred = new Deferred();
              var searchDeferreds = [];
              var sources = this.searchDijit.sources
              var requestObjectDeferreds = {};
              var requestArrayDeferreds = [];
              array.forEach(sources, lang.hitch(this, function (source, index) {
                  if (source.hasOwnProperty("locator")) {
                      requestObjectDeferreds[index] = this._executeGeocoderSearch();
                  } else if (source.hasOwnProperty("featureLayer")) {
                      requestObjectDeferreds[index] = this._executeFeatureLayerSearch();
                  }
              }));
              var formattedResultsObject = {
                  results: null,
                  activeSourceIndex: this.searchDijit.get("activeSourceIndex"),
                  numResults: 0
              };

              var resultsCount;
              all(requestObjectDeferreds).then(function (results) {
                  formattedResultsObject.results = {};
                  for (p in results) {
                      if (results[p] && results[p][p].length > 0) {
                          formattedResultsObject.results[p] = results[p][p];
                          formattedResultsObject.numResults += results[p][p].length;
                      }
                  }
                  deferred.resolve(formattedResultsObject);
              });
              return deferred.promise;
          },
          _restoreDefaultSearch:function(){
              array.forEach(this.searchDijit.sources, lang.hitch(this, function (source) {
                  source.maxResults = source.maxResultsAlias;
                  source.maxSuggestions = source.maxResultsAlias;
              }));
          },
          _activateMoreDataSearch:function(){
              array.forEach(this.searchDijit.sources, lang.hitch(this, function (source) {
                  source.maxResults = this.config.moreDataMaxLimit;
                  source.maxSuggestions = this.config.moreDataMaxLimit;
              }));
          },
          _setVersionTitle: function () {
              var labelNode = domQuery(".searchInput", this.domNode)[0];
              var manifestInfo = this.manifest;
              var devVersion = manifestInfo.devVersion;
              var devWabVersion = manifestInfo.developedAgainst || manifestInfo.wabVersion;
              var codeSourcedFrom = manifestInfo.codeSourcedFrom;
              var client = manifestInfo.client;

              var title = this.nls._widgetLabel + "\n";
              title += "Dev version: " + devVersion + "\n";
              title += "Developed/Modified against: WAB" + devWabVersion + "\n";
              title += "Client: " + client + "\n";
              if (codeSourcedFrom) {
                  title += "Code sourced from: " + codeSourcedFrom + "\n";
              }

              if (labelNode) {
                  domAttr.set(labelNode, 'title', title);
              }
          }
      });
  });
