# SlaRle.js
### A JavaScript-based localization and decoding of EAN-13 barcodes with HTML5

SlaRle (SLA - Scanline-Algorithm, RLE - Run-Length-Encoding) is a pure JavaScript implementation for locating barcode regions in images and decoding EAN-13 barcodes.

This algorithm was implemented during the work for my master's thesis.
The aim was to create an app using HTML5 with client-side barcode recognition functionality.
As mentioned above, SlaRle consists of two parts: localization and decoding.
Localization is based on an algorithm from Stern [1] with enhanced parameterization.
Decoding follows the description from O'Sullivan et al. [2] with the additional feature of scanline movement if a scan wasn't successful.

SlaRle is far from perfect, but tries to find a compromise between performance and accuracy in scanning EAN-13 barcodes.
Therefore, only horizontal barcodes will be detected due to the scanline algorithm that starts from the top and ends at the bottom.
During the implementation, the algorithm was tested against the 1055 images from Muenster BarcodeDB [3].
Due to the horizontal barcode limitation, some images needed to be rotated from [3]: 167 images by 90° and 32 by 180°.
After this modification, SlaRle reached the following results:

- 70,9 % accuracy at 480px maximum image size
- 81,3 % accuracy at 640px max
- 84,4 % accuracy at 800px max


### References

- [1] Stern: "Mobile Produkterkennung für ein Behinderten-Assistenzsystem: Automatische Lokalisierung und Dekodierung von 1-D Barcodes", 2011
- [2] O'Sullivan, Stewart, Goerzen: "Real World Haskell", 2008
- [3] Wachenfeld, Terlunen, Jiang: "Robust Recognition of 1-D Barcodes Using Camera Phones", 2008