function devaudio() {
	var busy = false;
	var ctx;
	const devaudio = new File("audio", 0, dev);
	devaudio.open = function(){
		if(busy) return new Error('in use');
		try{
			ctx = new window.AudioContext();
			busy = true;
		}catch(e){
			return e;
		}
	}
	devaudio.clunk = function() {
		busy = false;
	}
	let queue = [];
	function over() {
		queue.shift();
		if(queue.length == 0)
			return;
		if(queue[0].prestart !== undefined)
			queue[0].prestart();
		queue[0].start();
	}
	devaudio.write = function(fid, data, offset) {
		let n = data.length >> 2;
		var b = ctx.createBuffer(2, n, 44100);
		for(let c = 0; c < 2; c++){
			var d = b.getChannelData(c);
			for(let i = 0; i < n; i++)
				d[i] = (data[4*i+2*c] | data[4*i+2*c+1] << 24 >> 16) / 32768;
			
		}
		let node = new AudioBufferSourceNode(ctx);
		node.buffer = b;
		node.connect(ctx.destination);
		node.onended = over;
		queue.push(node);
		if(queue.length == 1)
			node.start();
		else
			return new Promise((resolve, reject) => {
				node.prestart = resolve;
			});
	}
}
