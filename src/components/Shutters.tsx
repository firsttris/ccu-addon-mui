interface ShuttersProps {
  percent: number;
  onLamellaClick: (percent: number) => void;
}

export const Shutters = ({ percent, onLamellaClick }: ShuttersProps) => {
  const lamellen = Array.from({ length: 10 }); // 10 Lamellen
  const lamellenHeight = 10; // Höhe jeder Lamelle
  const lamellenGap = 1; // Abstand zwischen Lamellen
  const totalHeight = lamellen.length * (lamellenHeight + lamellenGap);

  // Berechnung der sichtbaren Höhe basierend auf umgekehrtem Prozent
  const visibleHeight = ((100 - percent) / 100) * totalHeight;

  const handleClick = (index: number) => {
    const clickedPercent = 100 - (index / lamellen.length) * 100;
    onLamellaClick(clickedPercent);
  };

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 120 ${totalHeight + 10}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ maxWidth: '280px', maxHeight: '220px' }}
    >
      <defs>
        {/* Gradient für 3D-Effekt der Lamellen */}
        <linearGradient id="lamellaGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: '#4a4a4a', stopOpacity: 1 }} />
          <stop offset="15%" style={{ stopColor: '#6a6a6a', stopOpacity: 1 }} />
          <stop offset="50%" style={{ stopColor: '#8a8a8a', stopOpacity: 1 }} />
          <stop offset="85%" style={{ stopColor: '#6a6a6a', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#4a4a4a', stopOpacity: 1 }} />
        </linearGradient>
        
        {/* Schatten für Lamellen */}
        <filter id="lamellaShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" />
          <feOffset dx="0" dy="1" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.3" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Fenster-Rahmen */}
      <rect
        x="5"
        y="5"
        width="110"
        height={totalHeight}
        fill="#e8f4fd"
        stroke="#3A3A3A"
        strokeWidth="2"
        rx="3"
        ry="3"
      />

      {/* Innerer Schatten des Rahmens */}
      <rect
        x="7"
        y="7"
        width="106"
        height={totalHeight - 4}
        fill="none"
        stroke="rgba(0,0,0,0.1)"
        strokeWidth="1"
        rx="2"
        ry="2"
      />

      {/* Führungsschienen links und rechts */}
      <rect
        x="5"
        y="5"
        width="4"
        height={totalHeight}
        fill="#3A3A3A"
        rx="1"
      />
      <rect
        x="111"
        y="5"
        width="4"
        height={totalHeight}
        fill="#3A3A3A"
        rx="1"
      />

      {/* Lamellen mit Animation */}
      <g style={{ transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        {lamellen.map((_, index) => {
          const yPosition = 5 + index * (lamellenHeight + lamellenGap);
          const isVisible = yPosition < visibleHeight + 5;
          
          return (
            <g key={index}>
              {isVisible && (
                <>
                  {/* Hauptlamelle mit 3D-Effekt */}
                  <rect
                    x="9"
                    y={yPosition}
                    width="102"
                    height={lamellenHeight}
                    fill="url(#lamellaGradient)"
                    rx="1.5"
                    ry="1.5"
                    filter="url(#lamellaShadow)"
                    style={{ 
                      transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />
                  
                  {/* Highlight oben für 3D-Effekt */}
                  <rect
                    x="9"
                    y={yPosition}
                    width="102"
                    height="2"
                    fill="rgba(255, 255, 255, 0.15)"
                    rx="1.5"
                    ry="1.5"
                    style={{ pointerEvents: 'none' }}
                  />
                  
                  {/* Schatten unten für Tiefe */}
                  <rect
                    x="9"
                    y={yPosition + lamellenHeight - 1.5}
                    width="102"
                    height="1.5"
                    fill="rgba(0, 0, 0, 0.2)"
                    rx="1"
                    ry="1"
                    style={{ pointerEvents: 'none' }}
                  />

                  {/* Feine Linien für Struktur */}
                  <line
                    x1="30"
                    y1={yPosition + lamellenHeight / 2}
                    x2="90"
                    y2={yPosition + lamellenHeight / 2}
                    stroke="rgba(0, 0, 0, 0.1)"
                    strokeWidth="0.5"
                    style={{ pointerEvents: 'none' }}
                  />
                </>
              )}
              
              {/* Unsichtbarer Klick-Bereich für alle Lamellen (auch nicht sichtbare) */}
              <rect
                x="9"
                y={yPosition}
                width="102"
                height={lamellenHeight}
                fill="transparent"
                onClick={() => handleClick(index)}
                style={{ cursor: 'pointer' }}
              />
            </g>
          );
        })}
      </g>

      {/* Aufrollmechanik oben */}
      <rect
        x="5"
        y="0"
        width="110"
        height="6"
        fill="#3A3A3A"
        rx="2"
        ry="2"
      />
      <circle cx="60" cy="3" r="1.5" fill="#7f8c8d" />
    </svg>
  );
};
