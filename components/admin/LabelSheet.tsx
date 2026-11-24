"use client";
/**
 * Sheet of barcode labels, sized for the back of a standard key card
 * (cards are 85.6 x 54 mm; each label is 50 x 25 mm). Print on sticker paper,
 * cut, stick on the card and cover with clear tape so it lasts.
 *
 * Barcodes are Code 128, which every 1D/2D barcode scanner reads. The room
 * number is printed above the barcode so staff can see which card is which.
 */
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface Label {
  id: number;
  code: string;
  room: string;
  label: string;
}

/** Draws one barcode into an <svg> element. */
function Barcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        height: 40,
        width: 2,
        fontSize: 13,
        margin: 2,
      });
    }
  }, [value]);

  return <svg ref={svgRef} />;
}

/** Toolbar with a Print button, then one label per card. */
export default function LabelSheet({ labels }: { labels: Label[] }) {
  return (
    <div className="container">
      {/* Toolbar, hidden when printing */}
      <div className="no-print row" style={{ marginBottom: 16 }}>
        <a className="btn" href="/admin">
          Kthehu
        </a>
        <span className="muted">{labels.length} etiketa. Printojini në letër ngjitëse dhe ngjitini pas kartave.</span>
        <span className="spacer" />
        <button className="btn blue" onClick={() => window.print()}>
          Printo
        </button>
      </div>

      <div className="labels">
        {labels.map((label) => (
          <div className="label" key={label.id}>
            <div className="label-room">Dhoma {label.room}</div>
            <Barcode value={label.code} />
          </div>
        ))}
      </div>
    </div>
  );
}
