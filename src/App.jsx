import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import './App.css'

const ENV_API_KEY = import.meta.env.VITE_HF_API_KEY
const HF_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0'
const HF_API_URL = import.meta.env.DEV
  ? `/api/hf-inference/models/${HF_MODEL}`
  : `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`
const MAX_CHARS = 500

const hasEnvKey = ENV_API_KEY && ENV_API_KEY !== 'your_huggingface_api_key_here'

const EXAMPLE_PROMPTS = [
  'A cat astronaut floating in space',
  'Cyberpunk city at sunset, neon lights',
  'Watercolor painting of a mountain lake',
  'A robot reading a book in a library',
  'Dreamy forest with glowing mushrooms',
]

/* ── Starfield canvas ── */
function StarField() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Generate stars
    const STAR_COUNT = 220
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      r:     Math.random() * 1.4 + 0.2,
      speed: Math.random() * 0.25 + 0.05,
      alpha: Math.random(),
      dAlpha: (Math.random() * 0.008 + 0.002) * (Math.random() < 0.5 ? 1 : -1),
    }))

    // Shooting stars
    const shoots = []
    const spawnShoot = () => {
      shoots.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.5,
        len: Math.random() * 120 + 60,
        speed: Math.random() * 6 + 4,
        alpha: 1,
        angle: Math.PI / 5,
      })
    }
    const shootInterval = setInterval(spawnShoot, 2800)

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Stars
      stars.forEach(s => {
        s.alpha += s.dAlpha
        if (s.alpha <= 0 || s.alpha >= 1) s.dAlpha *= -1
        s.alpha = Math.max(0, Math.min(1, s.alpha))
        s.y += s.speed
        if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width }

        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${s.alpha})`
        ctx.fill()
      })

      // Shooting stars
      for (let i = shoots.length - 1; i >= 0; i--) {
        const s = shoots[i]
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len)
        const grad = ctx.createLinearGradient(
          s.x, s.y,
          s.x - Math.cos(s.angle) * s.len,
          s.y - Math.sin(s.angle) * s.len
        )
        grad.addColorStop(0, `rgba(200,180,255,${s.alpha})`)
        grad.addColorStop(1, 'rgba(200,180,255,0)')
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.5
        ctx.stroke()

        s.x += Math.cos(s.angle) * s.speed
        s.y += Math.sin(s.angle) * s.speed
        s.alpha -= 0.018
        if (s.alpha <= 0) shoots.splice(i, 1)
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(shootInterval)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="starfield" />
}

/* ── Animation variants ── */
const fadeUp   = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }
const fadeIn   = { hidden: { opacity: 0 },         show: { opacity: 1 } }
const scaleIn  = { hidden: { opacity: 0, scale: 0.93 }, show: { opacity: 1, scale: 1 } }

export default function App() {
  const [prompt, setPrompt]           = useState('')
  const [imageUrl, setImageUrl]       = useState(null)
  const [usedPrompt, setUsedPrompt]   = useState('')
  const [isLoading, setIsLoading]     = useState(false)
  const [error, setError]             = useState('')
  const [apiKey, setApiKey]           = useState(hasEnvKey ? ENV_API_KEY : '')
  const [showModal, setShowModal]     = useState(false)
  const [modalKeyInput, setModalKeyInput] = useState('')

  useEffect(() => {
    if (hasEnvKey) return
    const stored = localStorage.getItem('hf_api_key')
    if (stored) setApiKey(stored)
    else setShowModal(true)
  }, [])

  const saveApiKey = useCallback(() => {
    const trimmed = modalKeyInput.trim()
    if (!trimmed) return
    localStorage.setItem('hf_api_key', trimmed)
    setApiKey(trimmed)
    setShowModal(false)
    setModalKeyInput('')
  }, [modalKeyInput])

  const generateImage = useCallback(async () => {
    if (!prompt.trim() || !apiKey) return
    setIsLoading(true)
    setError('')
    setImageUrl(null)

    try {
      const response = await fetch(HF_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt.trim(),
          parameters: { width: 512, height: 512 },
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        if (response.status === 401) throw new Error('Invalid API key. Please update your Hugging Face token.')
        if (response.status === 503) throw new Error('Model is loading — please try again in ~30 seconds.')
        throw new Error(errData.error || `Request failed (${response.status})`)
      }

      const blob = await response.blob()
      setImageUrl(URL.createObjectURL(blob))
      setUsedPrompt(prompt.trim())
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [prompt, apiKey])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateImage() }
  }

  const downloadImage = () => {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `imaginate-${Date.now()}.png`
    a.click()
  }

  return (
    <>
      <StarField />

      <div className="app-container">
        {/* Header */}
        <motion.header
          className="header"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <motion.div
            className="header__icon"
            animate={{ y: [0, -10, 0], rotate: [0, 4, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            🎨
          </motion.div>
          <h1 className="header__title">Imaginate</h1>
          <p className="header__subtitle">Turn your words into stunning AI-generated art</p>
        </motion.header>

        {/* Prompt Card */}
        <motion.div
          className="prompt-card"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
        >
          <label className="prompt-card__label" htmlFor="prompt-input">Describe your image</label>
          <div className="prompt-card__input-wrapper">
            <textarea
              id="prompt-input"
              className="prompt-card__textarea"
              placeholder="A magical castle floating among the clouds at golden hour..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={3}
            />
            <div className="prompt-card__char-count">{prompt.length} / {MAX_CHARS}</div>
          </div>
          <div className="prompt-card__actions">
            <motion.button
              id="generate-button"
              className="generate-btn"
              onClick={generateImage}
              disabled={isLoading || !prompt.trim() || !apiKey}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              {isLoading ? (
                <><div className="spinner" />Generating…</>
              ) : (
                <><span className="generate-btn__icon">✨</span>Generate</>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="error-message"
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={{ duration: 0.3 }}
            >
              <span className="error-message__icon">⚠️</span>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              className="loading-section"
              variants={fadeIn}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={{ duration: 0.3 }}
            >
              <div className="loading-section__spinner" />
              <motion.p
                className="loading-section__text"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                Creating your masterpiece…
              </motion.p>
              <div className="loading-section__progress">
                <div className="loading-section__progress-bar" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {imageUrl && !isLoading && (
            <motion.div
              className="result-section"
              variants={scaleIn}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div className="result-section__image-card">
                <img className="result-section__image" src={imageUrl} alt={usedPrompt} />
                <div className="result-section__meta">
                  <span className="result-section__prompt-text" title={usedPrompt}>"{usedPrompt}"</span>
                  <motion.button
                    className="result-section__download-btn"
                    onClick={downloadImage}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    ⬇ Download
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        <AnimatePresence>
          {!imageUrl && !isLoading && !error && (
            <motion.div
              className="empty-state"
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="empty-state__icon">🖼️</div>
              <p className="empty-state__text">
                Your generated image will appear here.<br />
                Try one of these prompts to get started:
              </p>
              <div className="empty-state__examples">
                {EXAMPLE_PROMPTS.map((ex, i) => (
                  <motion.button
                    key={ex}
                    className="empty-state__example-chip"
                    onClick={() => setPrompt(ex)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 + i * 0.07 }}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    {ex}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <motion.footer
        className="footer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        Powered by{' '}
        <a href="https://huggingface.co" target="_blank" rel="noopener noreferrer">Hugging Face</a>
        {' '}· Stable Diffusion XL
      </motion.footer>

      {/* Settings Button */}
      {!hasEnvKey && (
        <motion.button
          className="settings-btn"
          onClick={() => setShowModal(true)}
          title="API Key Settings"
          aria-label="Open API key settings"
          whileHover={{ rotate: 65, scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1, type: 'spring' }}
        >
          ⚙️
        </motion.button>
      )}

      {/* API Key Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            className="modal-overlay"
            variants={fadeIn}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={{ duration: 0.25 }}
            onClick={() => apiKey && setShowModal(false)}
          >
            <motion.div
              className="modal"
              variants={scaleIn}
              initial="hidden"
              animate="show"
              exit="hidden"
              transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal__header">
                <div className="modal__icon">🔑</div>
                <h2 className="modal__title">Enter Your API Key</h2>
                <p className="modal__description">
                  Provide your Hugging Face access token to generate images.
                  Your key is stored locally and never sent to any third party.
                </p>
              </div>
              <div className="modal__input-group">
                <label className="modal__label" htmlFor="api-key-input">Hugging Face Token</label>
                <input
                  id="api-key-input"
                  className="modal__input"
                  type="password"
                  placeholder="hf_xxxxxxxxxxxxxxxxxx"
                  value={modalKeyInput}
                  onChange={(e) => setModalKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
                />
                <p className="modal__hint">
                  Get a free token at{' '}
                  <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer">
                    huggingface.co/settings/tokens
                  </a>
                </p>
              </div>
              <motion.button
                className="modal__submit"
                onClick={saveApiKey}
                disabled={!modalKeyInput.trim()}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
              >
                Save & Continue
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
