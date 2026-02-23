import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Play, Shield, Crosshair, Zap } from 'lucide-react';

// --- Types & Constants ---

type Point = { x: number; y: number };

interface GameObject {
  id: number;
  x: number;
  y: number;
  active: boolean;
}

interface Tower extends GameObject {
  ammo: number;
  maxAmmo: number;
  color: string;
}

interface City extends GameObject {
  color: string;
}

interface Missile extends GameObject {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  speed: number;
  progress: number; // 0 to 1
  color: string;
  trail: Point[];
}

interface Explosion extends GameObject {
  radius: number;
  maxRadius: number;
  duration: number;
  age: number;
  color: string;
}

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const GROUND_HEIGHT = 40;
const WIN_SCORE = 1000;
const AMMO_BONUS = 5; // Points per unused ammo

const TEXT = {
  en: {
    title: "Tina Nova Defense",
    score: "Score",
    wave: "Wave",
    start: "Start Game",
    restart: "Play Again",
    victory: "Mission Accomplished!",
    defeat: "Defense Failed",
    ammo: "Ammo",
    instructions: "Tap to shoot. Defend cities & towers. 1000 pts to win.",
    nextWave: "Wave Complete!",
    bonus: "Ammo Bonus",
  },
  zh: {
    title: "Tina新星防御",
    score: "得分",
    wave: "波次",
    start: "开始游戏",
    restart: "再玩一次",
    victory: "任务完成！",
    defeat: "防御失败",
    ammo: "弹药",
    instructions: "点击发射。保卫城市和炮台。达到1000分获胜。",
    nextWave: "波次完成！",
    bonus: "弹药奖励",
  }
};

const distance = (p1: Point, p2: Point) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

