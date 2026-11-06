import { t } from '../i18n'

export function ErrorFallback() {
  return (
    <main role="alert" className="mx-auto max-w-[520px] p-6">
      <h1 className="font-display text-title-l">{t('dataError.title')}</h1>
      <p className="mt-2 text-body-m text-text-muted">{t('dataError.body')}</p>
      <button type="button" className="mt-4 min-h-11 rounded-pill bg-action px-6 text-label-l text-on-action" onClick={() => location.reload()}>
        {t('common.tryAgain')}
      </button>
    </main>
  )
}
