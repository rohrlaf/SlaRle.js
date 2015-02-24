/* --------------------------------------------------

SlaRle.js by BobbyJay <https://github.com/BobbyJay/SlaRle.js>

This software is provided under the MIT license, http://opensource.org/licenses/MIT.
All use of this software must include this
text, including the reference to the creator of the original source code. The
originator accepts no responsibility of any kind pertaining to
use of this software.

Copyright (c) 2015 BobbyJay

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

------------------------ */

var debug = false;

var locBorder = 0;//3;	// additional border for located barcode in %

var SLs = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9];

// Sobel gradient operator
var gradSobelX = [-1, 0, 1,
				-2, 0, 2,
				-1, 0, 1];
var gradSobelY = [-1, -2, -1,
				0, 0, 0,
				1, 2, 1];

// SLA algorithm parameters
// limits and performance optimizations for scanlines
var SLASteps = 1/3;	// steps to jump over image rows, shows the amount of rows that will be parsed in %
var SLALimitX = 20;
var SLALimitY = 20;
// parameters
var SLAAngleDiff = 11;	// difference of angles for gradients and SLs
var SLAMaxDist = 1.7; // 3; // min gradient distance in %
var SLAMinLength = 17; // min SL length in % of image width
var SLAMinGradient = 100; // 44 is the limit theoretically, min amount of gradients in SL
var SLAMaxSLDist = 1.5; // max scanline distance in %
var SLAMaxLengthDiff = 2; // max SL length difference in %
var SLAMaxSLDiffX = 2; // max difference of start point X of SL in %
var SLAMinSLNumber = parseInt(25 * SLASteps); // min number of SLs for PBCA


// ### image preprocessing #######################################################################
function convertToGrayscale(array) {
	// width/height of the image data
	var w = array[0].length;
	var h = array.length;
	var graySum = 0;

	for (row in array) {
		for (pixel in array[row]) {
			// gray = 0.299*r + 0.587*g + 0.114*b
			gray = parseInt((0.299 * array[row][pixel][0]) + (0.587 * array[row][pixel][1]) + (0.114 * array[row][pixel][2]));
			array[row][pixel][0] = array[row][pixel][1] = array[row][pixel][2] = gray;
			graySum += gray;
		}
	}

	return { array: array, threshold: (graySum / (w * h)) };
}

function gradientSimple(array, operator) {
	// parameters of operator
	var side = Math.round(Math.sqrt(operator.length));
	var halfSide = Math.floor(side / 2);
	// width/height of the image data
	var w = array[0].length;
	var h = array.length;
	// destination array for output and temporary arrays for filling
	var dst = [];
	var tempLine = [];
	// gradient sum
	var gradSum = 0;

	// parse through all pixels
	for (var y = 0; y < h; y++) {
		tempLine = [];

		for (var x = 0; x < w; x++) {
			// calculate neighbor pixels, escape out of bounds indexes
			var xLeft = Math.max(0, x - 1);
			var xRight = Math.min(w - 1, x + 1);
			var yUp = Math.max(0, y - 1);
			var yDown = Math.min(h - 1, y + 1);

			// simple gradient (equation 19, page 49)
			var gradX = Math.abs(array[y][xRight][0] - array[y][xLeft][0]);
			var gradY = Math.abs(array[yDown][x][0] - array[yUp][x][0]);
			var gradient = parseInt((gradX + gradY) / 2);
			gradSum += gradient;

			// calculate angles
			//var angle = parseInt((Math.atan(gradY / gradX) * 180) / Math.PI);
			var angle = parseInt(((gradX == 0 ? 0 : Math.atan(gradY / gradX)) * 180) / Math.PI);
			var q = (gradX >= 0 && gradY >= 0) ? 1 : -1;

			// set gradient value for destination pixel
			gradient = Math.abs(gradient);
			tempLine.push([gradient, gradient, gradient, 255, angle, q]);
		}
		dst.push(tempLine);
	}

	return { result: dst, threshold: (gradSum / (w * h)) };
}

function binarize(array, threshold) {
	// width/height of the image data
	var w = array[0].length;
	var h = array.length;

	// parse through all pixels
	for (var y = 0; y < h; y++) {
		for (var x = 0; x < w; x++) {
			var value = (array[y][x][0] >= threshold) ? 255 : 0;
			array[y][x][0] = array[y][x][1] = array[y][x][2] = value;
		}
	}

	return array;
}

