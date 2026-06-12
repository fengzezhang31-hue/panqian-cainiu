function drawBull(ctx, w, h, t) {
  const cx = w/2, cy = h/2.3;
  ctx.save();
  ctx.fillStyle = '#ff0055'; ctx.beginPath();
  ctx.ellipse(cx, cy+30, 35, 40, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(40,0,30,0.6)'; ctx.beginPath();
  ctx.ellipse(cx, cy+28, 22, 28, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ff3355'; ctx.beginPath();
  ctx.ellipse(cx, cy-20, 25, 22, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx-12, cy-35); ctx.lineTo(cx-22, cy-65); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+12, cy-35); ctx.lineTo(cx+22, cy-65); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx-8, cy-24, 5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+8, cy-24, 5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx-7+Math.sin(t*0.003)*1.5, cy-24, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+7+Math.sin(t*0.003)*1.5, cy-24, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ff4466'; ctx.beginPath(); ctx.arc(cx-6, cy-12, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+6, cy-12, 3, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy-5, 10, 0.2, Math.PI-0.2); ctx.stroke();
  ctx.fillStyle = '#ff3355';
  ctx.fillRect(cx-20, cy+55, 14, 30); ctx.fillRect(cx+6, cy+55, 14, 30);
  ctx.restore();
}

function drawBear(ctx, w, h, t) {
  const cx = w/2, cy = h/2.5;
  ctx.save();
  ctx.fillStyle = '#ffaa00'; ctx.beginPath();
  ctx.ellipse(cx, cy+30, 38, 42, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(50,30,5,0.5)'; ctx.beginPath();
  ctx.ellipse(cx, cy+28, 26, 32, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffaa44'; ctx.beginPath();
  ctx.ellipse(cx, cy-25, 28, 26, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx-22, cy-45, 10, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+22, cy-45, 10, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,100,50,0.5)'; ctx.beginPath();
  ctx.arc(cx-22, cy-45, 5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+22, cy-45, 5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx-9, cy-30, 6, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+9, cy-30, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx-8, cy-30, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+8+Math.sin(t*0.002)*1, cy-30, 3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#663300'; ctx.beginPath(); ctx.arc(cx, cy-18, 5, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#ff0033'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx-4, cy-10, 6, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx+4, cy-10, 6, 0, Math.PI); ctx.stroke();
  ctx.fillStyle = '#ffaa00';
  ctx.beginPath(); ctx.arc(cx-18, cy+70, 14, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+18, cy+70, 14, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}