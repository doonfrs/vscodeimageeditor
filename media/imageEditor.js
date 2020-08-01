// @ts-check

// This script is run within the webview itself
(function () {
	// @ts-ignore
	const vscode = acquireVsCodeApi();

	/**
	 * A drawn line.
	 */
	class Stroke {
		constructor(/** @type {string} */ color, /** @type {Array<[number, number]> | undefined} */ stroke) {
			this.color = color;
			/** @type {Array<[number, number]>} */
			this.stroke = stroke || [];
		}

		addPoint(/** @type {number} */ x, /** @type {number} */ y) {
			this.stroke.push([x, y])
		}
	}

	/**
	 * @param {Uint8Array} initialContent 
	 * @return {Promise<HTMLImageElement>}
	 */
	async function loadImageFromData(initialContent) {
		const blob = new Blob([initialContent], { 'type': 'image/png' });
		const url = URL.createObjectURL(blob);
		try {
			const img = document.createElement('img');
			img.crossOrigin = 'anonymous';
			img.src = url;
			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = reject;
			});
			return img;
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	class imageEditor {
		constructor( /** @type {HTMLElement} */ parent) {
			this.ready = false;

			this.drawingColor = 'black';
			this.drawingcolor_change();

			/** @type {Array<Stroke>} */
			this.strokes = [];

			/** @type {Stroke | undefined} */
			this.currentStroke = undefined;

			this.action = 'pen';

			this.isDrawing = false;

			this._initElements(parent);
		}

		addPoint(/** @type {number} */ x, /** @type {number} */ y) {
			if (this.currentStroke) {
				this.currentStroke.addPoint(x, y)
			}
		}

		beginStoke(/** @type {string} */ color) {
			this.currentStroke = new Stroke(color);
			this.strokes.push(this.currentStroke);
		}

		endStroke() {
			const previous = this.currentStroke;
			this.currentStroke = undefined;
			return previous;
		}


		findPos(obj) {
			var curleft = 0, curtop = 0;
			if (obj.offsetParent) {
				do {
					curleft += obj.offsetLeft;
					curtop += obj.offsetTop;
				} while (obj = obj.offsetParent);
				return { x: curleft + window.scrollX, y: curtop + window.scrollY };
			}
			return undefined;
		}

		rgbToHex(r, g, b) {
			if (r > 255 || g > 255 || b > 255)
				throw "Invalid color component";
			return ((r << 16) | (g << 8) | b).toString(16);
		}

		actionChanged() {
			switch (this.action) {
				case '':
					break;
			}

		}

		_initElements(/** @type {HTMLElement} */ parent) {
			const actionButtons = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.drawing-controls button'));
			for (const actionButton of actionButtons) {
				actionButton.addEventListener('click', e => {
					e.stopPropagation();
					actionButtons.forEach(button => button.classList.remove('active'));
					actionButton.classList.add('active');

					this.action = actionButton.dataset['action'];

					this.actionChanged();
				});
			}

			this.wrapper = document.createElement('div');
			this.wrapper.style.position = 'relative';
			parent.append(this.wrapper);

			this.initialCanvas = document.createElement('canvas');
			this.initialCtx = this.initialCanvas.getContext('2d');
			this.wrapper.append(this.initialCanvas);

			this.drawingCanvas = document.createElement('canvas');
			this.drawingCanvas.style.position = 'absolute';
			this.drawingCanvas.style.top = '0';
			this.drawingCanvas.style.left = '0';
			this.drawingCtx = this.drawingCanvas.getContext('2d');
			this.wrapper.append(this.drawingCanvas);

			document.getElementById('currentcolor').addEventListener('change', (e) => {
				this.drawingcolor_change();
			});

			parent.addEventListener('mousedown', (e) => {
				if (!this.ready) {
					return;
				}

				switch (this.action) {
					case 'pen':
						this.mousedown_pen(e);
						break;
					case 'pickcolorfromimage':
						this.mousedown_pickcolorfromimage(e);
						break;
				}

			});

			document.body.addEventListener('mouseup', async (e) => {
				this.mouseup_pen(e);
			});

			parent.addEventListener('mousemove', e => {
				this.mousemove_pen(e);
			});
		}

		drawingcolor_change() {
			// @ts-ignore
			this.drawingColor = document.getElementById('currentcolor').value;

			// @ts-ignore
			document.getElementById('currentcolortext').value = this.drawingColor;
		}

		mouseup_pen(e) {
			if (!this.isDrawing || !this.ready) {
				return;
			}

			this.isDrawing = false;
			document.body.classList.remove('isDrawing');
			this.drawingCtx.closePath();

			const edit = this.endStroke();

			if (edit.stroke.length) {
				vscode.postMessage({
					type: 'stroke',
					color: edit.color,
					stroke: edit.stroke,
				});
			}
		}

		mousemove_pen(e) {
			if (!this.isDrawing || !this.ready) {
				return;
			}
			const rect = this.wrapper.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			this.drawingCtx.lineTo(x, y);
			this.drawingCtx.stroke();
			this.addPoint(x, y);
		}

		mousedown_pen(e) {
			this.beginStoke(this.drawingColor);
			this.drawingCtx.strokeStyle = this.drawingColor;

			this.isDrawing = true;
			document.body.classList.add('isDrawing');
			this.drawingCtx.beginPath();
		}

		mousedown_pickcolorfromimage(e) {
			var pos = this.findPos(e.target);
			var x = e.pageX - pos.x;
			var y = e.pageY - pos.y;
			var coord = "x=" + x + ", y=" + y;
			var c = this.initialCtx;
			var p = c.getImageData(x, y, 1, 1).data;
			var hex = "#" + ("000000" + this.rgbToHex(p[0], p[1], p[2])).slice(-6);
			var el = document.getElementById('currentcolor');
			// @ts-ignore
			el.value = hex;
			this.drawingcolor_change();
		}

		_redraw() {
			this.drawingCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
			for (const stroke of this.strokes) {
				this.drawingCtx.strokeStyle = stroke.color;
				this.drawingCtx.beginPath();
				for (const [x, y] of stroke.stroke) {
					this.drawingCtx.lineTo(x, y);
				}
				this.drawingCtx.stroke();
				this.drawingCtx.closePath();
			}
		}

		/**
		 * @param {Uint8Array | undefined} data 
		 * @param {Array<Stroke> | undefined} strokes 
		 */
		async reset(data, strokes = []) {
			if (data) {
				const img = await loadImageFromData(data);
				this.initialCanvas.width = this.drawingCanvas.width = img.naturalWidth;
				this.initialCanvas.height = this.drawingCanvas.height = img.naturalHeight;
				this.initialCtx.drawImage(img, 0, 0);
				this.ready = true;

				//this.initialCanvas.style.height = '100vh';

				var scale = this.initialCanvas.clientHeight / img.naturalHeight;
				//this.initialCanvas.style.width = (this.initialCanvas.width * scale) + 'px';

			}

			this.strokes = strokes;
			this._redraw();
		}

		/**
		 * @param {Array<Stroke> | undefined} strokes 
		 */
		async resetUntitled(strokes = []) {
			const size = 100;
			this.initialCanvas.width = this.drawingCanvas.width = size;
			this.initialCanvas.height = this.drawingCanvas.height = size;

			this.initialCtx.save();
			{
				this.initialCtx.fillStyle = 'white';
				this.initialCtx.fillRect(0, 0, size, size);
			}
			this.initialCtx.restore();

			this.ready = true;

			this.strokes = strokes;
			this._redraw();
		}

		/** @return {Promise<Uint8Array>} */
		async getImageData() {
			const outCanvas = document.createElement('canvas');
			outCanvas.width = this.drawingCanvas.width;
			outCanvas.height = this.drawingCanvas.height;

			const outCtx = outCanvas.getContext('2d');
			outCtx.drawImage(this.initialCanvas, 0, 0);
			outCtx.drawImage(this.drawingCanvas, 0, 0);

			const blob = await new Promise(resolve => {
				outCanvas.toBlob(resolve, 'image/png')
			});

			return new Uint8Array(await blob.arrayBuffer());
		}
	}

	const editor = new imageEditor(document.querySelector('.drawing-canvas'));

	// Handle messages from the extension
	window.addEventListener('message', async e => {
		const { type, body, requestId } = e.data;
		switch (type) {
			case 'init':
				{
					if (body.untitled) {
						await editor.resetUntitled();
						return;
					} else {
						// Load the initial image into the canvas.
						const data = new Uint8Array(body.value.data);
						await editor.reset(data);
						return;
					}
				}
			case 'update':
				{
					const data = body.content ? new Uint8Array(body.content.data) : undefined;
					const strokes = body.edits.map(edit => new Stroke(edit.color, edit.stroke));
					await editor.reset(data, strokes);
					return;
				}
			case 'getFileData':
				{
					// Get the image data for the canvas and post it back to the extension.
					editor.getImageData().then(data => {
						vscode.postMessage({ type: 'response', requestId, body: Array.from(data) });
					});
					return;
				}
		}
	});

	// Signal to VS Code that the webview is initialized.
	vscode.postMessage({ type: 'ready' });
}());