export default function TinaNovaDefense() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const [lang, setLang] = useState<'en' | 'zh'>('zh');
  const [gameState, setGameState] = useState<'start' | 'playing' | 'victory' | 'defeat' | 'wave_complete'>('start');
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [waveMessage, setWaveMessage] = useState("");
  
  // Mutable game state
  const state = useRef({
    towers: [] as Tower[],
    cities: [] as City[],
    playerMissiles: [] as Missile[],
    enemyMissiles: [] as Missile[],
    explosions: [] as Explosion[],
    lastTime: 0,
    spawnTimer: 0,
    spawnInterval: 2000,
    score: 0,
    wave: 1,
    enemiesToSpawn: 10, // Initial enemies per wave
    enemiesSpawned: 0,
    enemySpeedMultiplier: 1,
  });

  // --- Initialization ---

  const initGame = (resetScore = true) => {
    const s = state.current;
    if (resetScore) {
      s.score = 0;
      s.wave = 1;
      s.enemySpeedMultiplier = 1;
      s.enemiesToSpawn = 10;
      setScore(0);
      setWave(1);
    }

    // Reset entities
    s.towers = [
      { id: 1, x: GAME_WIDTH * 0.1, y: GAME_HEIGHT - GROUND_HEIGHT + 10, active: true, ammo: 20, maxAmmo: 20, color: '#60a5fa' },
      { id: 2, x: GAME_WIDTH * 0.5, y: GAME_HEIGHT - GROUND_HEIGHT + 10, active: true, ammo: 40, maxAmmo: 40, color: '#60a5fa' },
      { id: 3, x: GAME_WIDTH * 0.9, y: GAME_HEIGHT - GROUND_HEIGHT + 10, active: true, ammo: 20, maxAmmo: 20, color: '#60a5fa' },
    ];

    const cityY = GAME_HEIGHT - GROUND_HEIGHT + 15;
    s.cities = [
      { id: 1, x: GAME_WIDTH * 0.2, y: cityY, active: true, color: '#34d399' },
      { id: 2, x: GAME_WIDTH * 0.3, y: cityY, active: true, color: '#34d399' },
      { id: 3, x: GAME_WIDTH * 0.4, y: cityY, active: true, color: '#34d399' },
      { id: 4, x: GAME_WIDTH * 0.6, y: cityY, active: true, color: '#34d399' },
      { id: 5, x: GAME_WIDTH * 0.7, y: cityY, active: true, color: '#34d399' },
      { id: 6, x: GAME_WIDTH * 0.8, y: cityY, active: true, color: '#34d399' },
    ];

    s.playerMissiles = [];
    s.enemyMissiles = [];
    s.explosions = [];
    s.spawnTimer = 0;
    s.enemiesSpawned = 0;
    s.spawnInterval = Math.max(500, 2500 - (s.wave * 200));
    
    setGameState('playing');
  };

  const startNextWave = () => {
    const s = state.current;
    s.wave += 1;
    s.enemySpeedMultiplier += 0.15;
    s.enemiesToSpawn = 10 + (s.wave * 2); // Increase enemies
    s.enemiesSpawned = 0;
    s.spawnInterval = Math.max(400, 2500 - (s.wave * 150));
    
    // Replenish ammo
    s.towers.forEach(t => {
      if (t.active) {
        t.ammo = t.maxAmmo;
      }
    });

    s.playerMissiles = [];
    s.enemyMissiles = [];
    s.explosions = [];
    
    setWave(s.wave);
    setGameState('playing');
  };

  // --- Game Loop ---

  const update = useCallback((time: number) => {
    const s = state.current;
    if (s.lastTime === 0) s.lastTime = time;
    const dt = time - s.lastTime;
    s.lastTime = time;

    if (gameState !== 'playing') {
       requestRef.current = requestAnimationFrame(update);
       return;
    }

    // 1. Spawn Enemies
    if (s.enemiesSpawned < s.enemiesToSpawn) {
        s.spawnTimer += dt;
        if (s.spawnTimer > s.spawnInterval) {
            s.spawnTimer = 0;
            s.enemiesSpawned++;
            
            const startX = Math.random() * GAME_WIDTH;
            // Target logic: 70% chance to target a structure, 30% random ground
            let targetX = Math.random() * GAME_WIDTH;
            let targetY = GAME_HEIGHT - GROUND_HEIGHT;

            const targets = [...s.cities, ...s.towers].filter(t => t.active);
            if (targets.length > 0 && Math.random() < 0.7) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                targetX = target.x;
                targetY = target.y;
            }

            s.enemyMissiles.push({
                id: Date.now() + Math.random(),
                x: startX,
                y: 0,
                startX: startX,
                startY: 0,
                targetX: targetX,
                targetY: targetY,
                active: true,
                speed: (0.03 + (Math.random() * 0.02)) * s.enemySpeedMultiplier,
                progress: 0,
                color: '#ef4444',
                trail: []
            });
        }
    } else if (s.enemyMissiles.length === 0 && s.explosions.length === 0) {
        // Wave Complete
        let bonus = 0;
        s.towers.forEach(t => {
            if (t.active) bonus += t.ammo * AMMO_BONUS;
        });
        
        s.score += bonus;
        setScore(s.score);
        setWaveMessage(`+${bonus} Pts`);
        setGameState('wave_complete');
        
        setTimeout(() => {
            if (s.score >= WIN_SCORE) {
                setGameState('victory');
            } else {
                startNextWave();
            }
        }, 3000);
    }

    // 2. Update Player Missiles
    s.playerMissiles.forEach(m => {
      if (!m.active) return;
      m.progress += m.speed * dt;
      
      // Update trail
      if (m.progress < 1 && Math.random() > 0.5) {
          m.trail.push({x: m.x, y: m.y});
          if (m.trail.length > 10) m.trail.shift();
      }

      if (m.progress >= 1) {
        m.active = false;
        s.explosions.push({
          id: Date.now() + Math.random(),
          x: m.targetX,
          y: m.targetY,
          active: true,
          radius: 0,
          maxRadius: 70, // Player explosions are bigger
          duration: 1200,
          age: 0,
          color: '#ffffff'
        });
      } else {
        m.x = m.startX + (m.targetX - m.startX) * m.progress;
        m.y = m.startY + (m.targetY - m.startY) * m.progress;
      }
    });

    // 3. Update Enemy Missiles
    s.enemyMissiles.forEach(m => {
      if (!m.active) return;
      m.progress += m.speed * dt * 0.005;
      
      m.x = m.startX + (m.targetX - m.startX) * m.progress;
      m.y = m.startY + (m.targetY - m.startY) * m.progress;

      // Trail
      if (Math.random() > 0.7) {
          m.trail.push({x: m.x, y: m.y});
          if (m.trail.length > 5) m.trail.shift();
      }

      if (m.progress >= 1) {
        m.active = false;
        // Impact Explosion
        s.explosions.push({
          id: Date.now() + Math.random(),
          x: m.x,
          y: m.y,
          active: true,
          radius: 0,
          maxRadius: 40,
          duration: 800,
          age: 0,
          color: '#f59e0b'
        });

        // Check destruction
        [...s.cities, ...s.towers].forEach(structure => {
          if (structure.active && distance(m, structure) < 35) {
            structure.active = false;
            // Add debris explosion
             s.explosions.push({
                id: Date.now() + Math.random(),
                x: structure.x,
                y: structure.y,
                active: true,
                radius: 0,
                maxRadius: 50,
                duration: 1000,
                age: 0,
                color: '#ef4444'
            });
          }
        });
      }
    });

    // 4. Update Explosions & Collisions
    s.explosions.forEach(e => {
      if (!e.active) return;
      e.age += dt;
      if (e.age > e.duration) {
        e.active = false;
      } else {
        const halfLife = e.duration / 2;
        if (e.age < halfLife) {
          e.radius = (e.age / halfLife) * e.maxRadius;
        } else {
          e.radius = (1 - (e.age - halfLife) / halfLife) * e.maxRadius;
        }

        // Collision with enemies
        s.enemyMissiles.forEach(m => {
          if (m.active && distance(m, e) < e.radius) {
            m.active = false;
            s.score += 20;
            setScore(s.score);
            
            // Secondary explosion
            s.explosions.push({
              id: Date.now() + Math.random(),
              x: m.x,
              y: m.y,
              active: true,
              radius: 0,
              maxRadius: 30,
              duration: 600,
              age: 0,
              color: '#fbbf24'
            });
          }
        });
      }
    });

    // 5. Cleanup
    s.playerMissiles = s.playerMissiles.filter(m => m.active);
    s.enemyMissiles = s.enemyMissiles.filter(m => m.active);
    s.explosions = s.explosions.filter(e => e.active);

    // 6. Check End Game
    const activeTowers = s.towers.filter(t => t.active).length;
    if (activeTowers === 0) {
      setGameState('defeat');
    } else if (s.score >= WIN_SCORE && gameState === 'playing') {
       // Wait for wave end to trigger victory usually, but prompt says "Get 1000 points... success"
       // We'll let the wave finish or trigger immediately? 
       // Let's trigger immediately for gratification
       setGameState('victory');
    }

    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [gameState]); // Re-create if gameState changes

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = state.current;

    // Clear with trail effect
    ctx.fillStyle = 'rgba(17, 24, 39, 0.4)'; // Fade out effect
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Ground
    ctx.fillStyle = '#b45309'; 
    ctx.fillRect(0, GAME_HEIGHT - GROUND_HEIGHT, GAME_WIDTH, GROUND_HEIGHT);
    // Ground Line
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GAME_HEIGHT - GROUND_HEIGHT);
    ctx.lineTo(GAME_WIDTH, GAME_HEIGHT - GROUND_HEIGHT);
    ctx.stroke();

    // Cities
    s.cities.forEach(c => {
      if (c.active) {
        ctx.fillStyle = c.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = c.color;
        ctx.beginPath();
        // Dome shape
        ctx.arc(c.x, c.y, 15, Math.PI, 0);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Towers
    s.towers.forEach(t => {
      if (t.active) {
        ctx.fillStyle = t.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = t.color;
        
        // Pyramid shape
        ctx.beginPath();
        ctx.moveTo(t.x - 25, t.y + 10);
        ctx.lineTo(t.x, t.y - 30);
        ctx.lineTo(t.x + 25, t.y + 10);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Ammo
        if (t.ammo > 0) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(t.ammo.toString(), t.x, t.y + 30);
        } else {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText("EMPTY", t.x, t.y + 30);
        }
      }
    });

    // Player Missiles
    s.playerMissiles.forEach(m => {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.startX, m.startY);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();

      // Crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      const size = 8;
      ctx.beginPath();
      ctx.moveTo(m.targetX - size, m.targetY - size);
      ctx.lineTo(m.targetX + size, m.targetY + size);
      ctx.moveTo(m.targetX + size, m.targetY - size);
      ctx.lineTo(m.targetX - size, m.targetY + size);
      ctx.stroke();
    });

    // Enemy Missiles
    s.enemyMissiles.forEach(m => {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.startX, m.startY);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      
      // Head
      ctx.fillStyle = '#fff';
      ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
    });

    // Explosions
    s.explosions.forEach(e => {
      ctx.fillStyle = e.color;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });
  };

  const handleInput = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      // Prevent default to stop scrolling on mobile
      // e.preventDefault(); // React synthetic events might not support this directly here, handled in style
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    
    const targetX = (clientX - rect.left) * scaleX;
    const targetY = (clientY - rect.top) * scaleY;

    // Don't shoot below ground too deep
    if (targetY > GAME_HEIGHT - GROUND_HEIGHT + 10) return;

    const s = state.current;
    let bestTower = null;
    let minDist = Infinity;

    // Find closest tower with ammo
    s.towers.forEach(t => {
      if (t.active && t.ammo > 0) {
        const d = distance({ x: t.x, y: t.y }, { x: targetX, y: targetY });
        if (d < minDist) {
          minDist = d;
          bestTower = t;
        }
      }
    });

    if (bestTower) {
      bestTower.ammo--;
      s.playerMissiles.push({
        id: Date.now(),
        x: bestTower.x,
        y: bestTower.y - 30,
        startX: bestTower.x,
        startY: bestTower.y - 30,
        targetX,
        targetY,
        active: true,
        speed: 0.02, // Slightly faster player missiles
        progress: 0,
        color: '#60a5fa',
        trail: []
      });
    }
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  const t = TEXT[lang];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center font-sans text-gray-100 overflow-hidden select-none touch-none">
      
      {/* Header */}
      <div className="w-full max-w-4xl flex justify-between items-center p-4 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-blue-400 hidden sm:block tracking-wider uppercase">{t.title}</h1>
          <div className="bg-gray-900/80 px-4 py-2 rounded-lg border border-blue-900/50 flex items-center gap-2 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
            <Shield className="w-4 h-4 text-green-400" />
            <span className="font-mono text-lg text-green-100">{score}</span>
          </div>
          <div className="bg-gray-900/80 px-4 py-2 rounded-lg border border-red-900/50 flex items-center gap-2 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
            <Crosshair className="w-4 h-4 text-red-400" />
            <span className="font-mono text-lg text-red-100">{wave}</span>
          </div>
        </div>
        
        <button 
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm border border-gray-600 transition-colors"
        >
            {lang === 'en' ? '中文' : 'EN'}
        </button>
      </div>

      {/* Game Canvas Container */}
      <div className="relative w-full max-w-4xl aspect-[4/3] bg-gray-900 shadow-2xl rounded-xl overflow-hidden border border-gray-800 ring-1 ring-white/10">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="w-full h-full touch-none cursor-crosshair block"
          onMouseDown={handleInput}
          onTouchStart={handleInput}
        />

        {/* Overlays */}
        <AnimatePresence>
          {gameState === 'start' && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center backdrop-blur-sm"
            >
              <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 mb-6 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                {t.title}
              </h1>
              <p className="text-gray-300 mb-8 max-w-md text-lg leading-relaxed">{t.instructions}</p>
              <button
                onClick={() => initGame(true)}
                className="group relative px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full text-xl transition-all hover:scale-105 shadow-[0_0_20px_rgba(37,99,235,0.5)] active:scale-95"
              >
                <span className="flex items-center gap-2">
                  <Play className="w-6 h-6 fill-current" />
                  {t.start}
                </span>
              </button>
            </motion.div>
          )}

          {gameState === 'wave_complete' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            >
              <div className="bg-black/60 backdrop-blur-md p-8 rounded-2xl border border-green-500/30 text-center shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                <h2 className="text-4xl font-bold text-green-400 mb-2">{t.nextWave}</h2>
                <div className="flex items-center justify-center gap-2 text-yellow-400 text-xl font-mono">
                    <Zap className="w-5 h-5" />
                    {t.bonus}: {waveMessage}
                </div>
              </div>
            </motion.div>
          )}

          {(gameState === 'victory' || gameState === 'defeat') && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center backdrop-blur-md z-20"
            >
              <h2 className={`text-5xl md:text-6xl font-black mb-6 ${gameState === 'victory' ? 'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]' : 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]'}`}>
                {gameState === 'victory' ? t.victory : t.defeat}
              </h2>
              <div className="text-3xl font-mono mb-10 text-gray-200 border-b border-gray-700 pb-4">
                {t.score}: <span className="text-white font-bold">{score}</span>
              </div>
              <button
                onClick={() => initGame(true)}
                className="px-10 py-4 bg-white text-black hover:bg-gray-200 font-bold rounded-full text-xl transition-transform hover:scale-105 flex items-center gap-3 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
              >
                <RefreshCw className="w-6 h-6" />
                {t.restart}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Instructions */}
      <div className="mt-6 text-gray-500 text-sm max-w-2xl text-center px-4 font-mono">
        {lang === 'en' 
          ? "Protect your 3 Missile Towers. Don't let them be destroyed!" 
          : "保护你的3座导弹塔。不要让它们被摧毁！"}
      </div>
    </div>
  );
}
