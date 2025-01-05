import { useState } from "react";

const Rolladen = () => {
  const [percent, setPercent] = useState(100); // 100% geschlossen

  const lamellen = Array.from({ length: 10 }); // 10 Lamellen
  const lamellenHeight = 8; // Höhe jeder Lamelle
  const totalHeight = lamellen.length * lamellenHeight;

  // Berechnung der sichtbaren Höhe basierend auf Prozent
  const visibleHeight = (percent / 100) * totalHeight;

return (
    <div style={{ textAlign: "center" }}>
      <svg
        width="200"
        height="100"
        viewBox={`0 0 100 ${totalHeight}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Rahmen */}
        <rect
          x="0"
          y="0"
          width="100"
          height={totalHeight}
          fill="none"
          stroke="black"
        />
        {/* Vertikale Linie in der Mitte */}
        <line
          x1="50"
          y1={visibleHeight}
          x2="50"
          y2={totalHeight}
          stroke="black"
          strokeWidth="1"
        />
        {/* Lamellen */}
        {lamellen.map((_, index) => {
          const yPosition = index * lamellenHeight;
          const isVisible = yPosition < visibleHeight; // Sichtbarkeit prüfen
          return (
            <rect
              key={index}
              x="0"
              y={yPosition}
              width="100"
              height={lamellenHeight - 1} // Abstand zwischen Lamellen
              fill={isVisible ? "gray" : "transparent"}
            />
          );
        })}
      </svg>
      <div style={{ marginTop: "10px" }}>
        <label htmlFor="percent">Öffnungsgrad (%): </label>
        <input
          id="percent"
          type="number"
          value={percent}
          min="0"
          max="100"
          onChange={(e) => setPercent(Number(e.target.value))}
          style={{ width: "60px", marginRight: "10px" }}
        />
        <span>{percent}%</span>
      </div>
    </div>
  );
};

export default Rolladen;