function devdraw() {
	const canvas = document.getElementById('canvas');
	const ctx = canvas.getContext('2d');
	const imageData = ctx.createImageData(canvas.width, canvas.height);

	const DNofill = 0xFFFFFF00;
	const SoverD = 11;
	const Frepl = 1<<0;
	
	const displayRect = {min: {x: 0, y: 0}, max: {x: canvas.width, y: canvas.height}};
	
	C.memimageinit();
	
	var publicImages = {};

	const Char = {
		get: (b,o) => String.fromCharCode(U8.get(b,o)),
		put: (b,c,o) => U8.put(b,c.charCodeAt(0),o)
	};
	const point = Struct(['x', u32, 'y', u32]);
	const rect = Struct(['min', point, 'max', point]);
	const msgFmt = Struct([
		'type', Char,
		null, Select(o=>o.type, {
			A: Struct(['id', u32, 'imageid', u32, 'fillid', u32, 'public', u8]),
			b: Struct(['id', u32, 'screenid', u32, 'refresh', u8, 'chan', u32, 'repl', u8, 'r', rect, 'clipr', rect, 'color', u32]),
			c: Struct(['id', u32, 'repl', u8, 'clipr', rect]),
			d: Struct(['dstid', u32, 'srcid', u32, 'maskid', u32, 'dstr', rect, 'srcp', point, 'maskp', point]),
			f: Struct(['id', u32]),
			F: Struct(['id', u32]),
			i: Struct(['id', u32,  'n', u32, 'ascent', u8]),
			O: Struct(['op', u8]),
			v: Struct([]),
			y: Struct(['id', u32, 'r', rect]),
			Y: Struct(['id', u32, 'r', rect]),
			l: Struct(['cacheid', u32, 'srcid', u32, 'index', u16, 'r', rect, 'sp', point, 'left', u8, 'width', u8]),
			s: Struct(['dstid', u32, 'srcid', u32, 'fontid', u32, 'p', point, 'clipr', rect, 'sp', point, 'index', Array(u16, u16)]),
			n: Struct(['id', u32, 'name', VariableString(u8)]),
			N: Struct(['id', u32, 'in', u8, 'name', VariableString(u8)]),
			x: Struct(['dstid', u32, 'srcid', u32, 'fontid', u32, 'dp', point, 'clipr', rect, 'sp', point, 'bgid', u32, 'bp', point, 'index', Array(u16, u16)]),
		})
	]);

	const top = new File('draw', QTDIR, dev);
	const _new = new File('new', 0, top);
	var ids = 0;
	
	function withPoint(p, f){
		return withBuf(8, buf => {
			Module.HEAPU32.set([p.x, p.y], buf>>2);
			return f(buf);
		});
	}
	function withRectangle(r, f){
		return withBuf(16, buf => {
			Module.HEAPU32.set([r.min.x, r.min.y, r.max.x, r.max.y], buf>>2);
			return f(buf);
		});
	}
	function withRectangleP(r, f){
		return withBufP(16, buf => {
			Module.HEAPU32.set([r.min.x, r.min.y, r.max.x, r.max.y], buf>>2);
			return f(buf);
		});
	}

	function Screen(image, fill, public) {
		this.C = C.mallocz(4*4, 1);
		Module.HEAPU32.set([image.C, fill.C], (this.C>>2) + 2);
	}
	function Image(m, screen) {
		this.id = m.id;
		this.refresh = m.refresh;
		this.chan = m.chan;
		this.r = m.r;
		if(m.screenid != 0){
			this.layer = true;
			if(m.repl) throw new Error("no repl on screen");
			this.C = withRectangle(m.r, r => C.memlalloc(screen.C, r, 0, 0, m.color));
			if(!this.C) throw new Error("memlalloc: " + errstr());
		}else{
			this.layer = false;
			this.C = withRectangle(m.r, r => C.allocmemimage(r, this.chan));
			if(!this.C) throw new Error("allocmemimage: " + errstr());
			if(m.color !== DNofill)
				C.memfillcolor(this.C, m.color);
		}
		this.cliprepl(m.repl, m.clipr);
	}
	Image.prototype.cliprepl = function(repl, clipr) {
		this.clipr = clipr;
		if(repl)
			C.memimageflags(this.C, Frepl, 0);
		Module.HEAPU32.set([clipr.min.x, clipr.min.y, clipr.max.x, clipr.max.y], (this.C>>2)+4);
	}
	Image.prototype.free = function() {
		if(this.layer)
			C.memldelete(this.C);
		else
			C.freememimage(this.C);
		this.C = 0;
	}
	Image.prototype.load = function(r, compressed, src) {
		return withRectangleP(r, Cr =>
			src.read(b => {
				if(b.length == 0) return -1;
				return withBuf(b.length, (buf, buf_array) => {
					buf_array.set(b);
					return C.memload(this.C, Cr, buf, b.length, compressed|0);
				});
			}));
	};
	Image.prototype.unload = function(r) {
		if(r == undefined) r = this.r;
		let n = (r.max.x - r.min.x) * (r.max.y - r.min.y) * 4;
		return withRectangle(r, Cr =>
			withBuf(n, (buf, buf_array) => {
				let m = C.memunload(this.C, Cr, buf, n);
				if(m < 0)
					throw new Error('memunload: ' + errstr());
				return buf_array.slice(0, m);
			}));
	}
	Image.prototype.draw = function(src, mask, dstr, srcp, maskp, op) {
		withPoint(srcp, Csrcp =>
		withPoint(maskp, Cmaskp =>
		withRectangle(dstr, Cdstr =>
			C.memdraw(this.C, Cdstr, src.C, Csrcp, mask === null ? 0 : mask.C, Cmaskp, op)
		)));
	}
	var gscreen = new Image({
		id: 0,
		r: displayRect,
		clipr: displayRect,
		chan: 0x48281808,
		fill: 0xFF,
		screenid: 0
	});
	function Font(img, n, ascent) {
		img.font = this;
		this.img = img;
		this.n = n;
		this.chars = [];
		this.ascent = ascent;
	}
	Font.prototype.load = function(src, index, r, sp, left, width) {
		this.img.draw(src, null, r, sp, {x:0, y:0}, SoverD);
		this.chars[index] = {r: r, width: width, left: left};
	}
	Image.prototype.stringbg = function(src, fontimg, p, clipr, sp, index, bg, bp, op) {
		Module.HEAPU32.set([clipr.min.x, clipr.min.y, clipr.max.x, clipr.max.y], (this.C>>2)+4);
		let r = {min: {}, max: {}};
		r.min.x = p.x;
		r.min.y = p.y - fontimg.font.ascent;
		r.max.x = p.x;
		r.max.y = p.y + (fontimg.r.max.y - fontimg.r.min.y);
		for(var i = 0; i < index.length; i++)
			r.max.x += fontimg.font.chars[index[i]].width;
		this.draw(bg, null, r, bp, {x:0,y:0}, op);
		this.string(src, fontimg, p, clipr, sp, index, op);
	}
	Image.prototype.string = function(src, fontimg, p, clipr, sp, index, op) {
		Module.HEAPU32.set([clipr.min.x, clipr.min.y, clipr.max.x, clipr.max.y], (this.C>>2)+4);
		for(var i = 0; i < index.length; i++){
			let c = fontimg.font.chars[index[i]];
			let dr = {min: {}, max: {}};
			dr.min.x = p.x + c.left;
			dr.min.y = p.y - (fontimg.font.ascent - c.r.min.y);
			dr.max.x = dr.min.x + (c.r.max.x - c.r.min.x);
			dr.max.y = dr.min.y + (c.r.max.y - c.r.min.y);
			let sp1 = {x: sp.x + c.left, y: sp.y + c.r.min.y};
			this.draw(src, fontimg, dr, sp1, c.r.min, op);
			p.x += c.width;
			sp.x += c.width;
		}
		Module.HEAPU32.set([this.clipr.min.x, this.clipr.min.y, this.clipr.max.x, this.clipr.max.y], (this.C>>2)+4);
	}
	function flush() {
		let p = withPoint(gscreen.r.min, p => C.byteaddr(gscreen.C, p));
		imageData.data.set(Module.HEAPU8.subarray(p, p + displayRect.max.x * displayRect.max.y * 4));
		ctx.putImageData(imageData, 0, 0);
	}
	_new.open = function(fid) {
		var num = ids++;
		var dir = new File(num.toString(), QTDIR, top);
		var ctl = new File('ctl', 0, dir);
		fid.file = ctl;
		var data = new File('data', 0, dir);
		var colormap = new File('colormap', 0, dir);
		var refresh = new File('refresh', 0, dir);
		
		var queue = new Packet();
		var drawop = SoverD;
		
		var images = {0: gscreen};
		var screens = {};

		ctl.read = function(fid, count, offset){
			var str = [num, 0, 'r8g8b8', 0, 0, 0, 1024, 768, 0, 0, 1024, 768].map(n => n.toString().padStart(11)).join(' ') + ' ';
			return str.substr(offset, count);
		};
		data.write = function(fid, data, offset){
			queue.write(data);
		}
		function recvMsg() {
			function msglen(b){
				if(b.length == 0) return -1;
				switch(String.fromCharCode(b[0])){
				case 'A': return 1 + 4 + 4 + 4 + 1;
				case 'b': return 1 + 4 + 4 + 1 + 4 + 1 + 4*4 + 4*4 + 4;
				case 'c': return 1 + 4 + 1 + 4*4;
				case 'd': return 1 + 4 + 4 + 4 + 4*4 + 2*4 + 2*4;
				case 'D': return 1 + 1;
				case 'e': return 1 + 4 + 4 + 2*4 + 4 + 4 + 4 + 2*4 + 4 + 4;
				case 'E': return 1 + 4 + 4 + 2*4 + 4 + 4 + 4 + 2*4 + 4 + 4;
				case 'f': return 1 + 4;
				case 'F': return 1 + 4;
				case 'i': return 1 + 4 + 4 + 1;
				case 'l': return 1 + 4 + 4 + 2 + 4*4 + 2*4 + 1 + 1;
				case 'L': return 1 + 4 + 2*4 + 2*4 + 4 + 4 + 4 + 4 + 2*4;
				case 'N': {
					let h = 1 + 4 + 1 + 1;
					if(b.length < h) return -1;
					let n = h + b[h-1];
					return n;
				}
				case 'n': {
					let h = 1 + 4 + 1;
					if(b.length < h) return -1;
					let n = h + b[h-1];
					return n;
				}
				case 'o': return 1 + 4 + 2*4 + 2*4;
				case 'O': return 1 + 1;
				//case 'p': return 1 + 4 + 2 + 4 + 4 + 4 + 4 + 2*4 + 2*2*(n+1);
				//case 'P': return 1 + 4 + 2 + 4 + 2*4 + 4 + 2*4 + 2*2*(n+1);
				case 'r': return 1 + 4 + 4*4;
				case 's': {
					let h = 1 + 4 + 4 + 4 + 2*4 + 4*4 + 2*4 + 2;
					if(b.length < h) return -1;
					let n = h + 2 * (b[h-2] | b[h-1] << 8);
					return n;
				}
				case 'x': {
					let h = 1 + 4 + 4 + 4 + 2*4 + 4*4 + 2*4 + 2;
					if(b.length < h) return -1;
					let n = h + 2 * (b[h-2] | b[h-1] << 8) + 4 + 2*4;
					return n;
				}
				case 'S': return 1 + 4 + 4;
				case 't': return 1 + 1 + 2 + 4;
				case 'v': return 1;
				case 'y': return 1 + 4 + 4*4;
				case 'Y': return 1 + 4 + 4*4;
				default:
					throw new Error('msglen: unknown draw message ' + String.fromCharCode(b[0]));
				}
			}
			queue.read(msglen)
			.then(b => {
				if(b[0] == 120){ /* x is stupid */
					let h = 1 + 4 + 4 + 4 + 2*4 + 4*4 + 2*4;
					let r = b.slice(h, h+2);
					b.copyWithin(h, h+2, h+2+4+2*4);
					b.set(r, h+4+2*4);
				}
				return unpack(msgFmt, b);
			}).then(m => {
				console.log(m);
				switch(m.type){
				case 'A': screens[m.id] = new Screen(images[m.imageid], images[m.fillid], m.public); break;
				case 'b': images[m.id] = new Image(m, screens[m.screenid]); break;
				case 'c': images[m.id].cliprepl(m.repl, m.clipr); break;
				case 'd': images[m.dstid].draw(images[m.srcid], images[m.maskid], m.dstr, m.srcp, m.maskp, drawop); break;
				case 'f': images[m.id].free(); delete images[m.id]; break;
				case 'y': return images[m.id].load(m.r, false, queue); break;
				case 'Y': return images[m.id].load(m.r, true, queue); break;
				case 'O': drawop = m.op; break;
				case 'v': flush(); break;
				case 'i': new Font(images[m.id], m.n, m.ascent); break;
				case 'l': images[m.cacheid].font.load(images[m.srcid], m.index, m.r, m.sp, m.left, m.width); break;
				case 's': images[m.dstid].string(images[m.srcid], images[m.fontid], m.p, m.clipr, m.sp, m.index, drawop); break;
				case 'x': images[m.dstid].stringbg(images[m.srcid], images[m.fontid], m.dp, m.clipr, m.sp, m.index, images[m.bgid], m.bp, drawop); break;
				case 'N': {
					if(m.in)
						publicImages[m.name] = images[m.id];
					else
						delete publicImages[m.name];
					break;
				}
				case 'n': images[m.id] = publicImages[m.name]; break;
				default: throw new Error('recvMsg: unknown draw message ' + m.type);
				}
			})
			.then(recvMsg);
		}
		recvMsg();
	};
}
