$(function () {
	
	// camera elements
	var fileInput = document.getElementById('cameraCapture');
	var tempImg = document.getElementById('tempImg');
	var tempCanvas = document.getElementById('tempCanvas');
	var megapixImg;

	// image elements
	var imgOrientation;
	var maxDimension = 720;

	// barcode elements;
	var resultArray = [];
	var workerCount = 0;

	// debug elements
	var debugExif = document.getElementById('debugExif');
	var debugProcedure = document.getElementById('debugProcedure');
	var debugResult = document.getElementById('debugResult');
	var debugTime = document.getElementById('debugTime');
	var debugBarcode = document.getElementById('debugBarcode');
	var errorCanvas = document.getElementById('errorCanvas');



	// camera buttons: trigger file upload for camera
	$("#cameraTrigger").click(function () {
		fileInput.click();
	}).show();
	$("#cameraTriggerMenu").click(function () {
		fileInput.click();
	}).show();
	$("#cameraTriggerError").click(function () {
		fileInput.click();
		hideError();
	}).show();

	// if new image was taken, trigger image manipulation
	fileInput.onchange = function () {
		var file = fileInput.files[0];
		imgOrientation = null;

		// get orientation of image from exif data
		EXIF.getData(file, function () {
			imgOrientation = EXIF.getTag(this, "Orientation");
			debugExif.innerHTML = "Orientation: " + imgOrientation;
		});

		// MegaPixImage constructor accepts File/Blob object.
		megapixImg = new MegaPixImage(file);
		
		// Render resized image into image element using quality option.
		// Quality option is valid when rendering into image element.
		megapixImg.render(tempImg, { maxWidth: maxDimension, maxHeight: maxDimension, quality: 1.0 });

		// show load animation
		showLoadAnimation();
		
	};

	// if image is loaded and exif data has finished reading
	tempImg.onload = function () {
		// clear uploaded file
		fileInput.value = "";

		// Render resized image into canvas element.
		megapixImg.render(tempCanvas, { maxWidth: maxDimension, maxHeight: maxDimension, orientation: imgOrientation });

		megapixImg.render(errorCanvas, { maxWidth: maxDimension, maxHeight: maxDimension, orientation: imgOrientation });

		// initiate scan procedure
		scan();
	};

	// also initiate scan on change of procedure
	$("input[name=scanner]").change(function () {
		showLoadAnimation();
		scan();
	});


	// start the chosen scan procedure
	scan = function () {
		// empty/update the displayed information
		debugProcedure.innerHTML = "";
		debugResult.innerHTML = "";
		debugTime.innerHTML = ""; 
		debugBarcode.innerHTML = "";
		debugProcedure.innerHTML = $('input[name=scanner]:checked').val() + " scannt";

		// prepare time measurement
		startTime = new Date().getTime();


		// start procedure
		hideError();
		switch ($('input[name=scanner]:checked').val()) {
			case "slarle10": startSlaRle(); break;
			case "JOB16": JOB.DecodeImage(tempImg); break;

			case "barcodeReader10onlyEAN": scanBarcodeReader(true, false); break;
			case "barcodeReader10all": scanBarcodeReader(false, false); break;
			case "barcodeReader10onlyEANRotate": scanBarcodeReader(true, true); break;

			case "barcodeReader15onlyEAN": scanBarcodeReader15(true, false); break;
			case "barcodeReader15all": scanBarcodeReader15(false, false); break;
		}

		$("html, body").animate({ scrollTop: 0 }, "fast");
	};



	// change max canvas size on change
	var maxCanvasSize = document.getElementById("canvasSize");
	maxCanvasSize.value = maxDimension;
	maxCanvasSize.addEventListener("change", function () {
		maxDimension = parseInt(maxCanvasSize.value);
	});



	// toggle settings and debug information
	$("#toggleInfo").click(function () {
		$("#toggleInfo").toggleClass("btn-warning");
		$("#debug").toggle();
		$("#settings").toggle();

		if($("#settings").is(":visible")) {
			//$("html, body").scrollTop($("#settings").offset().top);
			$("html, body").animate({ scrollTop: ($("#settings").offset().top)-50 }, "fast");
		} else {
			$("html, body").animate({ scrollTop: 0 }, "fast");
		}
	});



	// load animation functions
	var loader = document.getElementById('loader');
	showLoadAnimation = function () {
		loader.style.display = "table";
	}
	hideLoadAnimation = function () {
		loader.style.display = "none";
	}



	// show errors
	var errorBox = document.querySelector("#errors");
	var errorAlert = document.querySelector("#errorText");
	var errorAddInfo = document.querySelector("#errorAddInfo");
	error = {
		DECODING_FAILED: 0,
		BARCODE_NOT_FOUND: 1
	};

	showError = function (code) {
		errorBox.style.display = "table";
		errorAddInfo.innerHTML = "";

		switch (code) {
			case error.BARCODE_NOT_FOUND:
				errorAlert.innerHTML = "Barcode nicht im Regal gefunden!";
				break;
			case error.DECODING_FAILED:
				errorAlert.innerHTML = "Es konnte kein Barcode erkannt werden!";
				break;
		}
	};

	addAdditionalText = function (text) {
		errorAddInfo.innerHTML = text;
	};

	hideError = function () {
		errorBox.style.display = "none";
	};


	// -------------------------------------------------------------
	//   One Item Per Frame
	// -------------------------------------------------------------
	'use strict';
	(function () {
		var $frame = $('#oneperframe');
		var $wrap = $frame.parent();

		// Call Sly on frame
		var options = {
			horizontal: 1,
			itemNav: 'forceCentered', // 'forceCentered'
			smart: 1,
			activateMiddle: 1,
			mouseDragging: 1,
			touchDragging: 1,
			releaseSwing: 1,
			startAt: 0,
			scrollBar: $wrap.find('.scrollbar'),
			scrollBy: 1,

			pagesBar: $wrap.find('.pages'),
			pageBuilder:
				function (index) {
					return '<li>Meter '+(index+1)+'</li>';
				},

			activatePageOn: 'click',
			speed: 500,
			elasticBounds: 1,
			easing: 'easeInOutCubic',
			dragHandle: 1,
			dynamicHandle: 1,
			clickBar: 1
		}

		frame = new Sly($frame, options);

		frame.init();

		// Reload on resize
		$(window).resize(function () {
			$("ul.clearfix>li").css("width", document.querySelector("#widthMeasurement").clientWidth + "px");
			frame.reload();
		});

		$(window).load(function () {
			$("ul.clearfix>li").css("width", document.querySelector("#widthMeasurement").clientWidth + "px");
			frame.reload();
		});

	}());

});