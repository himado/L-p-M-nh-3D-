// Sân cầu lông trong nhà thể chất — dùng chung client (vật lý, hiển thị) và server (tính điểm).
// Sân đơn chuẩn: dài 13.4 m, rộng 5.18 m, lưới cao 1.55 m. Bên A ở phía z > lưới, bên B ở phía z < lưới.
export const COURT = {
  cx: -43,        // tâm sân theo x (trong nhà thể chất)
  netZ: 37.5,     // vị trí lưới theo z
  halfLen: 6.7,   // từ lưới tới đường biên cuối
  halfW: 2.59,    // nửa chiều rộng sân đơn
  postHalfW: 3.05,// cột lưới đặt theo sân đôi
  netH: 1.55,
  // camera trận đấu không được lùi ra ngoài tường nhà thể chất
  cam: { minX: -50.2, maxX: -17.8, minZ: 25.8, maxZ: 49.2 },
};

// Lực cản không khí của quả cầu: a = g − k·|v|·v  (k = 0.12 → vận tốc rơi tối đa ≈ 9 m/s)
export const BM = { drag: 0.12, g: 9.8, winScore: 11, maxScore: 15, winCoins: 40 };

export const sideOfZ = (z) => (z > COURT.netZ ? 'A' : 'B');
export const otherSide = (s) => (s === 'A' ? 'B' : 'A');

/** Ai thắng điểm khi cầu chạm đất tại (x, z), người đánh cuối là `lastHitter`. */
export function rallyWinner(lastHitter, x, z) {
  const opp = otherSide(lastHitter);
  const inBounds = Math.abs(x - COURT.cx) <= COURT.halfW + 0.05 && Math.abs(z - COURT.netZ) <= COURT.halfLen + 0.05;
  const landedOpp = sideOfZ(z) === opp;
  return { winner: landedOpp && inBounds ? lastHitter : opp, reason: !landedOpp ? 'net' : inBounds ? 'in' : 'out' };
}

export function gameOver(score) {
  const { A, B } = score;
  if (Math.max(A, B) >= BM.maxScore) return A > B ? 'A' : 'B';
  if (Math.max(A, B) >= BM.winScore && Math.abs(A - B) >= 2) return A > B ? 'A' : 'B';
  return null;
}
