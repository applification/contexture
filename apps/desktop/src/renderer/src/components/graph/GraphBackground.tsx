import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isAccent: boolean;
  outerR: number;
  innerR: number;
}

const NODE_COUNT = 18;
const CONNECTION_DISTANCE = 140;
const NODE_SPEED = 0.3;

export function GraphBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const context = cvs.getContext('2d');
    if (!context) return;

    // Store in consts so closures retain the non-null narrowing
    const canvas: HTMLCanvasElement = cvs;
    const ctx: CanvasRenderingContext2D = context;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();

    const w = () => canvas.offsetWidth;
    const h = () => canvas.offsetHeight;

    // Initialize nodes
    nodesRef.current = Array.from({ length: NODE_COUNT }, (_, i) => ({
      x: Math.random() * w(),
      y: Math.random() * h(),
      vx: (Math.random() - 0.5) * NODE_SPEED,
      vy: (Math.random() - 0.5) * NODE_SPEED,
      isAccent: i % 3 === 0,
      outerR: 5 + Math.random() * 3,
      innerR: 2.5 + Math.random() * 1.5,
    }));

    const style = getComputedStyle(document.documentElement);

    function draw() {
      const width = w();
      const height = h();
      ctx.clearRect(0, 0, width, height);

      const nodes = nodesRef.current;
      const primaryColor = style.getPropertyValue('--primary').trim() || 'oklch(0.45 0.15 270)';
      const accentColor = style.getPropertyValue('--accent').trim() || 'oklch(0.75 0.15 195)';

      // Update positions
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
        node.x = Math.max(0, Math.min(width, node.x));
        node.y = Math.max(0, Math.min(height, node.y));
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DISTANCE) {
            ctx.globalAlpha = 0.4 * (1 - dist / CONNECTION_DISTANCE);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = nodes[i].isAccent || nodes[j].isAccent ? accentColor : primaryColor;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      // Draw nodes — outer halo + inner dot
      for (const node of nodes) {
        const color = node.isAccent ? accentColor : primaryColor;

        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.outerR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.innerR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
