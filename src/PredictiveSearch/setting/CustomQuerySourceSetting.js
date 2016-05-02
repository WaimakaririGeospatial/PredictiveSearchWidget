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
  'dojo/_base/html',
  'dijit/_WidgetBase',
  'dijit/_TemplatedMixin',
  'dijit/_WidgetsInTemplateMixin',
  'dojo/text!./CustomQuerySourceSetting.html',
  'dojo/_base/lang',
  'dojo/_base/array',
  'dojo/on',
  'dojo/aspect',
  'dojo/query',
  'dojo/Deferred',
  'dojo/request/script',
  'dojo/dom-style',
  'dojo/dom-attr',
  'dojo/Evented',
  'jimu/dijit/_FeaturelayerSourcePopup',
  'esri/request',
  'jimu/dijit/Popup',
  'jimu/dijit/CheckBox',
  'jimu/dijit/LoadingShelter',
  'dijit/form/ValidationTextBox',
  'dojo/NodeList-data'
],
function(declare, html, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin,
  template, lang, array, on, aspect,query, Deferred,scriptRequest, domStyle,domAttr,Evented,
  _FeaturelayerSourcePopup, esriRequest, Popup, CheckBox) {
  return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, Evented], {
    baseClass: 'jimu-widget-search-query-source-setting',
    templateString: template,
    formatOptions:[
        { label: "JSON", value: "json",selected:true},
        { label: "XML",  value: "xml"}
    ],
    nls: null,
    appConfig: null,
    map: null,
    _setZoomSelector:false,
    tr: null,
    config: null,

    setRelatedTr: function(tr) {
      this.tr = tr;
    },

    getRelatedTr: function() {
      return this.tr;
    },
    postCreate: function () {
        this.inherited(arguments);
        this._populateResponseFormatFields();
    },
    setFeatureZoomSelector: function () {
        var config = this.config;
        if (config && config["zoomMethod"] && config.zoomMethod.zoomToScale) {
            this._showZoomToScaleSelector();
        } else if (config && config["zoomMethod"] && config.zoomMethod.zoomToFeature) {
            this._showZoomToFeatureSelector();
        }
        this._listenToGeometrySource();
    },
    _listenToGeometrySource:function(){
        this._geometryValidator = aspect.after(this.geometrySourceUrl, "onBlur", lang.hitch(this, function () {
            this._getGeometryOfResultFeature().then(lang.hitch(this, function (geomType) {
                if (geomType === "esriGeometryPoint") {
                    this._showZoomToScaleSelector();
                } else if (geomType) {
                    this._showZoomToFeatureSelector();
                } else {
                    this._hideZoomToScaleSelector();
                    this._hideZoomToFeatureSelector();
                }
            }));
        }));
    },
    _showZoomToScaleSelector: function () {
        domStyle.set(this.scaleSelection, "display", "block");
        domAttr.set(this.scaleSelection, "active", "true");
        this._hideZoomToFeatureSelector();
    },
    _showZoomToFeatureSelector: function () {
        domStyle.set(this.zoomToFeatureExtent, "display", "block");
        domAttr.set(this.zoomToFeatureExtent, "active", "true");
        this._hideZoomToScaleSelector();
    },
    _hideZoomToScaleSelector: function () {
        domStyle.set(this.scaleSelection, "display", "none");
        domAttr.set(this.scaleSelection, "active", "false");
    },
    _hideZoomToFeatureSelector: function () {
        domStyle.set(this.zoomToFeatureExtent, "display", "none");
        domAttr.set(this.zoomToFeatureExtent, "active", "false");
    },
    _getGeometryOfResultFeature: function () {
        var deferred = new Deferred();
        var serviceUrl =  this.geometrySourceUrl.get("value");
        if (serviceUrl) {
            scriptRequest.get(serviceUrl, {
                handleAs: 'json',
                jsonp: "callback",
                query: {
                    f: "json"
                }
            }).then(lang.hitch(this, function (response) {
                deferred.resolve(response.geometryType);
            }), lang.hitch(this, function () {
                //on error
                deferred.resolve(false);
            }));

        } else {
            deferred.resolve(false);
        }
        return deferred.promise;
    },
    setConfig: function(config) {
      if (Object.prototype.toString.call(config) !== "[object Object]") {
        return;
      }

      var url = config.url;
      if (!url) {
        return;
      }
      this.config = config;
      this._setSourceItems();
    },

    isValidConfig: function() {
      var config = this.getConfig();
      if (config.url && config.name && config.displayFields) {
        return true;
      }else {
        return false;
      }
    },

    showValidationTip: function() {
      this._showValidationErrorTip(this.sourceUrl);
      this._showValidationErrorTip(this.sourceName);
      this._showValidationErrorTip(this.queryParam);
      this._showValidationErrorTip(this.displayFields);
    },

    getConfig: function() {
      var json = {
        url: lang.trim(this.sourceUrl.get('value')),
        name: lang.trim(this.sourceName.get('value')),
        placeholder: this.placeholder.get('value'),
        queryParam: lang.trim(this.queryParam.get('value')),
        customQueryResultsIdentifierField:lang.trim(this.customQueryResultsIdentifierField.get("value")),
        displayFields: lang.trim(this.displayFields.get('value')),
        geometrySourceUrl:lang.trim(this.geometrySourceUrl.get('value')),
        geometrySourceQueryField:lang.trim(this.geometrySourceQueryField.get('value')),
        extendedQueryUrl:lang.trim(this.extendedQueryUrl.get('value')),
        extendedQueryField: lang.trim(this.extendedQueryField.get('value')),
        queryResponseFormat:this.queryResponseFormat.get('value'),
        extendedQueryResponseFormat: this.extendedQueryResponseFormat.get('value'),
        type: 'custom',
        zoomMethod:this._getFeatureZoomMethod()
      };

      return json;
    },
    _getFeatureZoomMethod:function(){
        var zoomMethod = {};
        if (domAttr.get(this.scaleSelection, "active") === String(true)) {
            zoomMethod.zoomToScale = true;
            zoomMethod.scaleValue = this.scaleValue.get("value") || 0;
        } else if (domAttr.get(this.zoomToFeatureExtent, "active") === String(true)) {
            zoomMethod.zoomToFeature = true;
            zoomMethod.extentPadding = this.extentPadding.get("value") || 0;
        }
        return zoomMethod;
    },
    destroy: function () {
        this.inherited(arguments);
        if (this._geometryValidator) {
            this._geometryValidator.remove();
        }
        if (this.fieldsPopup) {
            this.fieldsPopup.close();
            this.fieldsPopup = null;
        }
        this.config = null;
        this.nls = null;
        this.tr = null;
    },

    _setSourceItems: function() {
      this.sourceUrl.set('value', this.config.url || "");
      this.sourceName.set('value', this.config.name || "");
      this.placeholder.set('value', this.config.placeholder || "");
      this.queryParam.set('value', this.config.queryParam || "");
      this.customQueryResultsIdentifierField.set("value", this.config.customQueryResultsIdentifierField || "");
      this.displayFields.set('value', this.config.displayFields || "");
      this.geometrySourceUrl.set('value', this.config.geometrySourceUrl);
      this.geometrySourceQueryField.set('value', this.config.geometrySourceQueryField);
      this.extendedQueryUrl.set('value', this.config.extendedQueryUrl);
      this.extendedQueryField.set('value', this.config.extendedQueryField);
      this.queryResponseFormat.set('value', this.config.queryResponseFormat);
      this.extendedQueryResponseFormat.set('value', this.config.extendedQueryResponseFormat);
      if (this.config.zoomMethod) {
          var zoomMethod = this.config.zoomMethod;
          if (typeof(zoomMethod.scaleValue)  === 'number') {
              this.scaleValue.set('value', zoomMethod.scaleValue);
          }
          if (typeof (zoomMethod.extentPadding) === 'number') {
              this.extentPadding.set('value', zoomMethod.extentPadding);
          }
      }
    },

    _setSearchFields: function(param) {
        this.queryParam.set(value, param);
    },
    _populateResponseFormatFields: function () {
        this.queryResponseFormat.addOption(this.formatOptions);
        this.extendedQueryResponseFormat.addOption(this.formatOptions);
    },
    _showValidationErrorTip: function(_dijit){
      if (!_dijit.validate() && _dijit.domNode) {
        if (_dijit.focusNode) {
          var _disabled = _dijit.get('disabled');
          if (_disabled) {
            _dijit.set('disabled', false);
          }
          _dijit.focusNode.focus();
          setTimeout(lang.hitch(this, function() {
            _dijit.focusNode.blur();
            if (_disabled) {
              _dijit.set('disabled', true);
            }
            _dijit = null;
          }), 100);
        }
      }
    }
  });
});