/*
 * ques - A markdown parser with more features
 * Copyright (c) 2014-2015, Sensen. (MIT Licensed)
 * https://github.com/rainfore/markextend
 */

(function() {

if(typeof require !== 'undefined') {	
	var katex = require('katex');
} else {
	var katex = window.katex;
}

/*
 * Block-Level Grammar
 */
var block = {
	newline: /^\n+/,
	code: /^( {4}[^\n]+\n*)+/,
	fences: noop,
	hr: /^( *[-*_]){3,} *(?:\n+|$)/,
	heading: /^ *(#{1,6}) *([^\n]+?) *#* *(?:\n+|$)/,
	nptable: noop,
	lheading: /^([^\n]+)\n *(=|-){2,} *(?:\n+|$)/,
	blockquote: /^( *>[^\n]+(\n(?!def)[^\n]+)*\n*)+/,
	list: /^( *)(bull) [\s\S]+?(?:hr|def|\n{2,}(?! )(?!\1bull )\n*|\s*$)/,
	qlist: /^( *)(qbull) [\s\S]+?(?:hr|def|\n{2,}(?! )(?!\1bull )\n*|\s*$)/,
	html: /^ *(?:comment *(?:\n|\s*$)|closed *(?:\n{2,}|\s*$)|closing *(?:\n{2,}|\s*$))/,
	def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +["(]([^\n]+)[")])? *(?:\n+|$)/,
	table: noop,
	paragraph: /^((?:[^\n]+\n?(?!hr|heading|lheading|blockquote|tag|def))+)\n*/,
	text: /^[^\n]+/
};

block.bullet = /(?:[*+-]|\d+\.)/;
block.qbullet = /(?:[A-Z]\.)/;

block.item = /^( *)(bull) [^\n]*(?:\n(?!\1bull )[^\n]*)*/;
block.item = replace(block.item, 'gm')
	(/bull/g, block.bullet)
	();
block.qitem = /^( *)(qbull) [^\n]*(?:\n(?!\1qbull )[^\n]*)*/;
block.qitem = replace(block.qitem, 'gm')
	(/qbull/g, block.qbullet)
	();

block.list = replace(block.list)
	(/bull/g, block.bullet)
	('hr', '\\n+(?=\\1?(?:[-*_] *){3,}(?:\\n+|$))')
	('def', '\\n+(?=' + block.def.source + ')')
	();
block.qlist = replace(block.qlist)
	(/qbull/g, block.qbullet)
	('hr', '\\n+(?=\\1?(?:[-*_] *){3,}(?:\\n+|$))')
	('def', '\\n+(?=' + block.def.source + ')')
	();

block.blockquote = replace(block.blockquote)
	('def', block.def)
	();

block._tag = '(?!(?:'
	+ 'a|em|strong|small|s|cite|q|dfn|abbr|data|time|code'
	+ '|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo'
	+ '|span|br|wbr|ins|del|img)\\b)\\w+(?!:/|[^\\w\\s@]*@)\\b';

block.html = replace(block.html)
	('comment', /<!--[\s\S]*?-->/)
	('closed', /<(tag)[\s\S]+?<\/\1>/)
	('closing', /<tag(?:"[^"]*"|'[^']*'|[^'">])*?>/)
	(/tag/g, block._tag)
	();

block.paragraph = replace(block.paragraph)
	('hr', block.hr)
	('heading', block.heading)
	('lheading', block.lheading)
	('blockquote', block.blockquote)
	('tag', '<' + block._tag)
	('def', block.def)
	();

/*
 * Normal Block Grammar
 */
block.normal = extend({}, block);

/*
 * GFM Block Grammar
 */
