"use strict";

function devcons() {
	const canvas = document.getElementById('canvas');
	const ctx = canvas.getContext('2d');
	
	const kbmap = {
		Enter: '\n',
		Alt: '\uf015',
		Shift: '\uf016',
		Control: '\uf017',
		End: '\uf018',
		Home: '\uf00d',
		ArrowUp: '\uf00e',
		ArrowDown: '\uf800',
		ArrowLeft: '\uf011',
		ArrowRight: '\uf012',
		PageDown: '\uf013',
		Insert: '\uf014',
		Delete: '\u007f',
		PageUp: '\uf00f',
		Backspace: '\b',
		Tab: '\t',
		Escape: '\u001b',
		Minus: '-',
		Equal: '=',
		BracketLeft: '[',
		BracketRight: ']',
		Semicolon: ';',
		Quote: '\'',
		Backquote: '`',
		Backslash: '\\',
		Comma: ',',
		Period: '.',
		Slash: '/',
	};
	let kbqueue = [];
	let kbreaders = [];
	function kbinput(s) {
		kbqueue.push(s);
		if(kbreaders.length > 0)
			kbreaders.shift()();
	}
	function keymap(k){
		if(k.length == 1)
			return k;
		else if(k in kbmap)
			return kbmap[k];
		else
			return null;
	}
	document.addEventListener('keydown', function(event){
		let m = keymap(event.key);
		if(m === null) return;
		if(event.ctrlKey && event.shiftKey) return;
		kbinput('r' + m + '\0');
		event.preventDefault();
	});
	document.addEventListener('keyup', function(event){
		let m = keymap(event.key);
		if(m === null) return;
		if(event.ctrlKey && event.shiftKey) return;
		kbinput('R' + m + '\0');
		event.preventDefault();
	});
	
	const devkbd = new File('kbd', 0, dev);
	devkbd.read = function(fid, count, offset){
		function f(resolve){
			resolve(kbqueue.shift().substr(0, count));
		}
		return new Promise((resolve, reject) => {
			if(kbqueue.length == 0)
				kbreaders.push(() => f(resolve));
			else
				f(resolve);
		});
	}
	const devcons = new File('cons', 0, dev);
	devcons.read = function(fid, count, offset){
		return '';
	}
	
	let lh = 18;
	let bord0 = 20;
	let bord1 = 25;
	let bheight = lh * 1.5 | 0;
	let lm = bord1+5;
	let rm = canvas.width - 10;
	let tm = bord1+bheight+5;
	let bm = canvas.height - bord1 - lh;
	let px, py;
	function clearcons() {
		ctx.fillStyle = '#0000cc';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = '#000000';
		ctx.fillRect(bord0, bord0, canvas.width-2*bord0, canvas.height-2*bord0);
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(bord1, bord1, canvas.width-2*bord1, canvas.height-2*bord1);
		ctx.fillStyle = '#cccccc';
		ctx.fillRect(bord1, bord1, canvas.width-2*bord1, bheight);
		ctx.font = '16px Courier';
		ctx.textBaseline = 'top';
		ctx.fillStyle = 'black';
		ctx.fillText('Plan 9 Console', bord1+10, bord1 + (bheight - lh) / 2);
		px = lm;
		py = tm;
	}
	let content = [''];
	function redraw() {
		clearcons();
		py = tm;
		for(var i = 0; i < content.length; i++){
			let m = ctx.measureText(content[i]);
			ctx.fillText(content[i], lm, py);
			px = lm + m.width;
			py += lh;
		}
		py -= lh;
	}
	function writechar(c) {
		function newline(){
			if(py + lh >= bm){
				content.shift();
				redraw();
			}
			px = lm;
			py += lh;
			content.push('');
		}
		if(c == '\n') return newline();
		if(c == '\b'){
			let n = content.length - 1;
			if(n >= 0){
				content[n] = content[n].substr(0, content[n].length - 1);
				redraw();
			}
			return;
		}
		let m = ctx.measureText(c);
		if(px + m.width >= rm)
			newline();
		ctx.fillText(c, px, py);
		px += m.width;
		content[content.length - 1] += c;
	}
	devcons.write = function(fid, data, offset){
		ctx.fillStyle = 'white';
		ctx.fillRect(px, py, 1, lh);
		ctx.fillStyle = 'black';
		let s = new TextDecoder('utf-8').decode(data);
		for(let i = 0; i < s.length; i++)
			writechar(s[i]);
		ctx.fillRect(px, py, 1, lh);
	};
	clearcons();
	
	const devnull = new File('null', 0, dev);
	devnull.read = function(fid, count, offset){return '';}
	devnull.write = function(fid, data, offset){}
	const devzero = new File('zero', 0, dev);
	devzero.read = function(fid, count, offset){return new Uint8Array(count);}
	devzero.write = function(fid, data, offset){}
	
	var mousereaders = [];
	const devmouse = new File('mouse', 0, dev);
	devmouse.read = function(fid, count, offset){
		return new Promise(function(resolve, reject){
			mousereaders.push(s => resolve(s.substr(0, count)));
		});
	}
	function mouse(event){
		let f = mousereaders.shift();
		if(f === undefined) return;
		let rect = canvas.getBoundingClientRect()
		let s = 'm' + [
				event.clientX - rect.left,
				event.clientY - rect.top,
				event.buttons & 1 | event.buttons >> 1 & 2 | event.buttons << 1 & 4,
				event.timeStamp|0
			].map(s => s.toString().padStart(11)).join(' ') + ' ';
		f(s);
	}
	canvas.addEventListener('mousedown', mouse);
	canvas.addEventListener('mousemove', mouse);
	canvas.addEventListener('mouseup', mouse);
	canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}
