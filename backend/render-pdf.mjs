import fs from "fs";
import * as mupdf from "mupdf";
// args: pdf page scale out [cropXpt cropYpt cropWpt cropHpt]  (crop in PDF points)
const a = process.argv.slice(2);
const [pdfPath, pageStr, scaleStr, outPng] = a;
const s = parseFloat(scaleStr);
const buf = fs.readFileSync(pdfPath);
const doc = mupdf.Document.openDocument(buf, "application/pdf");
const page = doc.loadPage(parseInt(pageStr,10) - 1);
const m = mupdf.Matrix.scale(s, s);
if (a.length >= 8) {
  const [cx,cy,cw,ch] = a.slice(4).map(Number);
  const bbox = [cx*s, cy*s, (cx+cw)*s, (cy+ch)*s];
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
  pix.clear(255);
  const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
  page.run(dev, m);
  dev.close();
  fs.writeFileSync(outPng, pix.asPNG());
  console.log("cropped", outPng, pix.getWidth()+"x"+pix.getHeight());
} else {
  const pix = page.toPixmap(m, mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(outPng, pix.asPNG());
  console.log("rendered", outPng, pix.getWidth()+"x"+pix.getHeight());
}
