"use strict";

var mouseresize, conspaint;

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
		if(event.key === undefined) return;
		let m = keymap(event.key);
		if(m === null) return;
		if(event.ctrlKey && event.shiftKey) return;
		kbinput('r' + m + '\0');
		event.preventDefault();
	});
	document.addEventListener('keyup', function(event){
		if(event.key === undefined) return;
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
	conspaint = redraw;
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
	
	var mousestate = 'm' + [0, 0, 0, 0].map(s => s.toString().padStart(11)).join(' ') + ' ';
	var mousereaders = [];
	const devmouse = new File('mouse', 0, dev);
	devmouse.read = function(fid, count, offset){
		return new Promise(function(resolve, reject){
			mousereaders.push(s => resolve(s.substr(0, count)));
		});
	}
	mouseresize = function(){
		let f = mousereaders.shift();
		if(f !== undefined)
			f('r' + mousestate.substr(1));
	};
	function mouse(event){
		let rect = canvas.getBoundingClientRect()
		let mousestate = 'm' + [
				event.clientX - rect.left,
				event.clientY - rect.top,
				event.buttons & 1 | event.buttons >> 1 & 2 | event.buttons << 1 & 4,
				event.timeStamp|0
			].map(s => s.toString().padStart(11)).join(' ') + ' ';
		let f = mousereaders.shift();
		if(f !== undefined)
			f(mousestate);
	}
	canvas.addEventListener('mousedown', mouse);
	canvas.addEventListener('mousemove', mouse);
	canvas.addEventListener('mouseup', mouse);
	canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
	
	const devcursor = new File('cursor', 0, dev);
	const cursorFmt = Struct(['x', u32, 'y', u32, 'clr', Bytes(32), 'set', Bytes(32)]);
	const CURfmt = Struct([
		'reserved', u16,
		'img_type', u16,
		'img_num', u16,
		'width', u8,
		'height', u8,
		'colors', u8,
		'reserved2', u8,
		'hotspot_x', u16,
		'hotspot_y', u16,
		'size', u32,
		'offset', u32,
		'bmp_header_size', u32,
		'bmp_width', u32,
		'bmp_height', u32,
		'bmp_planes', u16,
		'bmp_bpp', u16,
		'bmp_comp', u32,
		'bmp_size', u32,
		'bmp_hres', u32,
		'bmp_vres', u32,
		'bmp_colors', u32,
		'bmp_important', u32,
		'col0', u32,
		'col1', u32,
		'xor', Bytes(64),
		'and', Bytes(64),
	]);
	var cursor = null;
	devcursor.read = function(fid, count, offset){
		if(cursor == null) return 0;
		return cursor.slice(offset, offset+count);
	}
	devcursor.write = function(fid, data, offset){
		if(data.length < 72){
			canvas.style.cursor = '';
			cursor = null;
			return data.length;
		}
		cursor = unpack(cursorFmt, data);
		var cur = {
			reserved: 0,
			img_type: 2,
			img_num: 1,
			width: 16,
			height: 16,
			colors: 2,
			reserved2: 0,
			hotspot_x: -cursor.x,
			hotspot_y: -cursor.y,
			size: 176,
			offset: 22,
			bmp_header_size: 40,
			bmp_width: 16,
			bmp_height: 32,
			bmp_planes: 1,
			bmp_bpp: 1,
			bmp_comp: 0,
			bmp_size: 32,
			bmp_hres: 0,
			bmp_vres: 0,
			bmp_colors: 2,
			bmp_important: 0,
			col0: 0x00000000,
			col1: 0xffffffff,
			xor: new Uint8Array(64),
			and: new Uint8Array(64)
		};
		for(var i=0; i < 16; i++){
			cur.xor[4*i] = ~cursor.set[30-2*i];
			cur.xor[4*i+1] = ~cursor.set[31-2*i];
			cur.and[4*i] = ~(cursor.clr[30-2*i] | cursor.set[30-2*i]);
			cur.and[4*i+1] = ~(cursor.clr[31-2*i] | cursor.set[31-2*i]); 
		}
		var data = btoa(String.fromCharCode.apply(null, pack(CURfmt, cur).data()));
		canvas.style.cursor = 'url(data:image/x-icon;base64,' + data + '),auto';
		return 72;
	}
}