block.gfm = extend({}, block.normal, {
	fences: /^ *(`{3,}|~{3,}) *(\S+)? *\n([\s\S]+?)\s*\1 *(?:\n+|$)/,
	latexfences: /^ *(\${3,}) *(\S+)? *\n([\s\S]+?)\s*\1 *(?:\n+|$)/,
	paragraph: /^/
});

block.gfm.paragraph = replace(block.paragraph)
	('(?!', '(?!'
		+ block.gfm.fences.source.replace('\\1', '\\2') + '|'
		+ block.gfm.latexfences.source.replace('\\1', '\\2') + '|'
		+ block.list.source.replace('\\1', '\\3') + '|'
		+ block.qlist.source.replace('\\1', '\\3') + '|'
	)();

/*
 * GFM + Tables Block Grammar
 */
block.tables = extend({}, block.gfm, {
	nptable: /^ *(\S.*\|.*)\n *([-:]+ *\|[-| :]*)\n((?:.*\|.*(?:\n|$))*)\n*/,
	table: /^ *\|(.+)\n *\|( *[-:]+[-| :]*)\n((?: *\|.*(?:\n|$))*)\n*/
});

/*
 * Block Lexer
 */
function Lexer(options) {
	this.tokens = [];
	this.tokens.links = {};
	this.options = options || ques.options;
	this.rules = block.normal;

	if (this.options.gfm) {
		if (this.options.tables) {
			this.rules = block.tables;
		} else {
			this.rules = block.gfm;
		}
	}
}

// Expose Block Rules
Lexer.rules = block;

// Static Lex Method
Lexer.lex = function(src, options) {
	var lexer = new Lexer(options);
	return lexer.lex(src);
};

// Preprocessing
Lexer.prototype.lex = function(src) {
	src = src
		.replace(/\r\n|\r/g, '\n')
		.replace(/\t/g, '        ')
		.replace(/\u00a0/g, ' ')
		.replace(/\u2424/g, '\n');

	return this.token(src, true);
};

// Lexing
Lexer.prototype.token = function(src, top, bq) {
	var src = src.replace(/^ +$/gm, '')
		, next
		, loose
		, cap
		, bull
		, b
		, item
		, qitem
		, space
		, i
		, l;

	while (src) {
		// newline
		if (cap = this.rules.newline.exec(src)) {
			src = src.substring(cap[0].length);
			if (cap[0].length > 1) {
				this.tokens.push({
					type: 'space'
				});
			}
		}

		// qlist
		if (cap = this.rules.qlist.exec(src)) {
			src = src.substring(cap[0].length);
			qbull = cap[2];

			this.tokens.push({
				type: 'qlist_start',
				ordered: qbull.length > 1,
				question: /[A-Z]\./.test(cap[2])
			});

			// Get each top-level qitem.
			cap = cap[0].match(this.rules.qitem);

			next = false;
			l = cap.length;
			i = 0;

			for (; i < l; i++) {
				qitem = cap[i];

				// Remove the qlist qitem's qbullet
				// so it is seen as the next token.
				space = qitem.length;
				qitem = qitem.replace(/^ *([A-Z]\.) +/, '');

				// Outdent whatever the
				// qlist qitem contains. Hacky.
				if (~qitem.indexOf('\n ')) {
					space -= qitem.length;
					qitem = qitem.replace(new RegExp('^ {1,' + space + '}', 'gm'), '');
				}

				// Determine whether qitem is loose or not.
				// Use: /(^|\n)(?! )[^\n]+\n\n(?!\s*$)/
				// for discount behavior.
				loose = next || /\n\n(?!\s*$)/.test(qitem);
				if (i !== l - 1) {
					next = qitem.charAt(qitem.length - 1) === '\n';
					if (!loose) loose = next;
				}

				this.tokens.push({
					type: loose
						? 'qloose_item_start'
						: 'qlist_item_start',
					index: i
				});

				// Recurse.
				this.token(qitem, false, bq);

				this.tokens.push({
					type: 'qlist_item_end',
					index: i
				});
			}

			this.tokens.push({
				type: 'qlist_end'
			});

			continue;
		}

		if(this.options.markdown) {
			// code
			if (cap = this.rules.code.exec(src)) {
				src = src.substring(cap[0].length);
				cap = cap[0].replace(/^ {4}/gm, '');
				this.tokens.push({
					type: 'code',
					text: cap.replace(/\n+$/, '')
				});
				continue;
			}

			// fences (gfm)
			if (cap = this.rules.fences.exec(src)) {
				src = src.substring(cap[0].length);
				this.tokens.push({
					type: 'code',
					lang: cap[2],
					text: cap[3]
				});
				continue;
			}

			// latexfences (gfm)
			if (cap = this.rules.latexfences.exec(src)) {
				src = src.substring(cap[0].length);
				this.tokens.push({
					type: 'latex',
					text: cap[3]
				});
				continue;
			}

			// heading
			if (cap = this.rules.heading.exec(src)) {
				src = src.substring(cap[0].length);
				this.tokens.push({
					type: 'heading',
					depth: cap[1].length,
					text: cap[2]
				});
				continue;
			}

			// table no leading pipe (gfm)
			if (top && (cap = this.rules.nptable.exec(src))) {
				src = src.substring(cap[0].length);

				item = {
					type: 'table',
					header: cap[1].replace(/^ *| *\| *$/g, '').split(/ *\| */),
					align: cap[2].replace(/^ *|\| *$/g, '').split(/ *\| */),
					cells: cap[3].replace(/\n$/, '').split('\n')
				};

				for (i = 0; i < item.align.length; i++) {
					if (/^ *-+: *$/.test(item.align[i])) {
						item.align[i] = 'right';
					} else if (/^ *:-+: *$/.test(item.align[i])) {
						item.align[i] = 'center';
					} else if (/^ *:-+ *$/.test(item.align[i])) {
						item.align[i] = 'left';
					} else {
						item.align[i] = null;
					}
				}

				for (i = 0; i < item.cells.length; i++) {
					item.cells[i] = item.cells[i].split(/ *\| */);
				}

				this.tokens.push(item);

				continue;
			}

			// lheading
			if (cap = this.rules.lheading.exec(src)) {
				src = src.substring(cap[0].length);
				this.tokens.push({
					type: 'heading',
					depth: cap[2] === '=' ? 1 : 2,
					text: cap[1]
				});
				continue;
			}

			// hr
			if (cap = this.rules.hr.exec(src)) {
				src = src.substring(cap[0].length);
				this.tokens.push({
					type: 'hr'
				});
				continue;
			}

			// blockquote
			if (cap = this.rules.blockquote.exec(src)) {
				src = src.substring(cap[0].length);

				this.tokens.push({
					type: 'blockquote_start'
				});

				cap = cap[0].replace(/^ *> ?/gm, '');

				// Pass `top` to keep the current
				// "toplevel" state. This is exactly
				// how markdown.pl works.
				this.token(cap, top, true);

				this.tokens.push({
					type: 'blockquote_end'
				});

				continue;
			}

			// list
			if (cap = this.rules.list.exec(src)) {
				src = src.substring(cap[0].length);
				bull = cap[2];

				this.tokens.push({
					type: 'list_start',
					ordered: bull.length > 1,
					question: /[A-Z]\./.test(cap[2])
				});

				// Get each top-level item.
				cap = cap[0].match(this.rules.item);

				next = false;
				l = cap.length;
				i = 0;

				for (; i < l; i++) {
					item = cap[i];

					// Remove the list item's bullet
					// so it is seen as the next token.
					space = item.length;
					item = item.replace(/^ *([*+-]|\d+\.) +/, '');

					// Outdent whatever the
					// list item contains. Hacky.
					if (~item.indexOf('\n ')) {
						space -= item.length;
						item = item.replace(new RegExp('^ {1,' + space + '}', 'gm'), '');
					}

					// Determine whether the next list item belongs here.
					// Backpedal if it does not belong in this list.
					if (i !== l - 1) {
						b = block.bullet.exec(cap[i + 1])[0];
						if (bull !== b && !(bull.length > 1 && b.length > 1)) {
							src = cap.slice(i + 1).join('\n') + src;
							i = l - 1;
						}
					}

					// Determine whether item is loose or not.
					// Use: /(^|\n)(?! )[^\n]+\n\n(?!\s*$)/
					// for discount behavior.
					loose = next || /\n\n(?!\s*$)/.test(item);
					if (i !== l - 1) {
						next = item.charAt(item.length - 1) === '\n';
						if (!loose) loose = next;
					}

					this.tokens.push({
						type: loose
							? 'loose_item_start'
							: 'list_item_start'
					});

					// Recurse.
					this.token(item, false, bq);

					this.tokens.push({
						type: 'list_item_end'
					});
				}

				this.tokens.push({
					type: 'list_end'
				});

				continue;
			}

			// html
			if (cap = this.rules.html.exec(src)) {
				src = src.substring(cap[0].length);
				this.tokens.push({
					type: this.options.sanitize
						? 'paragraph'
						: 'html',
					pre: cap[1] === 'pre' || cap[1] === 'script' || cap[1] === 'style',
					text: cap[0]
				});
				continue;
			}

			// def
			if ((!bq && top) && (cap = this.rules.def.exec(src))) {
				src = src.substring(cap[0].length);
				this.tokens.links[cap[1].toLowerCase()] = {
					href: cap[2],
					title: cap[3]
				};
				continue;
			}

			// table (gfm)
			if (top && (cap = this.rules.table.exec(src))) {
				src = src.substring(cap[0].length);

				item = {
					type: 'table',
					header: cap[1].replace(/^ *| *\| *$/g, '').split(/ *\| */),
					align: cap[2].replace(/^ *|\| *$/g, '').split(/ *\| */),
					cells: cap[3].replace(/(?: *\| *)?\n$/, '').split('\n')
				};

				for (i = 0; i < item.align.length; i++) {
					if (/^ *-+: *$/.test(item.align[i])) {
						item.align[i] = 'right';
					} else if (/^ *:-+: *$/.test(item.align[i])) {
						item.align[i] = 'center';
					} else if (/^ *:-+ *$/.test(item.align[i])) {
						item.align[i] = 'left';
					} else {
						item.align[i] = null;
					}
				}

				for (i = 0; i < item.cells.length; i++) {
					item.cells[i] = item.cells[i]
						.replace(/^ *\| *| *\| *$/g, '')
						.split(/ *\| */);
				}

				this.tokens.push(item);

				continue;
			}

			// top-level paragraph
			if (top && (cap = this.rules.paragraph.exec(src))) {
				src = src.substring(cap[0].length);
				this.tokens.push({
					type: 'paragraph',
					text: cap[1].charAt(cap[1].length - 1) === '\n'
						? cap[1].slice(0, -1)
						: cap[1]
				});
				continue;
			}
		}

		// text
		if (cap = this.rules.text.exec(src)) {
			// Top-level should never reach here.
			src = src.substring(cap[0].length);
			this.tokens.push({
				type: 'text',
				text: cap[0]
			});
			continue;
		}

		if (src) {
			throw new
				Error('Infinite loop on byte: ' + src.charCodeAt(0));
		}
	}

	return this.tokens;
};

/*
 * Inline-Level Grammar
 */
var inline = {
	escape: /^\\([\\`*{}\[\]()#+\-.!_>])/,
	autolink: /^<([^ >]+(@|:\/)[^ >]+)>/,
	url: noop,
	tag: /^<!--[\s\S]*?-->|^<\/?\w+(?:"[^"]*"|'[^']*'|[^'">])*?>/,
	link: /^!?(?!@+)\[(inside)\]\(href\)/,
	reflink: /^!?(?!@+)\[(inside)\]\s*\[([^\]]*)\]/,
	nolink: /^!?(?!@+)\[((?:\[[^\]]*\]|[^\[\]])*)\]/,
	strong: /^__([\s\S]+?)__(?!_)|^\*\*([\s\S]+?)\*\*(?!\*)/,
	em: /^\b_((?:__|[\s\S])+?)_\b|^\*((?:\*\*|[\s\S])+?)\*(?!\*)/,
	code: /^(`+)\s*([\s\S]*?[^`])\s*\1(?!`)/,
	br: /^ {2,}\n(?!\s*$)/,
	del: noop,
	text: /^[\s\S]+?(?=[\\<!\[_*@$`]| {2,}\n|$)/,
	
	latex: /^\$\$([\s\S]+?)\$\$(?!\$)/,
	qanswer: /^([~!]?@{1,3})\[(inside)\]\(([\d\.]*)\)/,
	qanswer2: /([~!]?@{1,3})\[(inside)\]\(([\d\.]*)\)/g
};

