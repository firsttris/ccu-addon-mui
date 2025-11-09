interface ShuttersProps {
  percent: number;
  onLamellaClick: (percent: number) => void;
}

export const Shutters = ({ percent, onLamellaClick }: ShuttersProps) => {
  const lamellen = Array.from({ length: 10 }); // 10 Lamellen
  const lamellenHeight = 8; // Höhe jeder Lamelle
  const totalHeight = lamellen.length * lamellenHeight;

  // Berechnung der sichtbaren Höhe basierend auf umgekehrtem Prozent
  const visibleHeight = ((100 - percent) / 100) * totalHeight;

  const handleClick = (index: number) => {
    const clickedPercent = 100 - (index / lamellen.length) * 100;
    onLamellaClick(clickedPercent);
  };

  return (
    <svg
      width="300"
      height="200"
      viewBox={`0 0 100 ${totalHeight}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rahmen */}
      <rect
        x="0"
        y="0"
        width="100"
        height={totalHeight}
        fill="#96c2ff" // Himmelblau
        stroke="black"
        rx="2" // Abrundung der Ecken
        ry="2" // Abrundung der Ecken
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
            fill={isVisible ? '#A9A9A9' : 'transparent'} // Farben für geschlossene und offene Lamellen
            onClick={() => handleClick(index)}
            style={{ cursor: 'pointer' }}
            rx="1" // Abrundung der Ecken
            ry="1" // Abrundung der Ecken
          />
        );
      })}
    </svg>
  );
};
