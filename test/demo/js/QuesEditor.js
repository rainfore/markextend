/*
 * QuesEditor - an editor of ques
 */

(function() {

if(typeof require !== 'undefined') {	
	var ques = require('./ques');
	var Dropzone = require('dropzone');
} else {
	var ques = window.ques;
}

function addEvent(elm, evType, fn, useCapture) {
	if (elm.addEventListener) {
		elm.addEventListener(evType, fn, useCapture);
	} else if (elm.attachEvent) {
		elm.attachEvent('on' + evType, fn);
	} else {
		elm['on' + evType] = fn;//DOM 0
	}
}

function extend(obj) {
    for (var i = 1; i < arguments.length; i++) {
        var target = arguments[i];
        for (var key in target) {
            if (Object.prototype.hasOwnProperty.call(target, key)) {
                obj[key] = target[key];
            }
        }
    }
    return obj;
}

QuesEditor = function(editor, options) {
	if(options) {
		this.options = extend({}, QuesEditor.defaults, options);
		ques.options.urlExtend = this.options.urlExtend;
	}

	var parent = editor.parentElement;

	var qeditor = document.createElement('div');
	qeditor.className = 'qeditor';
	editor.className = 'editor ' + editor.className;
	parent.insertBefore(qeditor, editor);

	var inner = '';
	inner += '<div class="preview"></div>\n';
	inner += '<div class="toolbar"><h4>编辑器</h4><span class="seperator"></span><span><div id="qeditor-toolbar-hide" style="display:none;"></div><i class="icon-image"></i></span>\n';
	qeditor.innerHTML = inner;
	qeditor.appendChild(editor);

	var preview = qeditor.children[0];
	var toolbar = qeditor.children[1];

	this.qeditor = qeditor;
	this.editor = editor;
	this.preview = preview;

	var that = this;
	addEvent(editor, 'keyup', function() {
		that.render.call(that);
	});
	this.render();

	var uploadButton = toolbar.children[0];

	// if(Dropzone) {
	// 	var myDropzone = new Dropzone(uploadButton.children[1], {
	// 		url: this.options.url,
	// 		createImageThumbnails: false,
	// 		maxFilesize: 2,
	// 		acceptedFiles: 'image/*',
	// 		previewsContainer: uploadButton.children[0],
	// 		success: function(file) {
	// 			var data = JSON.parse(file.xhr.response);
	// 			editor.value = editor.value + '\n![](~/' + data.result + ')';
	// 			that.render.call(that);
	// 		},
	// 		error: function(file, message) {
	// 			alert(message);
	// 		}
	// 	});
	// }
}

QuesEditor.defaults = {
	url: '',
	urlExtend: ''
}


QuesEditor.prototype.getValue = function() {
	return this.editor.value;
}

QuesEditor.prototype.setValue = function(val) {
	this.editor.value = val;
	this.render();
}

QuesEditor.prototype.getAnswers = function() {
	return ques.getAnswers(this.editor.value);
}

QuesEditor.prototype.setAnswers = function(answers) {
	this.setValue(ques.setAnswers(this.editor.value, answers));
}

QuesEditor.prototype.clearAnswers = function() {
	this.setValue(ques.clearAnswers(this.editor.value));
}

QuesEditor.prototype.getScores = function() {
	return ques.getScores(this.editor.value);
}

QuesEditor.prototype.setScores = function(scores) {
	this.setValue(ques.setScores(this.editor.value, scores));
}

QuesEditor.prototype.getQueses = function() {
	return ques.getQueses(this.editor.value);
}

QuesEditor.prototype.render = function() {
	this.preview.innerHTML = ques.render(this.editor.value);
}


if (typeof module !== 'undefined' && typeof exports === 'object') {
    module.exports = QuesEditor;
} else if (typeof define === 'function' && define.amd) {
    define(function() { return QuesEditor; });
} else {
    this.QuesEditor = QuesEditor;
}

}).call(function() {
    return this || (typeof window !== 'undefined' ? window : global);
}());