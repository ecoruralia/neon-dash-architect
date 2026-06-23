;(function () {
  'use strict';

  // ===================== CONFIG =====================
  const W = 400, H = 600
  const GRAVITY = 0.55
  const JUMP_VEL = -9
  const HOVER_THRUST = -0.55
  const HOVER_MAX_UP = -7
  const PLAYER_SIZE = 28
  const PLAYER_X = 80
  const GROUND_Y = 530
  const OBSTACLE_WIDTH = 45
  const INITIAL_GAP = 195
  const MIN_GAP = 125
  const INITIAL_SPEED = 2.5
  const MAX_SPEED = 6.0
  const SPAWN_INTERVAL = 1500
  const MIN_SPAWN_INTERVAL = 750
  const PLAYER_HITBOX_SCALE = 0.82

  // ===================== CANVAS =====================
  const canvas = document.getElementById('game')
  const ctx = canvas.getContext('2d')

  // ===================== DOM REFS =====================
  const startOverlay = document.getElementById('startOverlay')
  const gameOverOverlay = document.getElementById('gameOverOverlay')
  const finalScoreEl = document.getElementById('finalScore')
  const finalBestEl = document.getElementById('finalBest')
  const soundToggle = document.getElementById('soundToggle')

  // ===================== STATE =====================
  let state = 'start' // start | playing | dead
  let score = 0
  let bestScore = parseInt(localStorage.getItem('neonDashBest') || '0', 10)
  let speed = INITIAL_SPEED
  let gapSize = INITIAL_GAP
  let shakeAmount = 0
  let soundOn = true
  let scoreFlash = 0
  let deathFlash = 0
  let scoreScale = 1

  // Entities
  const player = { y: GROUND_Y - PLAYER_SIZE, vy: 0 }
  let inputPressed = false
  const obstacles = []
  const particles = []
  const popups = []
  let spawnTimer = 0

  // Stars
  const stars = Array.from({ length: 60 }, () => ({
    x: Math.random() * W,
    y: Math.random() * (GROUND_Y - 40),
    size: Math.random() * 1.8 + 0.4,
    speed: Math.random() * 0.3 + 0.05,
    alpha: Math.random() * 0.6 + 0.2,
  }))

  // ===================== AUDIO =====================
  let audioCtx = null

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
  }

  function playNote(freq, endFreq, dur, vol, type) {
    if (!soundOn || !audioCtx) return
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = type || 'sine'
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    const t = audioCtx.currentTime
    osc.frequency.setValueAtTime(freq, t)
    if (endFreq != null) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
    }
    gain.gain.setValueAtTime(vol || 0.2, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.start(t)
    osc.stop(t + dur)
  }

  function playJump() {
    playNote(380, 760, 0.12, 0.15)
    playNote(520, 880, 0.08, 0.08)
  }

  function playScore() {
    playNote(880, null, 0.08, 0.12)
    setTimeout(() => playNote(1100, null, 0.1, 0.1), 60)
  }

  function playDeath() {
    if (!audioCtx || !soundOn) return
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sawtooth'
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    const t = audioCtx.currentTime
    osc.frequency.setValueAtTime(300, t)
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.35)
    gain.gain.setValueAtTime(0.18, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    osc.start(t)
    osc.stop(t + 0.35)
  }

  // ===================== HELPERS =====================
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min
  }

  function lerp(a, b, t) {
    return a + (b - a) * t
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v))
  }

  // ===================== PARTICLES =====================
  function emitParticles(x, y, count, color, spread) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const spd = rand(1, spread || 4)
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 1,
        life: 1,
        decay: rand(0.015, 0.035),
        size: rand(2, 5),
        color: color || '#00f0ff',
      })
    }
  }

  function emitJumpParticles() {
    emitParticles(PLAYER_X + PLAYER_SIZE / 2, player.y + PLAYER_SIZE, 12, '#00f0ff', 3.5)
    emitParticles(PLAYER_X + PLAYER_SIZE / 2, player.y + PLAYER_SIZE, 6, '#ffffff', 2)
  }

  function emitScoreParticles() {
    emitParticles(PLAYER_X, player.y + PLAYER_SIZE / 2, 8, '#ffd700', 2.5)
  }

  function emitDeathParticles() {
    const cx = PLAYER_X + PLAYER_SIZE / 2
    const cy = player.y + PLAYER_SIZE / 2
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2
      const spd = rand(2, 8)
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1,
        decay: rand(0.01, 0.025),
        size: rand(2, 6),
        color: ['#ff0066', '#ff00aa', '#00f0ff', '#ffffff'][Math.floor(Math.random() * 4)],
      })
    }
  }

  function addScorePopup(text) {
    popups.push({
      x: PLAYER_X + PLAYER_SIZE / 2,
      y: player.y,
      text,
      life: 1,
      vy: -2.2,
    })
  }

  // ===================== OBSTACLES =====================
  function spawnObstacle() {
    const minGapTop = 90
    const maxGapTop = H - gapSize - 40
    // Biased toward lower gaps so more obstacles are reachable with a single jump
    const t = 1 - Math.sqrt(Math.random())
    const gapTop = minGapTop + t * (maxGapTop - minGapTop)
    obstacles.push({
      x: W,
      gapTop,
      gapBottom: gapTop + gapSize,
      scored: false,
    })
  }

  // ===================== GAME LOGIC =====================
  function resetGame() {
    player.y = GROUND_Y - PLAYER_SIZE
    player.vy = 0
    inputPressed = false
    obstacles.length = 0
    particles.length = 0
    popups.length = 0
    score = 0
    speed = INITIAL_SPEED
    gapSize = INITIAL_GAP
    spawnTimer = SPAWN_INTERVAL
    shakeAmount = 0
    scoreFlash = 0
    deathFlash = 0
    scoreScale = 1
  }

  function startGame() {
    initAudio()
    resetGame()
    state = 'playing'
    startOverlay.classList.add('hidden')
    gameOverOverlay.classList.add('hidden')
  }

  function gameOver() {
    state = 'dead'
    if (score > bestScore) {
      bestScore = score
      localStorage.setItem('neonDashBest', String(bestScore))
    }
    finalScoreEl.textContent = score
    finalBestEl.textContent = bestScore
    gameOverOverlay.classList.remove('hidden')
    emitDeathParticles()
    // Extra burst of particles at the collision point
    const cx = PLAYER_X + PLAYER_SIZE / 2
    const cy = player.y + PLAYER_SIZE / 2
    for (let i = 0; i < 15; i++) {
      particles.push({
        x: cx + rand(-10, 10), y: cy + rand(-10, 10),
        vx: rand(-6, 6), vy: rand(-6, 2),
        life: 1, decay: rand(0.008, 0.02),
        size: rand(3, 8),
        color: '#ffffff',
      })
    }
    shakeAmount = 18
    deathFlash = 14
    playDeath()
  }

  function jump() {
    if (state === 'start') {
      startGame()
      // fall through to jump on first press
    }
    if (state === 'dead') {
      startGame()
    }
    if (state !== 'playing') return

    player.vy = JUMP_VEL
    emitJumpParticles()
    playJump()
  }

  function update(dt) {
    if (state !== 'playing') return

    // Hover — hold to rise, release to fall
    if (inputPressed) {
      player.vy += HOVER_THRUST
      if (player.vy < HOVER_MAX_UP) player.vy = HOVER_MAX_UP
      // Engine thrust particles
      if (player.y < GROUND_Y - PLAYER_SIZE - 5 && Math.random() < 0.45) {
        particles.push({
          x: PLAYER_X + PLAYER_SIZE / 2 + rand(-3, 3),
          y: player.y + PLAYER_SIZE,
          vx: rand(-0.8, 0.8),
          vy: rand(1.5, 3.5),
          life: 1,
          decay: rand(0.035, 0.065),
          size: rand(2, 4),
          color: Math.random() < 0.35 ? '#ffffff' : '#00f0ff',
        })
      }
    }

    // Gravity + position
    player.vy += GRAVITY
    player.y += player.vy

    // Ground collision
    if (player.y >= GROUND_Y - PLAYER_SIZE) {
      player.y = GROUND_Y - PLAYER_SIZE
      player.vy = 0
    }

    // Ceiling clamp
    if (player.y < 0) {
      player.y = 0
      player.vy = 0
    }

    // Difficulty scaling — sqrt curve for smooth ramp
    const diff = Math.min(1, score / 100)
    speed = INITIAL_SPEED + (MAX_SPEED - INITIAL_SPEED) * Math.pow(diff, 0.65)
    gapSize = Math.max(MIN_GAP, INITIAL_GAP - (INITIAL_GAP - MIN_GAP) * Math.pow(diff, 0.55))
    const spawnRate = Math.max(MIN_SPAWN_INTERVAL, SPAWN_INTERVAL - score * 12)

    // Spawn obstacles
    spawnTimer += dt
    if (spawnTimer >= spawnRate) {
      const last = obstacles[obstacles.length - 1]
      if (!last || last.x < W - 180) {
        spawnObstacle()
      }
      spawnTimer = 0
    }

    // Update obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i]
      obs.x -= speed

      // Scoring
      if (!obs.scored && obs.x + OBSTACLE_WIDTH < PLAYER_X) {
        obs.scored = true
        score++
        scoreScale = 1.35
        scoreFlash = 8
        emitScoreParticles()
        addScorePopup('+' + 1)
        playScore()
        // Extra golden ring particles
        const cx = PLAYER_X + PLAYER_SIZE / 2
        const cy = player.y + PLAYER_SIZE / 2
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 / 6) * i
          particles.push({
            x: cx, y: cy,
            vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5,
            life: 1, decay: 0.03, size: rand(2, 3),
            color: '#ffd700',
          })
        }
      }

      // Remove off-screen
      if (obs.x + OBSTACLE_WIDTH < -20) {
        obstacles.splice(i, 1)
      }
    }

    // Collision detection
    const pr = {
      x: PLAYER_X + (PLAYER_SIZE * (1 - PLAYER_HITBOX_SCALE)) / 2,
      y: player.y + (PLAYER_SIZE * (1 - PLAYER_HITBOX_SCALE)) / 2,
      w: PLAYER_SIZE * PLAYER_HITBOX_SCALE,
      h: PLAYER_SIZE * PLAYER_HITBOX_SCALE,
    }

    for (const obs of obstacles) {
      const topRect = { x: obs.x, y: 0, w: OBSTACLE_WIDTH, h: obs.gapTop }
      const botRect = { x: obs.x, y: obs.gapBottom, w: OBSTACLE_WIDTH, h: H - obs.gapBottom }
      if (rectsOverlap(pr, topRect) || rectsOverlap(pr, botRect)) {
        gameOver()
        return
      }
    }

    // Decay effects
    if (scoreFlash > 0) scoreFlash--
    if (deathFlash > 0) deathFlash--
    if (shakeAmount > 0) shakeAmount *= 0.9
    if (scoreScale > 1) {
      scoreScale += (1 - scoreScale) * 0.15
      if (scoreScale < 1.01) scoreScale = 1
    }
  }

  // ===================== RENDER =====================
  function drawBackground() {
    // Subtle hue shift toward magenta as score increases
    const hueShift = Math.min(score * 0.6, 40)
    const top = `hsl(${240 + hueShift}, 50%, 7%)`
    const mid = `hsl(${240 + hueShift * 0.7}, 45%, 9%)`
    const bot = `hsl(${240 + hueShift * 0.4}, 40%, 5%)`
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, top)
    grad.addColorStop(0.5, mid)
    grad.addColorStop(1, bot)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }

  function drawStars() {
    for (const star of stars) {
      star.y += star.speed * 0.3
      if (star.y > GROUND_Y - 40) {
        star.y = 0
        star.x = Math.random() * W
      }
      ctx.globalAlpha = star.alpha * (0.7 + 0.3 * Math.sin(Date.now() * 0.001 + star.x))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(star.x, star.y, star.size, star.size)
    }
    ctx.globalAlpha = 1
  }

  function drawGround() {
    ctx.fillStyle = 'rgba(0, 240, 255, 0.04)'
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 12])
    ctx.beginPath()
    ctx.moveTo(0, GROUND_Y)
    ctx.lineTo(W, GROUND_Y)
    ctx.stroke()
    ctx.setLineDash([])

    // Grid lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.03)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, GROUND_Y)
      ctx.stroke()
    }
    for (let y = 0; y < GROUND_Y; y += 40) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  }

  function drawObstacles() {
    for (const obs of obstacles) {
      // Danger glow — brighter as obstacle gets closer to the player
      const dist = obs.x + OBSTACLE_WIDTH - PLAYER_X
      const danger = Math.max(0, Math.min(1, 1 - dist / 250))
      const glow = 16 + danger * 35
      const alpha = 0.6 + danger * 0.4

      ctx.globalAlpha = alpha
      ctx.shadowColor = '#ff0066'
      ctx.shadowBlur = glow

      const grad = ctx.createLinearGradient(obs.x, 0, obs.x + OBSTACLE_WIDTH, 0)
      grad.addColorStop(0, '#ff0066')
      grad.addColorStop(0.5, '#ff00aa')
      grad.addColorStop(1, '#cc0088')
      ctx.fillStyle = grad

      // Top block
      ctx.fillRect(obs.x, 0, OBSTACLE_WIDTH, obs.gapTop)
      // Bottom block
      ctx.fillRect(obs.x, obs.gapBottom, OBSTACLE_WIDTH, H - obs.gapBottom)

      // Glow edge
      ctx.shadowBlur = glow + 12
      ctx.fillStyle = `rgba(255, 0, 102, ${0.1 + danger * 0.25})`
      ctx.fillRect(obs.x - 3, 0, 3, obs.gapTop)
      ctx.fillRect(obs.x - 3, obs.gapBottom, 3, H - obs.gapBottom)

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
    }
  }

  function drawPlayer() {
    const cx = PLAYER_X + PLAYER_SIZE / 2
    const cy = player.y + PLAYER_SIZE / 2
    const pulse = 1 + 0.04 * Math.sin(Date.now() * 0.008)

    ctx.shadowColor = '#00f0ff'
    ctx.shadowBlur = 25 * pulse

    // Main body
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, PLAYER_SIZE / 2 * pulse)
    grad.addColorStop(0, '#66ffff')
    grad.addColorStop(0.5, '#00f0ff')
    grad.addColorStop(1, '#0099cc')
    ctx.fillStyle = grad

    const offset = (PLAYER_SIZE * pulse - PLAYER_SIZE) / 2
    ctx.fillRect(
      PLAYER_X - offset,
      player.y - offset,
      PLAYER_SIZE * pulse,
      PLAYER_SIZE * pulse,
    )

    // Inner glow
    ctx.shadowBlur = 40 * pulse
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)'
    ctx.lineWidth = 2
    ctx.strokeRect(
      PLAYER_X - offset + 2,
      player.y - offset + 2,
      PLAYER_SIZE * pulse - 4,
      PLAYER_SIZE * pulse - 4,
    )

    ctx.shadowBlur = 0

    // Trail when moving
    if (player.vy < -1) {
      ctx.globalAlpha = Math.min(0.3, -player.vy * 0.03)
      ctx.fillStyle = '#00f0ff'
      ctx.shadowBlur = 15
      ctx.shadowColor = '#00f0ff'
      const trailY = player.y - player.vy * 0.5
      ctx.fillRect(PLAYER_X + 4, trailY + 4, PLAYER_SIZE - 8, PLAYER_SIZE - 8)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
    }
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.06
      p.life -= p.decay

      if (p.life <= 0) {
        particles.splice(i, 1)
        continue
      }

      ctx.globalAlpha = p.life
      ctx.shadowBlur = 12
      ctx.shadowColor = p.color
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }

  function drawPopups() {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i]
      p.y += p.vy
      p.life -= 0.025

      if (p.life <= 0) {
        popups.splice(i, 1)
        continue
      }

      ctx.globalAlpha = p.life
      ctx.fillStyle = '#ffd700'
      ctx.font = `bold ${24 + (1 - p.life) * 8}px "Courier New", monospace`
      ctx.textAlign = 'center'
      ctx.shadowColor = '#ffd700'
      ctx.shadowBlur = 20
      ctx.fillText(p.text, p.x, p.y)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
    }
  }

  function drawHUD() {
    // Score with bounce
    const fontSize = Math.round(20 * scoreScale)
    ctx.fillStyle = scoreScale > 1.1 ? '#ffd700' : 'rgba(255, 255, 255, 0.9)'
    ctx.font = `bold ${fontSize}px "Courier New", monospace`
    ctx.textAlign = 'left'
    ctx.shadowColor = scoreScale > 1.1 ? '#ffd700' : 'rgba(0, 240, 255, 0.5)'
    ctx.shadowBlur = scoreScale > 1.1 ? 20 : 10
    ctx.fillText(String(score), 16, 36)
    ctx.shadowBlur = 0

    // Best
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.font = '11px "Courier New", monospace'
    ctx.textAlign = 'right'
    ctx.fillText('BEST ' + bestScore, W - 16, 24)

    // Speed indicator
    const pct = Math.min(1, (speed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED))
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.fillRect(W - 16, 32, 4, 40)
    ctx.fillStyle = `rgba(255, ${Math.round(255 - pct * 200)}, ${Math.round(100 - pct * 100)}, 0.6)`
    ctx.fillRect(W - 16, 32 + 40 * (1 - pct), 4, 40 * pct)
  }

  function drawFlash() {
    if (scoreFlash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${scoreFlash * 0.015})`
      ctx.fillRect(0, 0, W, H)
    }
    if (deathFlash > 0) {
      ctx.fillStyle = `rgba(255, 0, 50, ${deathFlash * 0.04})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  function render() {
    ctx.save()

    // Screen shake
    if (shakeAmount > 0.5) {
      ctx.translate(
        (Math.random() - 0.5) * shakeAmount * 2,
        (Math.random() - 0.5) * shakeAmount * 2,
      )
    }

    drawBackground()
    drawStars()
    drawGround()
    drawObstacles()
    drawPlayer()
    drawParticles()
    drawPopups()
    drawHUD()
    drawFlash()

    ctx.restore()
  }

  // ===================== GAME LOOP =====================
  let lastTime = 0
  const STEP = 1000 / 60
  let accumulator = 0

  function gameLoop(timestamp) {
    const dt = timestamp - lastTime
    lastTime = timestamp

    // Avoid spiral of death
    const clampedDt = Math.min(dt, 100)
    accumulator += clampedDt

    while (accumulator >= STEP) {
      update(STEP)
      accumulator -= STEP
    }

    render()
    requestAnimationFrame(gameLoop)
  }

  // ===================== INPUT =====================
  // Keyboard — hold space to hover
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault()
      if (!inputPressed) jump()
      inputPressed = true
    }
  })
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Space') {
      inputPressed = false
    }
  })

  // Mouse/touch — hold to hover
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault()
    if (!inputPressed) jump()
    inputPressed = true
  })
  canvas.addEventListener('mouseup', () => { inputPressed = false })
  canvas.addEventListener('mouseleave', () => { inputPressed = false })

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault()
    if (!inputPressed) jump()
    inputPressed = true
  }, { passive: false })
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault()
    inputPressed = false
  }, { passive: false })
  canvas.addEventListener('touchcancel', () => { inputPressed = false })

  // Overlay clicks — start / restart
  startOverlay.addEventListener('click', jump)
  gameOverOverlay.addEventListener('click', jump)

  // Sound toggle
  soundToggle.addEventListener('click', (e) => {
    e.stopPropagation()
    soundOn = !soundOn
    soundToggle.textContent = soundOn ? '🔊' : '🔇'
  })

  // Resume AudioContext on any interaction
  document.addEventListener('click', () => initAudio(), { once: true })
  document.addEventListener('touchstart', () => initAudio(), { once: true })

  // ===================== START =====================
  resetGame()
  requestAnimationFrame((ts) => {
    lastTime = ts
    gameLoop(ts)
  })
})()