function gradientAndBinarize(array) {
	var tempArray;

	// simple gradient
	var gradient = gradientSimple(array, gradSobelX);
	tempArray = binarize(gradient.result, gradient.threshold);

	return tempArray;
}

// ### image preprocessing #######################################################################



// ### SLA localization #######################################################################
function findScanlines(array) {
	// width/height of the image data
	var w = array[0].length;
	var h = array.length;
	//var max = Math.max(array.length, array[0].length);
	var max = w;	// take width because of horizontal barcodes

	// set parameters depending on image dimensions
	var steps = Math.floor(h / (h * SLASteps));
	var MaxDist = (max * SLAMaxDist) / 100;
	var MinLength = (max * SLAMinLength) / 100;

	// store result for scanline
	var resultSLs = [];

	for (var row = 0; row < array.length; row += steps) {

		for (var pixel = 0; pixel < (array[row].length - MinLength) ; pixel++) {

			// test if gradient pixel
			if (array[row][pixel][0] == 255) {
				var pxl = array[row][pixel];
				var angle = pxl[4];
				var angleSum = pxl[4];
				var scanlineLength = 0, foundSomething = 1, nothingFound = 0;
				var scanline = { x: null, y: null, scanlineLength: 0, angleAVG: null };

				for (var i = pixel + 1; i < w; i++) {	// loop 1
					scanlineLength++;

					// test if gradient and increase counter if similar
					var oth = array[row][i];
					if (oth[0] == 255 && ((oth[4] >= pxl[4] - SLAAngleDiff) && (oth[4] <= pxl[4] + SLAAngleDiff))) {
						foundSomething++;
						angleSum += oth[4];
						nothingFound = 0;
					} else {
						nothingFound++;
					}

					// test for thresholds
					// if exceeds maxDistance or is last pixel of row
					if (nothingFound > MaxDist || i == (w - 1)) {
						if (foundSomething >= SLAMinGradient) {
							scanline = { x: pixel, y: row, scanlineLength: (scanlineLength - nothingFound), angleAVG: parseInt(angleSum / foundSomething) };
						}
						break;
					}
				}	// end loop 1

				if (scanline.scanlineLength >= MinLength) {
					resultSLs.push(scanline);
				}

				// set pixel, where to start from after this search
				pixel = Math.min(w - 1, pixel + scanline.scanlineLength);
			}
		}
	}

	return resultSLs;
}

function findPBCAfromSLs(scanlines) {
	var PBCAs = [];

	//var max = Math.max(imageData.height, imageData.width);
	var max = imageData.width;	// take width because of horizontal barcodes

	var MaxSLDist = (max * SLAMaxSLDist) / 100;
	var MaxLengthDiff = (max * SLAMaxLengthDiff) / 100;
	var MaxSLDiffX = (max * SLAMaxSLDiffX) / 100;

	// parse all SLs, but don't consider last, when there aren't enough for SLAMaxSLNumber
	for (var i = 0; i < scanlines.length - SLAMinSLNumber; i++) {
		var SL = scanlines[i];
		var length = SL.scanlineLength;
		var angle = SL.angleAVG;
		var refPointX = SL.x;
		var refPointY = SL.y;
		// reset PBCA and fill with current SL
		var tempPBCA = [];
		tempPBCA.push(SL);
		// next scanline to process, if PBCA is found
		var next = i;

		for (var j = (i + 1) ; j < scanlines.length; j++) {
			var nSL = scanlines[j];

			// test if SL is within range
			if (nSL.y <= refPointY + MaxSLDist) {

				// test if angle is similar and length is similar to previous
				if ((nSL.y != refPointY) &&	// Y coordinate different ?
					(nSL.x >= refPointX - MaxSLDiffX) &&
					(nSL.x <= refPointX + MaxSLDiffX) &&
					(nSL.angleAVG >= angle - SLAAngleDiff) &&
					(nSL.angleAVG <= angle + SLAAngleDiff) &&
					(nSL.scanlineLength >= length - MaxLengthDiff) &&
					(nSL.scanlineLength <= length + MaxLengthDiff)) {

					// put SL into PBCA
					tempPBCA.push(nSL);
					next = j;

					// set adapted length and angle to compare with next line
					length = nSL.scanlineLength;
					angle = nSL.angleAVG;
					refPointX = nSL.x;
					refPointY = nSL.y;

				}
			} else { // break because they are sorted by Y and following will be out of range
				break;
			}
		}

		// store temporary PBCA in result, if enough SLs where found
		if (tempPBCA.length >= SLAMinSLNumber) {
			PBCAs.push(tempPBCA);
		} else {
			next = i;
		}
		i = next;
	}

	return PBCAs;
}

