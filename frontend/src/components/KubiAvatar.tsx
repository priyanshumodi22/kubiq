import { useEffect, useRef } from 'react';
import { kubiAvatarStates, type KubiAvatarState } from './kubiAvatarState';

type Props = { state?: KubiAvatarState; size?: number; className?: string; paused?: boolean };

/** Original procedural kubi artwork. No images, WebGL, or animation dependencies. */
export function KubiAvatar({ state = 'idle', size = 48, className = '', paused = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const redrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stateRef.current = state;
    redrawRef.current?.();
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    let frame = 0;
    let lastTime = 0;
    let time = 0;
    let gaze = 0;
    let velocity = 0;
    let blinkAt = 2.2 + Math.random() * 3.2;
    let color = [59, 130, 246];
    const canAnimate = () => !paused && !motionQuery.matches && visible && !document.hidden;

    const draw = (timestamp: number) => {
      frame = 0;
      const animate = canAnimate();
      const dt = animate && lastTime ? Math.min((timestamp - lastTime) / 1000, 0.032) : 0;
      lastTime = timestamp;
      time += dt;
      const current = stateRef.current;
      const target = current === 'searching' ? Math.sin(time * 1.8) * 9 : current === 'thinking' ? 4 : 0;
      velocity += (60 * (target - gaze) - 9 * velocity) * dt;
      gaze = animate ? gaze + velocity * dt : current === 'searching' ? 7 : target;
      const hex = kubiAvatarStates[current].color;
      const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
      color = color.map((value, index) => animate ? value + (rgb[index] - value) * (1 - Math.exp(-dt * 7)) : rgb[index]);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixels = Math.round(size * dpr);
      if (canvas.width !== pixels || canvas.height !== pixels) { canvas.width = pixels; canvas.height = pixels; }
      ctx.setTransform(pixels / 180, 0, 0, pixels / 180, 0, 0);
      ctx.clearRect(0, 0, 180, 180);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(90, 153, 45, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(90, 90 + (animate ? Math.sin(time * 1.7) * 2.3 : 0));
      ctx.rotate(current === 'thinking' ? -0.13 : current === 'error' ? 0.08 : current === 'searching' ? gaze * 0.008 : 0);
      ctx.translate(-90, -90);
      const gradient = ctx.createLinearGradient(45, 36, 126, 142);
      gradient.addColorStop(0, '#d8efff'); gradient.addColorStop(0.48, '#80b9fa');
      // Shell stays blue: states change face, pose and signal fins, not identity.
      gradient.addColorStop(1, '#347ad9');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.moveTo(90, 36);
      ctx.bezierCurveTo(133, 36, 148, 48, 148, 89); ctx.bezierCurveTo(148, 131, 133, 142, 90, 142);
      ctx.bezierCurveTo(47, 142, 32, 131, 32, 89); ctx.bezierCurveTo(32, 48, 47, 36, 90, 36); ctx.fill();
      ctx.fillStyle = '#071426'; ctx.strokeStyle = '#609fdf'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(40, 64, 100, 64, 25); ctx.fill(); ctx.stroke();
      const signal = `rgb(${color.map(Math.round).join(',')})`;
      ctx.fillStyle = signal;
      const finShift = current === 'searching' && animate ? Math.sin(time * 2.4) * 14 : current === 'working' ? 10 + (animate ? Math.sin(time * 3) * 4 : 0) : 0;
      for (const side of [-1, 1]) {
        const x = side < 0 ? 23 : 157;
        const y = 77 + side * (current === 'finished' ? 0 : 10) + finShift * side;
        ctx.beginPath(); ctx.ellipse(x, y, 4.5, 12, side * 0.25, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(237,248,255,0.8)';
      ctx.beginPath(); ctx.moveTo(81, 49); ctx.lineTo(90, 44); ctx.lineTo(99, 49); ctx.lineTo(90, 54); ctx.closePath(); ctx.fill();
      const blinking = animate && time >= blinkAt && time < blinkAt + 0.12;
      if (time >= blinkAt + 0.12) blinkAt = time + 2.2 + Math.random() * 3.2;
      ctx.fillStyle = signal; ctx.strokeStyle = signal; ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const x = 68 + i * 32 + gaze;
        const y = current === 'thinking' ? 83 : 89;
        if (current === 'finished' && !blinking) {
          ctx.beginPath(); ctx.moveTo(x, 93); ctx.quadraticCurveTo(x + 6, 83, x + 12, 93); ctx.stroke();
        } else {
          const height = blinking ? 3 : current === 'composing' ? 12 + (animate ? (Math.sin(time * 4 + i * Math.PI) + 1) * 3.5 : i * 7) : current === 'thinking' && i === 1 ? 13 : 19;
          ctx.beginPath(); ctx.roundRect(x, y + (19 - height) / 2, 12, height, Math.min(6, height / 2)); ctx.fill();
        }
      }
      ctx.strokeStyle = signal; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(84 + gaze * 0.4, 115);
      ctx.quadraticCurveTo(90 + gaze * 0.4, current === 'error' ? 112 : 119, 96 + gaze * 0.4, 115); ctx.stroke();
      if (current === 'composing') {
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = animate ? 0.5 + 0.5 * Math.sin(time * 4 - i) ** 2 : 1;
          ctx.beginPath(); ctx.arc(77 + i * 13, 149, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (animate) frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      lastTime = 0;
      draw(performance.now());
    };
    redrawRef.current = restart;
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; restart(); });
    observer.observe(canvas);
    motionQuery.addEventListener('change', restart);
    document.addEventListener('visibilitychange', restart);
    restart();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionQuery.removeEventListener('change', restart);
      document.removeEventListener('visibilitychange', restart);
      redrawRef.current = null;
    };
  }, [size, paused]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} className={`shrink-0 ${className}`} role="img" aria-label={`kubi: ${kubiAvatarStates[state].label}`} data-kubi-state={state} />;
}