inline._inside = /(?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*/;
inline._href = /\s*<?([\s\S]*?)>?(?:\s+['"]([\s\S]*?)['"])?\s*/;

inline.link = replace(inline.link)
	('inside', inline._inside)
	('href', inline._href)
	();

inline.reflink = replace(inline.reflink)
	('inside', inline._inside)
	();

inline.qanswer = replace(inline.qanswer)
	('inside', inline._inside)
	();

inline.qanswer2 = replace(inline.qanswer2, 'g')
	('inside', inline._inside)
	();


/*
 * Normal Inline Grammar
 */
inline.normal = extend({}, inline);

/*
 * GFM Inline Grammar
 */
inline.gfm = extend({}, inline.normal, {
	escape: replace(inline.escape)('])', '~|])')(),
	url: /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/,
	del: /^~~(?=\S)([\s\S]*?\S)~~/,
	text: replace(inline.text)
		(']|', '~]|')
		('|', '|https?://|')
		()
});

/*
 * GFM + Line Breaks Inline Grammar
 */
inline.breaks = extend({}, inline.gfm, {
	br: replace(inline.br)('{2,}', '*')(),
	text: replace(inline.gfm.text)('{2,}', '*')()
});

/*
 * Inline Lexer & Compiler
 */
function InlineLexer(links, options) {
	this.options = options || ques.options;
	this.links = links;
	this.rules = inline.normal;
	this.renderer = this.options.renderer || new Renderer;
	this.renderer.options = this.options;

	if (!this.links) {
		throw new
			Error('Tokens array requires a `links` property.');
	}

	if (this.options.gfm) {
		if (this.options.breaks) {
			this.rules = inline.breaks;
		} else {
			this.rules = inline.gfm;
		}
	}
}

// Expose Inline Rules
InlineLexer.rules = inline;

// Static Lexing/Compiling Method
InlineLexer.output = function(src, links, options) {
	var inline = new InlineLexer(links, options);
	return inline.output(src);
};

InlineLexer.prototype.codeOutput = function(src) {
	var that = this;
	return src.replace(this.rules.qanswer2, function(m, $1, $2, $3) {
		return that.renderer.qanswer.call(that.renderer, $1, $2, $3);
	});

}

// Lexing/Compiling
InlineLexer.prototype.output = function(src) {
	var out = ''
		, link
		, text
		, href
		, cap;

	while (src) {
		/////////////////////// console.log(src);
		// escape
		if (cap = this.rules.escape.exec(src)) {
			src = src.substring(cap[0].length);
			out += cap[1];
			continue;
		}

		// qanswer
		if (cap = this.rules.qanswer.exec(src)) {
			src = src.substring(cap[0].length);
			this.inLink = true;
			
			out += this.renderer.qanswer(cap[1], cap[2], cap[3]);
			this.inLink = false;
			continue;
		}

		// autolink
		if (cap = this.rules.autolink.exec(src)) {
			src = src.substring(cap[0].length);
			if (cap[2] === '@') {
				text = cap[1].charAt(6) === ':'
					? this.mangle(cap[1].substring(7))
					: this.mangle(cap[1]);
				href = this.mangle('mailto:') + text;
			} else {
				text = escape(cap[1]);
				href = text;
			}
			out += this.renderer.link(href, null, text);
			continue;
		}

		// url (gfm)
		if (!this.inLink && (cap = this.rules.url.exec(src))) {
			src = src.substring(cap[0].length);
			text = escape(cap[1]);
			href = text;
			out += this.renderer.link(href, null, text);
			continue;
		}

		// link
		if (cap = this.rules.link.exec(src)) {
			src = src.substring(cap[0].length);
			this.inLink = true;
			out += this.outputLink(cap, {
				href: cap[2],
				title: cap[3]
			});
			this.inLink = false;
			continue;
		}

		// reflink, nolink
		if ((cap = this.rules.reflink.exec(src))
				|| (cap = this.rules.nolink.exec(src))) {
			src = src.substring(cap[0].length);
			link = (cap[2] || cap[1]).replace(/\s+/g, ' ');
			link = this.links[link.toLowerCase()];
			if (!link || !link.href) {
				out += cap[0].charAt(0);
				src = cap[0].substring(1) + src;
				continue;
			}
			this.inLink = true;
			out += this.outputLink(cap, link);
			this.inLink = false;
			continue;
		}

		if(this.options.markdown) {

			// tag
			if (cap = this.rules.tag.exec(src)) {
				if (!this.inLink && /^<a /i.test(cap[0])) {
					this.inLink = true;
				} else if (this.inLink && /^<\/a>/i.test(cap[0])) {
					this.inLink = false;
				}
				src = src.substring(cap[0].length);
				out += this.options.sanitize
					? escape(cap[0])
					: cap[0];
				continue;
			}

			// latex
			if (cap = this.rules.latex.exec(src)) {
				src = src.substring(cap[0].length);
				out += this.renderer.latex(cap[1]);
				continue;
			}

			// strong
			if (cap = this.rules.strong.exec(src)) {
				// Modified!
			   src = src.substring(cap[0].length);
			   out += this.renderer.strong(this.output(cap[2] || cap[1]));
			   continue;
			}

			// em
			// if (cap = this.rules.em.exec(src)) {
			// 	// Modified!
			// 	src = src.substring(cap[0].length);
			// 	out += this.renderer.em(this.output(cap[2] || cap[1]));
			// 	continue;
			// }

			// code
			if (cap = this.rules.code.exec(src)) {
				src = src.substring(cap[0].length);
				out += this.renderer.codespan(escape(cap[2], true));
				continue;
			}

			// br
			if (cap = this.rules.br.exec(src)) {
				src = src.substring(cap[0].length);
				out += this.renderer.br();
				continue;
			}

			// del (gfm)
			if (cap = this.rules.del.exec(src)) {
				src = src.substring(cap[0].length);
				out += this.renderer.del(this.output(cap[1]));
				continue;
			}

		}

		// text
		if (cap = this.rules.text.exec(src)) {
			src = src.substring(cap[0].length);
			out += escape(this.smartypants(cap[0]));
			continue;
		}

		if (src) {
			throw new
				Error('Infinite loop on byte: ' + src.charCodeAt(0));
		}
	}

	return out;
};

// Compile Link
InlineLexer.prototype.outputLink = function(cap, link) {
	var href = escape(link.href)
		, title = link.title ? escape(link.title) : null;

	return cap[0].charAt(0) !== '!'
		? this.renderer.link(href, title, this.output(cap[1]))
		: this.renderer.image(href, title, escape(cap[1]));
};

// Smartypants Transformations
InlineLexer.prototype.smartypants = function(text) {
	if (!this.options.smartypants) return text;
	return text
		// em-dashes
		.replace(/--/g, '\u2014')
		// opening singles
		.replace(/(^|[-\u2014/(\[{"\s])'/g, '$1\u2018')
		// closing singles & apostrophes
		.replace(/'/g, '\u2019')
		// opening doubles
		.replace(/(^|[-\u2014/(\[{\u2018\s])"/g, '$1\u201c')
		// closing doubles
		.replace(/"/g, '\u201d')
		// ellipses
		.replace(/\.{3}/g, '\u2026');
};

// Mangle Links
InlineLexer.prototype.mangle = function(text) {
	var out = ''
		, l = text.length
		, i = 0
		, ch;

	for (; i < l; i++) {
		ch = text.charCodeAt(i);
		if (Math.random() > 0.5) {
			ch = 'x' + ch.toString(16);
		}
		out += '&#' + ch + ';';
	}

	return out;
};

/*
 * Renderer
 */

function Renderer(options) {
	this.options = options || {};
}

Renderer.prototype.code = function(code, lang, escaped) {
	if (this.options.highlight) {
		var out = this.options.highlight(code, lang);
		if (out != null && out !== code) {
			escaped = true;
			code = out;
		}
	}

	if (!lang) {
		return '<pre><code>'
			+ (escaped ? code : escape(code, true))
			+ '\n</code></pre>';
	}

	return '<pre><code class="'
		+ this.options.langPrefix
		+ escape(lang, true)
		+ '">'
		+ (escaped ? code : escape(code, true))
		+ '\n</code></pre>\n';
};

Renderer.prototype.blockquote = function(quote) {
	return '<blockquote>\n' + quote + '</blockquote>\n';
};

Renderer.prototype.html = function(html) {
	return html;
};

Renderer.prototype.heading = function(text, level, raw) {
	return '<h'
		+ level
		+ ' id="'
		+ this.options.headerPrefix
		+ raw.toLowerCase().replace(/[^\w]+/g, '-')
		+ '">'
		+ text
		+ '</h'
		+ level
		+ '>\n';
};

Renderer.prototype.hr = function() {
	return this.options.xhtml ? '<hr/>\n' : '<hr>\n';
};

Renderer.prototype.list = function(body, ordered) {
	var type = ordered ? 'ol' : 'ul';
	return '<' + type + '>\n' + body + '</' + type + '>\n';
};

Renderer.prototype.listitem = function(text) {
	return '<li>' + text + '</li>\n';
};

Renderer.prototype.qlist = function(body) {
	return '<ol class="ques-answer ques-choice ques-list">\n' + body + '</ol>\n';
};

Renderer.prototype.qlistitem = function(text, index) {
	return '<li><input type="radio" name="ques' + qId + '" ' + (index === qAnsTmp && 'checked') + '> ' + text + '</li>\n';
};

Renderer.prototype.paragraph = function(text) {
	return '<p>' + text + '</p>\n';
};

Renderer.prototype.parabr = function(text) {
	return text.replace(/^ +/g, function(m) {
		out = '';
		for(var i = 0; i < m.length; i++)
			out += '&nbsp;';
		return out;
	}) + (this.options.xhtml ? '<br/>' : '<br>');
};

Renderer.prototype.table = function(header, body) {
	return '<table>\n'
		+ '<thead>\n'
		+ header
		+ '</thead>\n'
		+ '<tbody>\n'
		+ body
		+ '</tbody>\n'
		+ '</table>\n';
};

Renderer.prototype.tablerow = function(content) {
	return '<tr>\n' + content + '</tr>\n';
};

Renderer.prototype.tablecell = function(content, flags) {
	var type = flags.header ? 'th' : 'td';
	var tag = flags.align
		? '<' + type + ' style="text-align:' + flags.align + '">'
		: '<' + type + '>';
	return tag + content + '</' + type + '>\n';
};

// span level renderer
Renderer.prototype.latex = function(text, isDisplay) {
	var out = '';
	try {
		if(isDisplay) {
			text = '\\displaystyle {' + text + '}';
			out = katex.renderToString(text).replace(/^<span/, '<div').replace(/\/span>$/, '\/div>');
		} else
			out = katex.renderToString(text);
	} catch (e) {};
	return out;
};

Renderer.prototype.strong = function(text) {
	return '<strong>' + text + '</strong>';
};

Renderer.prototype.em = function(text) {
	return '<em>' + text + '</em>';
};

Renderer.prototype.codespan = function(text) {
	return '<code>' + text + '</code>';
};

Renderer.prototype.br = function() {
	return this.options.xhtml ? '<br/>' : '<br>';
};

Renderer.prototype.del = function(text) {
	return '<del>' + text + '</del>';
};
 
Renderer.prototype.link = function(href, title, text) {
	if (this.options.sanitize) {
		try {
			var prot = decodeURIComponent(unescape(href))
				.replace(/[^\w:]/g, '')
				.toLowerCase();
		} catch (e) {
			return '';
		}
		if (prot.indexOf('javascript:') === 0) {
			return '';
		}
	}
	var out = '<a href="' + href + '"';
	if (title) {
		out += ' title="' + title + '"';
	}
	out += '>' + text + '</a>';
	return out;
};

Renderer.prototype.image = function(href, title, text) {
	if(this.options.urlExtend)
		href = href.replace(/^~\//, this.options.urlExtend);
	
	var out = '<img src="' + href + '" alt="' + text + '"';
	if (title) {
		out += ' title="' + title + '"';
	}
	out += this.options.xhtml ? '/>' : '>';
	return out;
};

Renderer.prototype.qanswer = function(type, answer, score) {
	var out = '';
	if(type === '~@') {
		out += this.score(score);
		if(answer === 'T')
			out += '<div class="ques-answer ques-tof"><input type="radio" name="ques' + qId + '" checked>T &nbsp; &nbsp; &nbsp; &nbsp; <input type="radio"  name="ques' + qId + '">F</div>'
		else if(answer === 'F')
			out += '<div class="ques-answer ques-tof"><input type="radio" name="ques' + qId + '">T &nbsp; &nbsp; &nbsp; &nbsp; <input type="radio" name="ques' + qId + '" checked>F</div>'
		else
			out += '<div class="ques-answer ques-tof"><input type="radio" name="ques' + qId + '">T &nbsp; &nbsp; &nbsp; &nbsp; <input type="radio" name="ques' + qId + '">F</div>'
	} else if(type === '@') {
		out += this.score(score);
		qAnsTmp = answer.charCodeAt() - 'A'.charCodeAt();
	} else if(type === '@@') {
		out += '<input class="ques-answer" type="text" value="' + answer + '">';
		out += this.score(score);
	} else if(type === '@@@') {
		out += this.score(score, 'block');
		out += '<textarea class="ques-answer">' + answer + '</textarea>';
	}
	qId++;
	return out;
};

Renderer.prototype.score = function(score, type) {
	if(!score)
		return '';
	
	if(type === 'block')
		return '<div class="ques-score">' + this.options.scoreFormat.replace(/%/g, score) + '</div>';
	else
		return '<span class="ques-score">' + this.options.scoreFormat.replace(/%/g, score) + '</span>';
}

/*
 * Parsing & Compiling
 */
function Parser(options) {
	this.tokens = [];
	this.token = null;
	this.options = options || ques.options;
	this.options.renderer = this.options.renderer || new Renderer;
	this.renderer = this.options.renderer;
	this.renderer.options = this.options;
}

// Static Parse Method
Parser.parse = function(src, options, renderer) {
	var parser = new Parser(options, renderer);
	return parser.parse(src);
};

// Parse Loop
Parser.prototype.parse = function(src) {
	this.inline = new InlineLexer(src.links, this.options, this.renderer);
	this.tokens = src.reverse();

	var out = '';
	while (this.next()) {
		out += this.tok();
	}

	return out;
};

// Next Token
Parser.prototype.next = function() {
	return this.token = this.tokens.pop();
};

// Preview Next Token
Parser.prototype.peek = function() {
	return this.tokens[this.tokens.length - 1] || 0;
};

// Parse Text Tokens
Parser.prototype.parseText = function() {
	var body = this.token.text;

	while (this.peek().type === 'text') {
		body += '\n' + this.next().text;
	}

	return this.inline.output(body);
};

// Parse Current Token
Parser.prototype.tok = function() {
	switch (this.token.type) {
		case 'space': {
			return '';
		}
		case 'hr': {
			return this.renderer.hr();
		}
		case 'heading': {
			return this.renderer.heading(
				this.inline.output(this.token.text),
				this.token.depth,
				this.token.text);
		}
		case 'code': {
			return this.renderer.code(this.inline.codeOutput(this.token.text),
				this.token.lang,
				true); //this.token.escaped);
		}
		case 'latex': {
			return this.renderer.latex(this.token.text, true);
		}
		case 'table': {
			var header = ''
				, body = ''
				, i
				, row
				, cell
				, flags
				, j;

			// header
			cell = '';
			for (i = 0; i < this.token.header.length; i++) {
				flags = { header: true, align: this.token.align[i] };
				cell += this.renderer.tablecell(
					this.inline.output(this.token.header[i]),
					{ header: true, align: this.token.align[i] }
				);
			}
			header += this.renderer.tablerow(cell);

			for (i = 0; i < this.token.cells.length; i++) {
				row = this.token.cells[i];

				cell = '';
				for (j = 0; j < row.length; j++) {
					cell += this.renderer.tablecell(
						this.inline.output(row[j]),
						{ header: false, align: this.token.align[j] }
					);
				}

				body += this.renderer.tablerow(cell);
			}
			return this.renderer.table(header, body);
		}
		case 'blockquote_start': {
			var body = '';

			while (this.next().type !== 'blockquote_end') {
				body += this.tok();
			}

			return this.renderer.blockquote(body);
		}
		case 'list_start': {
			var body = ''
				, ordered = this.token.ordered;

			while (this.next().type !== 'list_end') {
				body += this.tok();
			}

			return this.renderer.list(body, ordered);
		}
		case 'list_item_start': {
			var body = '';

			while (this.next().type !== 'list_item_end') {
				body += this.token.type === 'text'
					? this.parseText()
					: this.tok();
			}

			return this.renderer.listitem(body);
		}
		case 'loose_item_start': {
			var body = '';

			while (this.next().type !== 'list_item_end') {
				body += this.tok();
			}

			return this.renderer.listitem(body);
		}
		case 'qlist_start': {
			var body = '';

			while (this.next().type !== 'qlist_end') {
				body += this.tok();
			}

			return this.renderer.qlist(body);
		}
		case 'qlist_item_start': {
			var body = '';

			while (this.next().type !== 'qlist_item_end') {
				body += this.token.type === 'text'
					? this.parseText()
					: this.tok();
			}

			return this.renderer.qlistitem(body, this.token.index);
		}
		case 'qloose_item_start': {
			var body = '';

			while (this.next().type !== 'qlist_item_end') {
				body += this.tok();
			}

			return this.renderer.qlistitem(body, this.token.index);
		}
		case 'html': {
			var html = !this.token.pre
				? this.inline.output(this.token.text)
				: this.token.text;
			return this.renderer.html(html);
		}
		case 'paragraph': {
			return this.renderer.paragraph(this.inline.output(this.token.text));
		}
		case 'text': {
			//console.log(this.options.markdown);
			return this.options.markdown ? this.renderer.paragraph(this.parseText()) : this.renderer.parabr(this.parseText());
		}
	}
};

/*
 * Helpers
 */
function escape(html, encode) {
	return html
		.replace(!encode ? /&(?!#?\w+;)/g : /&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function unescape(html) {
	return html.replace(/&([#\w]+);/g, function(_, n) {
		n = n.toLowerCase();
		if (n === 'colon') return ':';
		if (n.charAt(0) === '#') {
			return n.charAt(1) === 'x'
				? String.fromCharCode(parseInt(n.substring(2), 16))
				: String.fromCharCode(+n.substring(1));
		}
		return '';
	});
}

function replace(regex, opt) {
	regex = regex.source;
	opt = opt || '';
	return function self(name, val) {
		if (!name) return new RegExp(regex, opt);
		val = val.source || val;
		val = val.replace(/(^|[^\[])\^/g, '$1');
		regex = regex.replace(name, val);
		return self;
	};
}

function noop() {}
noop.exec = noop;

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

var qId = 0;
var qAnsTmp = '';
/*
 * Options
 */

ques = {};
	
ques.defaults = {
	markdown: true,
	gfm: true,
	tables: true,
	breaks: false,
	sanitize: false,
	silent: false,
	highlight: null,
	langPrefix: 'lang-',
	smartypants: false,
	headerPrefix: '',
	renderer: new Renderer,
	xhtml: false,
	urlExtend: '/api/file/attachment?id=',
	scoreFormat: '(%分)'
};
	
ques.options = extend({}, ques.defaults);

ques.setOptions = function(opt) {
	extend(ques.options, opt);
	return ques;
};

/*
 * Expose
 */
ques.parse = function(src) {
	return '<div class="ques-view">' + Parser.parse(Lexer.lex(src)) + '</div>';
}

ques.render = function(src, answers) {
	return ques.parse(answers ? ques.setAnswers(src, answers) : src);
}

ques.getAnswers = function(src) {
	var answers = [];
	if(src instanceof Element) {
		elements = src.getElementsByClassName('ques-answer');
		console.log(elements);
	} else {
		var cap;
		inline.qanswer2.lastIndex = 0;
		while(cap = inline.qanswer2.exec(src))
			answers.push(cap[2]);
	}
	return answers;
}

ques.setAnswers = function(src, answers) {
	if(answers === undefined || answers === null)
		return src;

	if(typeof answers !== 'object')
		answers = [answers];

	var i = 0;
	return src.replace(inline.qanswer2, function(m, $1, $2, $3) {
		return $1 + '[' + (answers[i++] || '') + '](' + $3 + ')';
	});
}

ques.clearAnswers = function(src) {
	return src.replace(inline.qanswer2, function(m, $1, $2, $3) {
		return $1 + '[](' + $3 + ')';
	});
}

ques.getScores = function(src) {
	var cap;
	var scores = [];
	inline.qanswer2.lastIndex = 0;
	while(cap = inline.qanswer2.exec(src))
		scores.push(cap[3]);
	return scores;
}

ques.setScores = function(src, scores) {
	if(scores === undefined || scores === null)
		return src;

	if(typeof scores !== object)
		scores = [scores];

	var i = 0;
	return src.replace(inline.qanswer2, function(m, $1, $2, $3) {
		return $1 + '[' + $2 + '](' + (scores[i++] || '') + ')';
	});
	return scores;
}

ques.getQueses = function(src) {
	var cap;
	var queses = [];
	inline.qanswer2.lastIndex = 0; // For IE8-
	while(cap = inline.qanswer2.exec(src))
		queses.push({type: cap[1], answer: cap[2], score: cap[3]});
	return queses;
}

if (typeof module !== 'undefined' && typeof exports === 'object') {
	module.exports = ques;
} else if (typeof define === 'function' && define.amd) {
	define(function() { return ques; });
} else {
	this.ques = ques;
}

}).call(function() {
	return this || (typeof window !== 'undefined' ? window : global);
}());
