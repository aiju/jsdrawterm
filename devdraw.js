function devdraw() {
	const canvas = document.getElementById('canvas');
	const ctx = canvas.getContext('2d');
	var imageData;

	const DNofill = 0xFFFFFF00;
	const SoverD = 11;
	const Frepl = 1<<0;
	
	const displayRect = {min: {x: 0, y: 0}, max: {x: canvas.width, y: canvas.height}};
	
	C.memimageinit();
	
	const Char = {
		get: (b,o) => String.fromCharCode(U8.get(b,o)),
		put: (b,c,o) => U8.put(b,c.charCodeAt(0),o)
	};
	function coord1(p){
		let b = p.get(1)[0];
		let x = b & 0x7f;
		if(b & 0x80){
			x |= p.get(1)[0] << 7;
			x |= p.get(1)[0] << 15;
			if(x & (1<<22))
				x |= ~0<<23;
			return oldx => x;
		}else{
			if(b & 0x40)
				x |= ~0<<7;
			return oldx => x + oldx;
		}
	}
	const coord = {
		get: (p,o) => {
			let a = coord1(p);
			let b = coord1(p);
			return old => ({x: a(old.x), y: b(old.y)});
		}
	};
	const point = Struct(['x', u32, 'y', u32]);
	const rect = Struct(['min', point, 'max', point]);
	const msgFmt = Struct([
		'type', Char,
		null, Select(o=>o.type, {
			A: Struct(['id', u32, 'imageid', u32, 'fillid', u32, 'public', u8]),
			b: Struct(['id', u32, 'screenid', u32, 'refresh', u8, 'chan', u32, 'repl', u8, 'r', rect, 'clipr', rect, 'color', u32]),
			c: Struct(['id', u32, 'repl', u8, 'clipr', rect]),
			D: Struct(['debugon', u8]),
			d: Struct(['dstid', u32, 'srcid', u32, 'maskid', u32, 'dstr', rect, 'srcp', point, 'maskp', point]),
			e: Struct(['dstid', u32, 'srcid', u32, 'c', point, 'a', u32, 'b', u32, 'thick', u32, 'sp', point, 'alpha', u32, 'phi', u32]),
			E: Struct(['dstid', u32, 'srcid', u32, 'c', point, 'a', u32, 'b', u32, 'thick', u32, 'sp', point, 'alpha', u32, 'phi', u32]),
			f: Struct(['id', u32]),
			F: Struct(['id', u32]),
			i: Struct(['id', u32,  'n', u32, 'ascent', u8]),
			l: Struct(['cacheid', u32, 'srcid', u32, 'index', u16, 'r', rect, 'sp', point, 'left', u8, 'width', u8]),
			L: Struct(['dstid', u32, 'p0', point, 'p1', point, 'end0', u32, 'end1', u32, 'thick', u32, 'srcid', u32, 'sp', point]),
			N: Struct(['id', u32, 'in', u8, 'name', VariableString(u8)]),
			n: Struct(['id', u32, 'name', VariableString(u8)]),
			o: Struct(['id', u32, 'rmin', point, 'scr', point]),
			O: Struct(['op', u8]),
			p: Struct(['dstid', u32, 'n', u16, 'X0', u32, 'X1', u32, 'X2', u32, 'srcid', u32, 'sp', point, 'dp', FnArray(o => o.n+1, coord)]),
			P: Struct(['dstid', u32, 'n', u16, 'X0', u32, 'X1', u32, 'X2', u32, 'srcid', u32, 'sp', point, 'dp', FnArray(o => o.n+1, coord)]),
			r: Struct(['id', u32, 'r', rect]),
			s: Struct(['dstid', u32, 'srcid', u32, 'fontid', u32, 'p', point, 'clipr', rect, 'sp', point, 'index', NArray(u16, u16)]),
			S: Struct(['id', u32, 'chan', u32]),
			t: Struct(['top', u8, 'id', NArray(u16, u32)]),
			v: Struct([]),
			x: Struct(['dstid', u32, 'srcid', u32, 'fontid', u32, 'dp', point, 'clipr', rect, 'sp', point, 'n', u16, 'bgid', u32, 'bp', point, 'index', FnArray(o=>o.n, u16)]),
			Y: Struct(['id', u32, 'r', rect]),
			y: Struct(['id', u32, 'r', rect])
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
	function withPoints(p, f){
		return withBuf(8 * p.length, buf => {
			Module.HEAPU32.set(p.map(x=>[x.x,x.y]).flat(), buf>>2);
			return f(buf);
		});
	}
	function withRectangle(r, f){
		return withBuf(16, buf => {
			Module.HEAPU32.set([r.min.x, r.min.y, r.max.x, r.max.y], buf>>2);
			return f(buf);
		});
	}

	function Screen(id, image, fill, public, owner) {
		this.id = id;
		this.ref = 1;
		this.C = C.mallocz(4*4, 1);
		image.incref();
		fill.incref();
		this.image = image;
		this.fill = fill;
		this.public = public;
		this.owner = owner;
		Module.HEAPU32.set([image.C, fill.C], (this.C>>2) + 2);
	}
	Screen.prototype.free = function() {
		console.log('decref ' + this.id + ' ' + (this.ref-1));
		if(this.ref <= 0) throw new Error('refcounting botch');
		if(--this.ref == 0){
			this.image.free();
			this.fill.free();
			C.free(this.C);
			delete this.C;
		}
	};
	Screen.prototype.incref = function() { this.ref++; console.log('incref ' + this.id + ' ' + this.ref); };
	function Image(m, screen) {
		this.ref = 1;
		this.id = m.id;
		this.refresh = m.refresh;
		if(m.refresh != 0 && m.refresh != 1)
			throw new Error("unknown refresh method " + m.refresh);
		this.chan = m.chan;
		this.r = m.r;
		if(m.screenid != 0){
			screen.incref();
			this.layer = true;
			this.screen = screen;
			if(!this.screen.C || !this.screen.image.C || !this.screen.fill.C) throw new Error("dead screen walking");
			if(m.repl) throw new Error("no repl on screen");
			this.C = withRectangle(m.r, r => C.memlalloc0(screen.C, r, m.refresh == 0, m.color));
			if(!this.C) throw new Error("memlalloc: " + errstr());
		}else{
			this.layer = false;
			this.screen = null;
			this.C = withRectangle(m.r, r => C.allocmemimage(r, this.chan));
			if(!this.C) throw new Error("allocmemimage: " + errstr());
			if(m.color !== DNofill)
				C.memfillcolor(this.C, m.color);
		}
		this.cliprepl(m.repl, m.clipr);
	}
	Image.prototype.incref = function() { this.ref++; console.log('image incref ' + this.id + ' ' + this.ref); };
	Image.prototype.free = function() {
		console.log('image decref ' + this.id + ' ' + (this.ref - 1)); 
		if(this.ref <= 0) throw new Error('refcounting botch');
		if(--this.ref > 0) return;
		if(this.name !== undefined) throw new Error('freeing named image -- shouldn\'t happen');
		if(this.layer){
			C.memldelete(this.C);
			this.screen.free();
		}else
			C.freememimage(this.C);
		delete this.C;
	}
	Image.prototype.cliprepl = function(repl, clipr) {
		this.clipr = clipr;
		this.repl = repl;
		if(repl)
			C.memimageflags(this.C, Frepl, 0);
		else
			C.memimageflags(this.C, 0, Frepl);
		Module.HEAPU32.set([clipr.min.x, clipr.min.y, clipr.max.x, clipr.max.y], (this.C>>2)+4);
	}
	Image.prototype.load = function(r, compressed, b) {
		return withRectangle(r, Cr => {
			if(b.rp >= b.p) return new Error('short read');
			return withBuf(b.p - b.rp, (buf, buf_array) => {
				buf_array().set(b.a.subarray(b.rp, b.p));
				let n = C.memload(this.C, Cr, buf, b.p - b.rp, compressed|0);
				if(n < 0) return new Error('bad writeimage call');
				b.rp += n;
			});
		});
	};
	Image.prototype.unload = function(r) {
		if(r == undefined) r = this.r;
		let n = (r.max.x - r.min.x) * (r.max.y - r.min.y) * 4;
		return withRectangle(r, Cr =>
			withBuf(n, (buf, buf_array) => {
				let m = C.memunload(this.C, Cr, buf, n);
				if(m < 0)
					throw new Error('memunload: ' + errstr());
				return buf_array().slice(0, m);
			}));
	}
	Image.prototype.draw = function(src, mask, dstr, srcp, maskp, op) {
		withPoint(srcp, Csrcp =>
		withPoint(maskp, Cmaskp =>
		withRectangle(dstr, Cdstr =>
			C.memdraw(this.C, Cdstr, src.C, Csrcp, mask === null ? 0 : mask.C, Cmaskp, op)
		)));
	}
	Image.prototype.origin = function(rmin, scr) {
		if(!this.layer) return;
		withPoint(rmin, Crmin =>
		withPoint(scr, Cscr =>
			C.memlorigin(this.C, Crmin, Cscr)
		));
	}
	Image.prototype.ellipse = function(src, c, a, b, thick, sp, alpha, phi, fill, op){
		withPoint(c, Cc =>
		withPoint(sp, Csp => {
			if(fill) thick = -1;
			if(alpha & (1<<31)){
				alpha = alpha << 1 >> 1;
				C.memarc(this.C, Cc, a, b, thick, src.C, Csp, alpha, phi, op);
			}else
				C.memellipse(this.C, Cc, a, b, thick, src.C, Csp, op);
		}));
	}
	Image.prototype.line = function(src, p0, p1, end0, end1, thick, sp, op){
		withPoint(p0, Cp0 =>
		withPoint(p1, Cp1 =>
		withPoint(sp, Csp =>
			C.memline(this.C, Cp0, Cp1, end0, end1, thick, src.C, Csp, op)
		)));
	}
	Image.prototype.poly = function(src, x0, x1, x2, sp, dp, fill, op){
		let l = {x:0, y:0};
		for(let i = 0; i < dp.length; i++)
			dp[i] = l = dp[i](l);
		withPoint(sp, Csp =>
		withPoints(dp, Cdp => {
			if(fill)
				C.memfillpoly(this.C, Cdp, dp.length, x0, src.C, Csp, op);
			else
				C.mempoly(this.C, Cdp, dp.length, x0, x1, x2, src.C, Csp, op);
		}));
	}
	function wintop(w, top){
		withBuf(w.length * 4, buf => {
			Module.HEAPU32.set(w.map(x=>x.C), buf>>2);
			if(top)
				C.memltofrontn(buf, w.length);
			else
				C.memltorearn(buf, w.length);
		});
	}
	var display;
	var displayidx = 0;
	function resize() {
		w = window.innerWidth;
		h = window.innerHeight;
		canvas.width = w;
		canvas.height = h;
		displayRect.max.x = w;
		displayRect.max.y = h;
		if(display) display.free();
		display = new Image({
			id: 0,
			r: displayRect,
			clipr: displayRect,
			chan: 0x48281808,
			fill: 0xFF,
			screenid: 0,
			repl: 0,
			refresh: 0
		});
		register("screen.noborder." + displayidx++, display);
		imageData = ctx.createImageData(w, h);
		mouseresize();
	}
	let resizeTimer;
	function resizeEvent(event) {
		console.log(event);
		if(resizeTimer)
			clearTimeout(resizeTimer);
		resizeTimer = setTimeout(resize, 250);
	}
	
	var publicImages = {};
	function register(name, img) {
		if(name in publicImages) return new Error("name used");
		if(img.name !== undefined) return new Error("image already has a name");
		console.log("register " + name);
		img.incref();
		img.name = name;
		publicImages[name] = img; 
	}
	function deregister(name, img) {
		if(!(name in publicImages)) return new Error("no such name");
		if(publicImages[name] !== img) return new Error("wrong name");
		console.log("deregister " + name);
		delete publicImages[name];
		delete img.name;
		img.decref();
	}

	const winname = new File("winname", 0, dev);
	winname.read = function(fid, count, offset) {
		return display.name.substr(offset, count);
	}
	
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
		r.max.y = r.min.y + (fontimg.r.max.y - fontimg.r.min.y);
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
		let p = withPoint(display.r.min, p => C.byteaddr(display.C, p));
		imageData.data.set(Module.HEAPU8.subarray(p, p + displayRect.max.x * displayRect.max.y * 4));
		ctx.putImageData(imageData, 0, 0);
	}
	var allscreens = {};
	_new.open = function(fid) {
		var num = ids++;
		var dir = new File(num.toString(), QTDIR, top);
		var ctl = new File('ctl', 0, dir);
		fid.file = ctl;
		var data = new File('data', 0, dir);
		var colormap = new File('colormap', 0, dir);
		var refresh = new File('refresh', 0, dir);

		var drawop = SoverD;
		
		var images = {};
		var myscreens = {};
		var infoid = 0;

		ctl.read = function(fid, count, offset){
			let w = infoid == 0 ? display : images[infoid];
			var str = [
					num, w.id, 'r8g8b8a8', w.repl,
					w.r.min.x, w.r.min.y, w.r.max.x, w.r.max.y,
					w.clipr.min.x, w.clipr.min.y, w.clipr.max.x, w.clipr.max.y
				].map(n => n.toString().padStart(11)).join(' ') + ' ';
			return str.substr(offset, count);
		};
		ctl.write = function(fid, data, offset){
			throw new Error("...");
		};
		function processmsg(m, buf) {
			switch(m.type){
			case 'A':
				if(m.id in allscreens) return new Error('screen id reused');
				if(!(m.imageid in images)) return new Error('no such image');
				if(!(m.fillid in images)) return new Error('no such image');
				myscreens[m.id] = allscreens[m.id] = new Screen(m.id, images[m.imageid], images[m.fillid], m.public, num);
				break;
			case 'b':
				if(m.id in images) return new Error('image id reused');
				if(m.screenid != 0 && !(m.screenid in myscreens)) return new Error('no such screen');
				images[m.id] = new Image(m, myscreens[m.screenid]);
				break;
			case 'c':
				if(!(m.id in images)) return new Error('no such image');
				images[m.id].cliprepl(m.repl, m.clipr);
				break;
			case 'd':
				if(!(m.dstid in images)) return new Error('no such image');
				if(!(m.srcid in images)) return new Error('no such image');
				if(!(m.maskid in images)) return new Error('no such image');
				images[m.dstid].draw(images[m.srcid], images[m.maskid], m.dstr, m.srcp, m.maskp, drawop);
				break;
			case 'D':
				break;
			case 'e':
			case 'E':
				if(!(m.dstid in images)) return new Error('no such image');
				if(!(m.srcid in images)) return new Error('no such image');
				if(m.a < 0 || m.b < 0) return new Error('invalid ellipse semidiameter');
				if(m.thick < 0) return new Error('invalid ellipse thickness');
				images[m.dstid].ellipse(images[m.srcid], m.c, m.a, m.b, m.thick, m.sp, m.alpha, m.phi, m.type == 'E', drawop);
				break;
			case 'f':
				if(!(m.id in images)) return new Error('no such image');
				images[m.id].free();
				delete images[m.id];
				break;
			case 'F':
				if(!(m.id in myscreens)) return new Error('no such image');
				myscreens[m.id].free();
				if(myscreens[m.id].owner == num)
					delete allscreens[m.id];
				delete myscreens[m.id];
				break;
			case 'i':
				if(!(m.id in images)) return new Error('no such image');
				new Font(images[m.id], m.n, m.ascent);
				break;
			case 'L':
				if(!(m.dstid in images)) return new Error('no such image');
				if(!(m.srcid in images)) return new Error('no such image');
				images[m.dstid].line(images[m.srcid], m.p0, m.p1, m.end0, m.end1, m.thick, m.sp, drawop);
				break;
			case 'l':
				if(!(m.cacheid in images)) return new Error('no such image');
				if(!(m.srcid in images)) return new Error('no such image');
				if(images[m.cacheid].font === undefined) return new Error('not a font');
				images[m.cacheid].font.load(images[m.srcid], m.index, m.r, m.sp, m.left, m.width);
				break;
			case 's':
				if(!(m.dstid in images)) return new Error('no such image');
				if(!(m.srcid in images)) return new Error('no such image');
				if(!(m.fontid in images)) return new Error('no such image');
				if(images[m.fontid].font === undefined) return new Error('not a font');
				images[m.dstid].string(images[m.srcid], images[m.fontid], m.p, m.clipr, m.sp, m.index, drawop);
				break;
			case 'N': {
				if(!(m.id in images)) return new Error('no such image');
				if(m.in)
					return register(m.name, images[m.id]);
				else
					return deregister(m.name, images[m.id]);
			}
			case 'n':
				if(!(m.name in publicImages)) return new Error('no such image');
				if(m.id in images) return new Error('image id reused');
				infoid = m.id;
				images[m.id] = publicImages[m.name];
				images[m.id].id = m.id;
				images[m.id].incref();
				break;
			case 'O':
				drawop = m.op;
				break;
			case 'o':
				if(!(m.id in images)) return new Error('no such image');
				images[m.id].origin(m.rmin, m.scr);
				break;
			case 'p':
			case 'P':
				if(!(m.dstid in images)) return new Error('no such image');
				if(!(m.srcid in images)) return new Error('no such image');
				images[m.dstid].poly(images[m.srcid], m.X0, m.X1, m.X2, m.sp, m.dp, m.type == 'P', drawop);
				break;
			case 'S':
				let s = allscreens[m.id];
				if(s === undefined || !s.public && s.owner !== num) return new Error('no such screen');
				if(s.image.chan !== m.chan) return new Error('inconsistent chan');
				if(s.owner !== num){
					myscreens[m.id] = s;
					s.incref();
				}
				break;
			case 't': {
				let w = new Array(m.id.length);
				for(let i = 0; i < m.id.length; i++){
					w[i] = images[m.id];
					if(w[i] === undefined) return new Error('no such image');
					if(!w[i].layer) return new Error('not a window');
					if(i > 0 && w[i].screen !== w[i-1].screen)
						return new Error('images not on same screen');
				}
				wintop(w, top);
				break;
			}
			case 'v':
				flush();
				break;
			case 'x':
				if(!(m.dstid in images)) return new Error('no such image');
				if(!(m.srcid in images)) return new Error('no such image');
				if(!(m.fontid in images)) return new Error('no such image');
				if(!(m.bgid in images)) return new Error('no such image');
				if(images[m.fontid].font === undefined) return new Error('not a font');
				images[m.dstid].stringbg(images[m.srcid], images[m.fontid], m.dp, m.clipr, m.sp, m.index, images[m.bgid], m.bp, drawop);
				break;
			case 'y':
			case 'Y':
				if(!(m.id in images)) return new Error('no such image');
				return images[m.id].load(m.r, m.type == 'Y', buf);
			default:
				throw new Error('recvMsg: unknown draw message ' + m.type);
			}
		}
		data.write = function(fid, data, offset){
			let b = new VBuffer(data);
			var m, e;
			while(b.rp < b.p){
				let n = b.rp;
				try{
					m = msgFmt.get(b);
				}catch(e){
					return n == 0 ? e : n;
				}
				e = processmsg(m, b);
				if(e !== undefined)
					return n == 0 ? e : n;
			}
		};
	};

	resize();
	window.addEventListener('resize', resizeEvent);
}