function localizationSLA(array) {
	// calulate border aroung barcode image
	//var max = Math.max(imageData.height, imageData.width);
	var max = imageData.width;	// take width because of horizontal barcodes
	var borderX = Math.floor((max * locBorder) / 100);
	var borderY = 0;//(max * locBorder) / 100;

	// find scanlines that fit into requirements
	var scanlines = findScanlines(array);

	// mark scanlines
	if (debug) {
		for (s in scanlines) {
			var sl = scanlines[s];
			for (var x = sl.x; x <= (sl.x + sl.scanlineLength) ; x++) {
				array[sl.y][x][0] = 255;
				array[sl.y][x][1] = 0;
				array[sl.y][x][2] = 0;
			}
		}
		postMessage({ localization: true, print: arrayToImageData(imageData, array) });
	}


	// compare scanlines
	var areas = findPBCAfromSLs(scanlines);

	// edit areas for returning results
	var areaSize = 0;
	var result = [];
	for (ba in areas) {
		var area = areas[ba];
		var startX = [], endX = [], Y = [];

		for (s in area) {
			var sl = area[s];
			startX.push(sl.x);
			endX.push(sl.x + sl.scanlineLength);
			Y.push(sl.y);
		}

		result.push({
			startX: Math.min.apply(null, startX) - borderX,
			endX: Math.max.apply(null, endX) + borderX,
			startY: Math.min.apply(null, Y) - borderY,
			endY: Math.max.apply(null, Y) + borderY
		});
	}

	// mark PBCAs in Image, only debug
	if (debug) {
		for (ba in result) {
			var pbca = result[ba];

			// colorize pixels
			for (var y = pbca.startY; y <= pbca.endY; y++) {
				for (var x = pbca.startX; x <= pbca.endX; x++) {
					array[y][x][1] = 255;
					array[y][x][2] = 0;
				}
			}
		}
		postMessage({ localization: true, print: arrayToImageData(imageData, array) });
	}

	return result;
}
// ### SLA localization #######################################################################



// ### RLE decoding #######################################################################
function runLengthEncoding(row) {
	var w = row.length;
	var result = [];
	var previous = null;
	var n = 0;

	for (var x = 0; x < w; x++) {
		current = row[x][0];

		if (current != previous && previous != null) {
			result.push({ val: previous, len: n });
			n = 0;
		}
		n++;
		previous = current
	}

	if (n > 0) {
		result.push({ val: previous, len: n });
	}

	length = result.length;
	start = result[0].val == 255 ? 1 : 0;
	end = result[length - 1].val == 255 ? (length - 1) : length;

	return result.slice(start, end);
}

function sliceDigits(rle) {
	var units = 59;
	var result = [];
	var digits = [];
	var dsize = 4;	// bars per digit (2 black, 2 white)
	var outer = 3;	// outer guards (black, white, black)
	var inner = 5;	// inner guard (white, black, white, black, white)

	// test, if units is bigger than
	if (rle.length >= units) {
		var possibilites = rle.length - units + 1;
		for (m = 0; m < possibilites; m++) {
			digits = [];

			for (i = 0; i < 6; i++) {
				pos = m + outer + (i * dsize);
				digit = rle.slice(pos, pos + dsize);
				digits.push(digit);
			}

			for (i = 6; i < 12; i++) {
				pos = m + outer + inner + (i * dsize);
				digit = rle.slice(pos, pos + dsize);
				digits.push(digit);
			}

			result.push(digits);
		}

	}

	return result;
}

function normalizeDigits(digits) {
	var normalization = [];
	for (d in digits) {
		digit = digits[d];
		var sum = 0;

		for (m in digit) {
			module = digit[m];
			sum += module.len;
		}

		var row = [];
		for (m in digit) {
			row.push(digit[m].len / sum);
		}
		normalization.push(row);
	}
	return normalization;
}

