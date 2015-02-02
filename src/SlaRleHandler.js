$(function () {

	var SlaRleWorker = new Worker(workerPathSlaRle);

	startSlaRle = function () {

		var tempCanvasCtx = tempCanvas.getContext("2d");
		var data = tempCanvasCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;

		// prepare message
		var message = {
			img: data,
			width: tempCanvas.width,
			height: tempCanvas.height
		};

		// start barcode recognition
		startTime = new Date().getTime();
		SlaRleWorker.postMessage(message);
		message = null;
	};

	function receiveMessageSalRle(e) {

		endTime = new Date().getTime();
		var successful = false;

		if (e.data.decoding && e.data.result) {

			if (e.data.EAN.length > 0) {
				successful = true;
				for (i in e.data.EAN) {
					var EAN13 = e.data.EAN[i];
					var success = findProductInShelf("EAN-13: " + EAN13);

					if (success) {
						break;
					}
				}

				if (!success) {
					showError(error.BARCODE_NOT_FOUND);
					addAdditionalText(e.data.EAN.toString());
				}
			}

			//if (e.data.EAN != "false") {
			//	successful = true;
			//	findProduct("EAN-13: " + e.data.EAN);
			//}

			endTime = new Date().getTime();

			debugTime.innerHTML = "Scandauer: " + ((endTime - startTime) / 1000) + "s ";
			debugResult.innerHTML = e.data.EAN;

		}

		if(!successful){
			showError(error.DECODING_FAILED);
			debugResult.innerHTML = "Decoding fehlgeschlagen: " + ((endTime - startTime) / 1000) + "s";
		}

		hideLoadAnimation();

	}

	SlaRleWorker.onmessage = receiveMessageSalRle;

});