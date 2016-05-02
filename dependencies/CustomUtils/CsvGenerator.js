define(
[
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/_base/array",
    "dojo/dom-construct"

], function (
    declare,
    lang,
    array,
    domConstruct

) {
    var CsvGenerator = declare("CsvGenerator", null, {
        constructor: function (dataArray, fileName, separator, addQuotes) {
            this.dataArray = dataArray;
            this.fileName = fileName;
            this.separator = separator || ',';
            this.addQuotes = !!addQuotes;

            if (this.addQuotes) {
                this.separator = '"' + this.separator + '"';
            }
        },
        getRawData: function () {
            var separator = this.separator;
            var addQuotes = this.addQuotes;
            var rows = array.map(this.dataArray, function (row) {
                var rowData = row.join(separator);

                if (rowData.length && addQuotes) {
                    return '"' + rowData + '"';
                }
                return rowData
            });
            var data = rows.join('\n');
            return data;
        },
        getDownloadLink: function () {
            var data = this.getRawData();
            var type = 'data:text/csv;charset=utf-8';
            if (typeof btoa === 'function') {
                type += ';base64';
                data = btoa(data);
            } else {
                data = encodeURIComponent(data);
            }
            return this.downloadLink = this.downloadLink || type + ',' + data;
        },
        getDownLoadIframe: function () {
            return this.iframeEl = this.iframeEl || dojo.create("iframe", { style: "display:none;height:0px;width:0px;", name: "downloadInvoker" }, dojo.body());
        },
        getLinkElement: function (linkText) {
            var downloadLink = this.getDownloadLink();
            var downloadTarget = this.getDownLoadIframe();
            return this.linkElement = this.linkElement || dojo.create("a", { innerHTML: linkText, style: "display:none;", href: downloadLink, download: this.fileName, target: downloadTarget.name }, dojo.body());
        },
        // call with removeAfterDownload = true if you want the link to be removed after downloading
        download: function (removeAfterDownload) {
            if (window.navigator.msSaveOrOpenBlob) {
                var data = this.getRawData();
                var blob = new Blob([decodeURIComponent(data)], {
                    type: "text/csv;charset=utf-8;"
                });
                navigator.msSaveBlob(blob, this.fileName);
            } else {
                var link = this.getLinkElement();
                var downloadIframe = this.getDownLoadIframe();
                link.click();
                if (removeAfterDownload) {
                    domConstruct.destroy(link);
                    domConstruct.destroy(downloadIframe);
                }
            }


        }
    });
    return CsvGenerator;
});


