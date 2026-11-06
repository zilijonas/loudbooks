import { motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { Ic } from '../../components/icons'
import { Button } from '../../components/ui/Button'
import { Logo } from '../../components/ui/Navigation'
import { useIsDesktop } from '../../components/ui/Overlays'
import { markWelcomeDone } from '../../features/settings/settings'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { isStandalone } from '../../app/env'
import { useUi } from '../../app/store'
import mono from '../../components/brand/symbol-mono-ink.svg'

/** First launch only: shown until "Open my library" is pressed once. */
export function WelcomePage() {
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const ready = useUi((s) => s.pwa.offlineReady)
  const open = async () => {
    await markWelcomeDone().catch(() => {})
    navigate('/', { replace: true })
  }
  return (
    <div className="lb-welcome">
      <div className="lb-welcome-text">
        <Logo size="lg" />
        <h1>{t('welcome.tagline')}</h1>
        <p>{t('welcome.intro')}</p>
        <ul className="lb-points">
          {([1, 2, 3] as const).map((n) => (
            <li key={n}>
              <span>{n}</span>
              <span><strong>{t(`welcome.point${n}Title`)}</strong>{t(`welcome.point${n}`)}</span>
            </li>
          ))}
        </ul>
        {!isStandalone() && !desktop && (
          <div className="lb-installcard">
            <strong>{t('welcome.installTitle')}</strong>
            <span>{t('welcome.installBody')}</span>
            <Button variant="secondary" icon="share" onClick={() => useUi.setState({ installOpen: true })}>{t('welcome.installCta')}</Button>
          </div>
        )}
        <div className="lb-welcome-open">
          <Button size="lg" fullWidth onClick={() => void open()}>{t('welcome.open')}</Button>
          <div role="status" className="lb-readiness" data-ready={ready || undefined}>
            <Ic name={ready ? 'check' : 'spin'} size={18} />
            <span>{t(ready ? 'welcome.ready' : 'welcome.preparing')}</span>
          </div>
        </div>
      </div>
      {desktop && <WelcomeArt />}
    </div>
  )
}

/** Three covers that bob in once. Decorative. */
function WelcomeArt() {
  const p = usePreset()
  const reduce = !('transform' in p.page.initial)
  const covers = [
    { r: '-8deg', delay: 0.08, style: { left: '4%', top: 60, background: '#2A1E17', justifyContent: 'space-between' }, body: <><div style={{ width: 44, height: 44, borderRadius: '50%', background: '#FFC93C' }} /><div style={{ height: 10, width: '60%', borderRadius: 9, background: '#FBF4EA' }} /></> },
    { r: '6deg', delay: 0.16, style: { right: '6%', top: 20, background: '#FFC93C', justifyContent: 'flex-end', gap: 10 }, body: <><div style={{ height: 14, width: '80%', borderRadius: 9, background: '#2A1E17' }} /><div style={{ height: 14, width: '55%', borderRadius: 9, background: '#2A1E17' }} /></> },
    { r: '-1deg', delay: 0, style: { left: '28%', top: 120, background: '#FF6B4A', alignItems: 'center', justifyContent: 'center' }, body: <img src={mono} alt="" style={{ width: '46%' }} /> },
  ]
  return (
    <div className="lb-welcome-art" aria-hidden="true">
      {covers.map((c) => (
        <motion.div
          key={c.r}
          style={c.style}
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: `translateY(18px) rotate(${c.r})` }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, transform: `translateY(0px) rotate(${c.r})` }}
          transition={reduce ? p.springSoft : { type: 'spring', duration: 0.7, bounce: 0.35, delay: c.delay }}
        >
          {c.body}
        </motion.div>
      ))}
    </div>
  )
}