function findSimilarNumbers(normalization) {
	var defaults = {
		leftDigitsOdd: [[3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2], [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]],
		leftDigitsEven: [[1, 1, 2, 3], [1, 2, 2, 2], [2, 2, 1, 2], [1, 1, 4, 1], [2, 3, 1, 1], [1, 3, 2, 1], [4, 1, 1, 1], [2, 1, 3, 1], [3, 1, 2, 1], [2, 1, 1, 3]],
		rightDigits: [[3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2], [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]],
		parity: ["OOOOOO", "OOEOEE", "OOEEOE", "OOEEEO", "OEOOEE", "OEEOOE", "OEEEOO", "OEOEOE", "OEOEEO", "OEEOEO"]
	}

	// convert EAN tables
	for (i in defaults.leftDigitsOdd) {
		var digit = defaults.leftDigitsOdd[i];
		var sum = 0;

		for (m in digit) {
			sum += digit[m];
		}

		for (m in digit) {
			digit[m] = digit[m] / sum;
		}
	}
	for (i in defaults.leftDigitsEven) {
		var digit = defaults.leftDigitsEven[i];
		var sum = 0;

		for (m in digit) {
			sum += digit[m];
		}

		for (m in digit) {
			digit[m] = digit[m] / sum;
		}
	}
	for (i in defaults.rightDigits) {
		var digit = defaults.rightDigits[i];
		var sum = 0;

		for (m in digit) {
			sum += digit[m];
		}

		for (m in digit) {
			digit[m] = digit[m] / sum;
		}
	}


	// check for similarity
	var result = [];
	// left digits
	for (var i = 0; i < 6; i++) {
		var digit = normalization[i];
		var digitSim = [];

		for (o in defaults.leftDigitsOdd) {
			var template = defaults.leftDigitsOdd[o];
			var difference = 0;

			for (var j = 0; j < 4; j++) {
				difference += Math.abs(template[j] - digit[j]);
			}
			digitSim.push(difference);
		}
		result.push({ odd: digitSim, even: 0 });

		digitSim = [];
		for (o in defaults.leftDigitsEven) {
			var template = defaults.leftDigitsEven[o];
			var difference = 0;

			for (var j = 0; j < 4; j++) {
				difference += Math.abs(template[j] - digit[j]);
			}
			digitSim.push(difference);
		}
		result[i].even = digitSim;
	}

	// right digits
	for (var i = 6; i < 12; i++) {
		var digit = normalization[i];
		var digitSim = [];

		for (o in defaults.rightDigits) {
			var template = defaults.rightDigits[o];
			var difference = 0;

			for (var j = 0; j < 4; j++) {
				difference += Math.abs(template[j] - digit[j]);
			}
			digitSim.push(difference);
		}
		result.push({ odd: 0, even: digitSim });
	}

	var parity = "";
	var EAN = "";
	for (r in result) {
		var digit = result[r];
		var number = 0;

		if (r < 6) {
			var oddMin = Math.min.apply(Math, digit.odd);
			var odd = digit.odd.indexOf(oddMin);

			var evenMin = Math.min.apply(Math, digit.even);
			var even = digit.even.indexOf(evenMin);

			if (oddMin < evenMin) {
				number = odd;
				parity += "O";
			} else {
				number = even;
				parity += "E";
			}
		} else {
			number = digit.even.indexOf(Math.min.apply(Math, digit.even));
		}

		EAN += number.toString();
	}

	// calculate first digit from parity!!!
	firstDigit = defaults.parity.indexOf(parity).toString();
	if (parseInt(firstDigit) < 0) {
		EAN = "false";
	} else {
		EAN = firstDigit + EAN;

		checksum = 0;
		for (i = 0; i < 12; i++) {
			checksum += EAN[i] * ((i + 1).mod(2) ? 1 : 3);
		}

		if (!((10 - checksum.mod(10)).mod(10) == parseInt(EAN[12]))) {
			EAN = "false";
		}
	}

	return EAN;
}
// ### RLE decoding #######################################################################



// ### standard functions #######################################################################
// http://javascript.about.com/od/problemsolving/a/modulobug.htm
Number.prototype.mod = function (n) {
	return ((this % n) + n) % n;
}


