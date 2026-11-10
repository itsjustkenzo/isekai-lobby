import React, { useEffect, useRef, useState } from 'react';
import { C, cssPixel, drawPlate, drawTextCentred, fitText, paintPixelCanvas } from './pixelUi.js';

export default function InventoryHeading({ text, id, level = 3 }) {
  const canvasRef = useRef(null), [unit,setUnit] = useState(cssPixel);
  useEffect(() => { const resize = () => setUnit(cssPixel());window.addEventListener('resize',resize);return () => window.removeEventListener('resize',resize); }, []);
  useEffect(() => { if (!canvasRef.current) return;paintPixelCanvas(canvasRef.current,148,13,(ctx) => {
    drawPlate(ctx,0,0,148,13,level===2?C.gold:C.plate,level===2?C.goldLight:C.plateLight,level===2?C.goldDark:C.plateDark);
    drawTextCentred(ctx,fitText(text.toUpperCase(),136),0,148,4);
  },2); },[text,level,unit]);
  const Tag = level === 2 ? 'h2' : 'h3';
  return <Tag className="inventory-pixel-heading" id={id} aria-label={text}><canvas ref={canvasRef} aria-hidden="true" /></Tag>;
}