// transform array back to image data
function arrayToImageData(img, array) {
	for (row in array) {
		for (pixel in array[row]) {
			p = (parseInt(row) * img.width + parseInt(pixel)) * 4;
			img.data[p + 0] = array[row][pixel][0];
			img.data[p + 1] = array[row][pixel][1];
			img.data[p + 2] = array[row][pixel][2];
			img.data[p + 3] = array[row][pixel][3];
		}
	}
	return img;
}


// transform imageData.data to array [row][pixel][rgba]
function createArray(img) {
	var tempArray = [];
	var tempLine = [];
	for (var i = 0; i < img.height; i += 1) {
		tempLine = [];
		for (var j = 0; j < img.width; j += 1) {
			p = (i * img.width + j) * 4;
			tempLine.push([img.data[p], img.data[p + 1], img.data[p + 2], img.data[p + 3]]);
		}
		tempArray.push(tempLine);
	}
	return tempArray;
}
// ### standard functions #######################################################################



// receive trigger from program
// initiate the localization algorithm
self.onmessage = function (e) {
	if (e.data.img) {
		// create a new imageData object from the given parameters
		imageData = {
			data: new Uint8ClampedArray(e.data.img),
			width: e.data.width,
			height: e.data.height
		};


		// LOCALIZATION #########################################################################

		// convert imageData to array
		imageArray = createArray(imageData);	// create two-dimensional array from imageData

		// convert to grayscale image
		imageArrayGray = convertToGrayscale(imageArray);
		if (debug) postMessage({ localization: true, print: arrayToImageData(imageData, imageArrayGray.array) });
		else imageData.data = null;
		imageArray = null;

		// use gradient operator
		imageArrayBin = gradientAndBinarize(imageArrayGray.array);
		if (debug) postMessage({ localization: true, print: arrayToImageData(imageData, imageArrayBin) });
		else imageData.data = null;
		//imageArrayGray = null;

		// start localization
		var PBCAs = [];
		PBCAs = localizationSLA(imageArrayBin);
		imageArrayBin = null;

		// return biggest PBCA for localization comparison (Jaccard)
		var areaSize = 0;
		var result = [];
		for (ba in PBCAs) {
			var pbca = PBCAs[ba];

			var area = Math.max(0, pbca.endX - pbca.startX) * Math.max(0, pbca.endY - pbca.startY);

			if (area > areaSize) {
				areaSize = area;
				result = [];
				result.push(pbca);
			}
		}
		postMessage({ localization: true, name: "Stern (2011)", result: true, areas: result });
		

		// DECODING #########################################################################

		EANs = [];
		for (p in PBCAs) {
			EAN = "false";
			var PBCA = PBCAs[p];

			// slicing imageArrayGray.array to PBCA size
			var PBCAimg = [];
			for (i = PBCA.startY; i <= PBCA.endY; i++) {
				PBCAimg.push(imageArrayGray.array[i].slice(PBCA.startX, (PBCA.endX + 1)));
			}

			// decoding for each scanline
			for (s in SLs) {

				var row = PBCAimg[Math.floor(PBCAimg.length * SLs[s])];
				var sum = 0;
				for (r in row) {
					var pxl = row[r];
					sum += pxl[0];
				}

				// select grayscale scanline				
				sl = binarize([row], (sum / row.length));
				//if (debug) postMessage({ localization: true, print: arrayToImageData(imageData, sl) });

				// RLEncoding the scanline
				rle = runLengthEncoding(sl[0]);
				rows = sliceDigits(rle);

				for (r in rows) {
					digits = rows[r];

					if (digits.length == 12) {
						normalization = normalizeDigits(digits);
						EAN = findSimilarNumbers(normalization);
						if (EAN != "false") {
							EANs.push(EAN);
							break;
						}
					} else {
						EAN = "false";
					}
				}

				if (EAN != "false") {
					break;
				}

			}	// end parsing all Scanlines SLs

			//if (EAN != "false") {
			//	break;
			//}

		}	// end parsing all PBCAs


		// RESULTS #########################################################################
		//imageData = arrayToImageData(imageData, imageArrayBin);

		imageData = null;
		imageArray = null;
		imageArrayGray = null;
		imageArrayBin = null;
		PBCAs = null;
		result = null;


		postMessage({ decoding: true, name: "Stern (2011)", result: true, EAN: EANs });
	} else {
		postMessage({ decoding: false });
	}
};